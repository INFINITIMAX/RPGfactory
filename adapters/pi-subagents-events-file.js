'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { TextDecoder } = require('node:util');
const { normalizePiSubagentsEvent } = require('./pi-subagents-events-contract');

const DEFAULT_MAX_READ_BYTES = 256 * 1024;
const MAX_READ_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_EVENT_BYTES = 64 * 1024;
const MAX_EVENT_BYTES = 1024 * 1024;
const DEFAULT_MAX_LINES = 200;
const MAX_LINES = 1000;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validRunId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
    value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}

function validLimit(value, fallback, maximum) {
  if (value === undefined) return fallback;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : null;
}

function validCursor(value) {
  if (value === undefined || value === null) return null;
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.some((key) => key !== 'version' && key !== 'fileKey' && key !== 'offset' && key !== 'discardingOversizedLine') ||
      value.version !== 1 || typeof value.fileKey !== 'string' || !/^[a-f0-9]{64}$/.test(value.fileKey) ||
      !Number.isSafeInteger(value.offset) || value.offset < 0 ||
      (value.discardingOversizedLine !== undefined && value.discardingOversizedLine !== true)) return false;
  return value.discardingOversizedLine ?
    { version: 1, fileKey: value.fileKey, offset: value.offset, discardingOversizedLine: true } :
    { version: 1, fileKey: value.fileKey, offset: value.offset };
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function lstat(filePath) {
  try {
    return { stat: fs.lstatSync(filePath) };
  } catch (error) {
    return { error };
  }
}

function sameNode(first, second) {
  return first.dev === second.dev && first.ino === second.ino;
}

function addWarning(warnings, code) {
  if (!warnings.includes(code)) warnings.push(code);
}

function cursorFor(fileKey, offset, discardingOversizedLine) {
  const cursor = { version: 1, fileKey, offset };
  if (discardingOversizedLine) cursor.discardingOversizedLine = true;
  return cursor;
}

function fileKeyFor(stat) {
  return crypto.createHash('sha256').update(`${stat.dev}:${stat.ino}:${stat.birthtimeMs}`).digest('hex');
}

function canonicalRoot(root, warnings) {
  const initial = lstat(root);
  if (!initial.stat) {
    addWarning(warnings, 'ROOT_UNAVAILABLE');
    return null;
  }
  if (initial.stat.isSymbolicLink()) {
    addWarning(warnings, 'ROOT_LINK_REJECTED');
    return null;
  }
  if (!initial.stat.isDirectory()) {
    addWarning(warnings, 'ROOT_NOT_DIRECTORY');
    return null;
  }
  let canonical;
  try {
    canonical = fs.realpathSync(root);
  } catch {
    addWarning(warnings, 'ROOT_UNAVAILABLE');
    return null;
  }
  const current = lstat(root);
  const canonicalStat = lstat(canonical);
  if (!current.stat || !canonicalStat.stat) {
    addWarning(warnings, 'ROOT_UNAVAILABLE');
    return null;
  }
  if (current.stat.isSymbolicLink() || canonicalStat.stat.isSymbolicLink() || !current.stat.isDirectory() ||
      !canonicalStat.stat.isDirectory() || !sameNode(initial.stat, current.stat) || !sameNode(initial.stat, canonicalStat.stat)) {
    addWarning(warnings, 'ROOT_LINK_REJECTED');
    return null;
  }
  return canonical;
}

function canonicalRunDirectory(runDirectory, root, warnings) {
  const initial = lstat(runDirectory);
  if (!initial.stat || initial.stat.isSymbolicLink() || !initial.stat.isDirectory()) {
    addWarning(warnings, 'RUN_DIRECTORY_REJECTED');
    return null;
  }
  let canonical;
  try {
    canonical = fs.realpathSync(runDirectory);
  } catch {
    addWarning(warnings, 'RUN_DIRECTORY_REJECTED');
    return null;
  }
  const current = lstat(runDirectory);
  const canonicalStat = lstat(canonical);
  if (!current.stat || !canonicalStat.stat || current.stat.isSymbolicLink() || canonicalStat.stat.isSymbolicLink() ||
      !current.stat.isDirectory() || !canonicalStat.stat.isDirectory() || !inside(root, canonical) ||
      !sameNode(initial.stat, current.stat) || !sameNode(initial.stat, canonicalStat.stat)) {
    addWarning(warnings, 'RUN_DIRECTORY_REJECTED');
    return null;
  }
  return canonical;
}

function emptyResult(expectedRunId, cursor, warnings) {
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      source: 'pi-subagents-events-file',
      runId: expectedRunId,
      events: [],
      cursor,
      hasMore: false,
      incompleteLine: false,
      reset: null,
      limits: { bytes: false, lines: false },
      warnings
    }
  };
}

function readPiSubagentsEvents(options) {
  if (!isPlainObject(options) || typeof options.root !== 'string' || !path.isAbsolute(options.root) ||
      typeof options.runDirectory !== 'string' || !path.isAbsolute(options.runDirectory) || !validRunId(options.expectedRunId)) {
    return { ok: false, error: { code: 'INVALID_OPTIONS' } };
  }
  const maxReadBytes = validLimit(options.maxReadBytes, DEFAULT_MAX_READ_BYTES, MAX_READ_BYTES);
  const maxEventBytes = validLimit(options.maxEventBytes, DEFAULT_MAX_EVENT_BYTES, MAX_EVENT_BYTES);
  const maxLines = validLimit(options.maxLines, DEFAULT_MAX_LINES, MAX_LINES);
  const inputCursor = validCursor(options.cursor);
  if (maxReadBytes === null || maxEventBytes === null || maxLines === null || inputCursor === false || maxReadBytes < maxEventBytes + 2 ||
      !inside(options.root, options.runDirectory)) {
    return { ok: false, error: { code: 'INVALID_OPTIONS' } };
  }

  const warnings = [];
  const canonicalRootPath = canonicalRoot(options.root, warnings);
  if (!canonicalRootPath) return emptyResult(options.expectedRunId, inputCursor, warnings);
  const canonicalRunPath = canonicalRunDirectory(options.runDirectory, canonicalRootPath, warnings);
  if (!canonicalRunPath) return emptyResult(options.expectedRunId, inputCursor, warnings);

  const eventsPath = path.join(canonicalRunPath, 'events.jsonl');
  const initial = lstat(eventsPath);
  if (!initial.stat) {
    addWarning(warnings, initial.error && initial.error.code === 'ENOENT' ? 'EVENTS_MISSING' : 'EVENTS_READ_FAILED');
    return emptyResult(options.expectedRunId, inputCursor, warnings);
  }
  if (initial.stat.isSymbolicLink()) {
    addWarning(warnings, 'EVENTS_LINK_REJECTED');
    return emptyResult(options.expectedRunId, inputCursor, warnings);
  }
  if (!initial.stat.isFile()) {
    addWarning(warnings, 'EVENTS_NOT_FILE');
    return emptyResult(options.expectedRunId, inputCursor, warnings);
  }

  let canonicalFile;
  try {
    canonicalFile = fs.realpathSync(eventsPath);
  } catch {
    addWarning(warnings, 'EVENTS_READ_FAILED');
    return emptyResult(options.expectedRunId, inputCursor, warnings);
  }
  if (!inside(canonicalRootPath, canonicalFile)) {
    addWarning(warnings, 'EVENTS_LINK_REJECTED');
    return emptyResult(options.expectedRunId, inputCursor, warnings);
  }

  let flags = fs.constants.O_RDONLY;
  if (typeof fs.constants.O_NOFOLLOW === 'number') flags |= fs.constants.O_NOFOLLOW;
  let descriptor;
  try {
    descriptor = fs.openSync(eventsPath, flags);
  } catch (error) {
    addWarning(warnings, error && error.code === 'ELOOP' ? 'EVENTS_LINK_REJECTED' : 'EVENTS_READ_FAILED');
    return emptyResult(options.expectedRunId, inputCursor, warnings);
  }

  try {
    let opened;
    try {
      opened = fs.fstatSync(descriptor);
    } catch {
      addWarning(warnings, 'EVENTS_READ_FAILED');
      return emptyResult(options.expectedRunId, inputCursor, warnings);
    }
    if (!sameNode(initial.stat, opened)) {
      addWarning(warnings, 'EVENTS_LINK_REJECTED');
      return emptyResult(options.expectedRunId, inputCursor, warnings);
    }
    if (!opened.isFile()) {
      addWarning(warnings, 'EVENTS_NOT_FILE');
      return emptyResult(options.expectedRunId, inputCursor, warnings);
    }

    const fileKey = fileKeyFor(opened);
    let baseOffset = 0;
    let discarding = false;
    let reset = null;
    if (inputCursor) {
      if (inputCursor.fileKey !== fileKey) {
        reset = 'rotated';
        addWarning(warnings, 'EVENTS_ROTATED');
      } else if (opened.size < inputCursor.offset) {
        reset = 'truncated';
        addWarning(warnings, 'EVENTS_TRUNCATED');
      } else {
        baseOffset = inputCursor.offset;
        discarding = Boolean(inputCursor.discardingOversizedLine);
      }
    }

    const snapshotSize = opened.size;
    const toRead = Math.min(maxReadBytes, Math.max(0, snapshotSize - baseOffset));
    const buffer = Buffer.alloc(toRead);
    let bytesRead = 0;
    try {
      while (bytesRead < toRead) {
        const count = fs.readSync(descriptor, buffer, bytesRead, toRead - bytesRead, baseOffset + bytesRead);
        if (count === 0) break;
        bytesRead += count;
      }
    } catch {
      addWarning(warnings, 'EVENTS_READ_FAILED');
      const result = emptyResult(options.expectedRunId, cursorFor(fileKey, baseOffset, discarding), warnings);
      result.value.reset = reset;
      return result;
    }
    if (bytesRead !== toRead) {
      addWarning(warnings, 'EVENTS_READ_FAILED');
      addWarning(warnings, 'EVENTS_TRUNCATED');
      const result = emptyResult(options.expectedRunId, cursorFor(fileKey, 0), warnings);
      result.value.reset = 'truncated';
      return result;
    }

    const result = emptyResult(options.expectedRunId, cursorFor(fileKey, baseOffset, discarding), warnings);
    result.value.reset = reset;
    const data = buffer.subarray(0, bytesRead);
    let index = 0;
    let lines = 0;

    function consumeLine(line) {
      lines += 1;
      if (line.length && line[line.length - 1] === 13) line = line.subarray(0, -1);
      if (line.length > maxEventBytes) {
        addWarning(warnings, 'EVENT_LINE_TOO_LARGE');
        return;
      }
      if (!line.length) return;
      let text;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(line);
      } catch {
        addWarning(warnings, 'EVENT_ENCODING_INVALID');
        return;
      }
      let raw;
      try {
        raw = JSON.parse(text);
      } catch {
        addWarning(warnings, 'EVENT_JSON_INVALID');
        return;
      }
      const normalized = normalizePiSubagentsEvent(raw, { expectedRunId: options.expectedRunId });
      if (normalized.ok) {
        result.value.events.push(normalized.value);
      } else if (normalized.error.code === 'UNSUPPORTED_EVENT') {
        addWarning(warnings, 'EVENT_UNSUPPORTED');
      } else if (normalized.error.code === 'RUN_ID_MISMATCH') {
        addWarning(warnings, 'EVENT_RUN_ID_MISMATCH');
      } else {
        addWarning(warnings, 'EVENT_INVALID');
      }
    }

    if (discarding) {
      const newline = data.indexOf(10);
      if (newline === -1) {
        result.value.cursor = cursorFor(fileKey, baseOffset + data.length, true);
        result.value.limits.bytes = baseOffset + data.length < snapshotSize;
        result.value.hasMore = baseOffset + data.length < snapshotSize;
        return result;
      }
      if (lines >= maxLines) {
        result.value.limits.lines = true;
        result.value.hasMore = true;
        return result;
      }
      consumeLine(Buffer.alloc(0));
      index = newline + 1;
      discarding = false;
      result.value.cursor = cursorFor(fileKey, baseOffset + index);
    }

    while (index < data.length) {
      if (lines >= maxLines) {
        result.value.limits.lines = true;
        result.value.hasMore = true;
        break;
      }
      const newline = data.indexOf(10, index);
      if (newline === -1) {
        const remaining = data.length - index;
        const endsWithCarriageReturn = remaining > 0 && data[data.length - 1] === 13;
        const comparablePayloadBytes = remaining - (endsWithCarriageReturn ? 1 : 0);
        if (comparablePayloadBytes > maxEventBytes) {
          addWarning(warnings, 'EVENT_LINE_TOO_LARGE');
          result.value.cursor = cursorFor(fileKey, baseOffset + index + remaining, true);
          result.value.limits.bytes = baseOffset + data.length < snapshotSize;
          result.value.hasMore = baseOffset + data.length < snapshotSize;
        } else if (endsWithCarriageReturn) {
          if (baseOffset + data.length === snapshotSize) {
            result.value.incompleteLine = true;
          } else {
            result.value.limits.bytes = true;
            result.value.hasMore = true;
          }
        } else if (baseOffset + index + remaining === snapshotSize) {
          result.value.incompleteLine = remaining > 0;
        } else {
          result.value.limits.bytes = true;
          result.value.hasMore = true;
        }
        break;
      }
      const line = data.subarray(index, newline);
      consumeLine(line);
      index = newline + 1;
      result.value.cursor = cursorFor(fileKey, baseOffset + index);
    }

    if (index === data.length && baseOffset + index < snapshotSize && !result.value.hasMore) {
      result.value.limits.bytes = true;
      result.value.hasMore = true;
    }
    return result;
  } finally {
    try {
      fs.closeSync(descriptor);
    } catch {
      // The descriptor cannot be retried safely; its read result remains classified.
    }
  }
}

module.exports = { readPiSubagentsEvents };
