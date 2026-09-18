'use strict';

const path = require('path');
const { scanPiSubagentsStatuses } = require('./adapters/pi-subagents-files');
const { readPiSubagentsEvents } = require('./adapters/pi-subagents-events-file');

const OPTION_KEYS = new Set([
  'root', 'runDirectory', 'expectedRunId', 'observedAt', 'maxStatusBytes',
  'maxReadBytes', 'maxEventBytes', 'maxLines'
]);
const EVENT_SOURCE_WARNINGS = new Set([
  'ROOT_UNAVAILABLE', 'ROOT_LINK_REJECTED', 'ROOT_NOT_DIRECTORY',
  'RUN_DIRECTORY_REJECTED', 'EVENTS_MISSING', 'EVENTS_READ_FAILED',
  'EVENTS_LINK_REJECTED', 'EVENTS_NOT_FILE'
]);
const WARNING_CODES = new Set([
  ...EVENT_SOURCE_WARNINGS,
  'STATUS_MISSING', 'STATUS_READ_FAILED', 'STATUS_LINK_REJECTED', 'STATUS_NOT_FILE',
  'STATUS_TOO_LARGE', 'STATUS_JSON_INVALID', 'STATUS_INVALID', 'RUN_CANDIDATE_REJECTED',
  'DUPLICATE_RUN_ID', 'DUPLICATE_ROOT', 'EVENTS_ROTATED', 'EVENTS_TRUNCATED',
  'EVENT_LINE_TOO_LARGE', 'EVENT_ENCODING_INVALID', 'EVENT_JSON_INVALID',
  'EVENT_UNSUPPORTED', 'EVENT_RUN_ID_MISMATCH', 'EVENT_INVALID'
]);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validRunId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 &&
    value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}

function validPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function invalidOptions() {
  return { ok: false, error: { code: 'INVALID_OPTIONS' } };
}

function failure(reason, warnings = [], runId) {
  const value = { schemaVersion: 1, source: 'pi-subagents-ingestion', committed: false, reason, warnings };
  if (runId) value.runId = runId;
  return { ok: true, value };
}

function sourceReadFailed() {
  return { ok: false, error: { code: 'SOURCE_READ_FAILED' } };
}

function persistenceFailed() {
  return { ok: false, error: { code: 'PERSISTENCE_FAILED' } };
}

function publicCursor(cursor) {
  if (!isPlainObject(cursor) || cursor.version !== 1 || typeof cursor.fileKey !== 'string' ||
      !/^[a-f0-9]{64}$/.test(cursor.fileKey) || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0 ||
      (cursor.discardingOversizedLine !== undefined && cursor.discardingOversizedLine !== true)) return null;
  const value = { version: 1, fileKey: cursor.fileKey, offset: cursor.offset };
  if (cursor.discardingOversizedLine === true) value.discardingOversizedLine = true;
  return value;
}

function warningsFrom(value) {
  return Array.isArray(value) ? [...new Set(value.filter((warning) => WARNING_CODES.has(warning)))] : [];
}

function validLimit(value, maximum) {
  return value === undefined || (validPositiveInteger(value) && value <= maximum);
}

function validIngestOptions(options) {
  if (!isPlainObject(options) || Object.keys(options).some((key) => !OPTION_KEYS.has(key)) ||
      typeof options.root !== 'string' || !path.isAbsolute(options.root) ||
      typeof options.runDirectory !== 'string' || !path.isAbsolute(options.runDirectory) ||
      !inside(options.root, options.runDirectory) || !validRunId(options.expectedRunId)) return false;
  if (options.observedAt !== undefined &&
      !(typeof options.observedAt === 'number' && Number.isFinite(options.observedAt) &&
        options.observedAt >= 0 && options.observedAt <= Number.MAX_SAFE_INTEGER)) return false;
  if (!validLimit(options.maxStatusBytes, 4 * 1024 * 1024) ||
      !validLimit(options.maxReadBytes, 4 * 1024 * 1024) ||
      !validLimit(options.maxEventBytes, 1024 * 1024) || !validLimit(options.maxLines, 1000)) return false;
  const maxReadBytes = options.maxReadBytes === undefined ? 256 * 1024 : options.maxReadBytes;
  const maxEventBytes = options.maxEventBytes === undefined ? 64 * 1024 : options.maxEventBytes;
  return maxReadBytes >= maxEventBytes + 2;
}

function createPiIngestionCoordinator(options = {}) {
  const validFactory = isPlainObject(options) && Object.keys(options).every((key) =>
    key === 'store' || key === 'scanStatuses' || key === 'readEvents') &&
    options.store && typeof options.store.getCursor === 'function' && typeof options.store.commitObservation === 'function' &&
    (options.scanStatuses === undefined || typeof options.scanStatuses === 'function') &&
    (options.readEvents === undefined || typeof options.readEvents === 'function');
  const store = validFactory ? options.store : null;
  const scanStatuses = validFactory ? (options.scanStatuses || scanPiSubagentsStatuses) : null;
  const readEvents = validFactory ? (options.readEvents || readPiSubagentsEvents) : null;

  function ingestRun(ingestOptions) {
    if (!validFactory || !validIngestOptions(ingestOptions)) return invalidOptions();

    let cursor;
    try {
      cursor = store.getCursor(ingestOptions.expectedRunId);
    } catch {
      return persistenceFailed();
    }

    const statusOptions = { roots: [ingestOptions.runDirectory], maxRoots: 1, maxRuns: 1 };
    if (ingestOptions.observedAt !== undefined) statusOptions.observedAt = ingestOptions.observedAt;
    if (ingestOptions.maxStatusBytes !== undefined) statusOptions.maxStatusBytes = ingestOptions.maxStatusBytes;
    let statusResult;
    try {
      statusResult = scanStatuses(statusOptions);
    } catch {
      return sourceReadFailed();
    }
    if (!statusResult || statusResult.ok !== true || !statusResult.value || !Array.isArray(statusResult.value.runs)) {
      return sourceReadFailed();
    }

    const snapshots = statusResult.value.runs;
    const statusWarnings = warningsFrom(statusResult.value.warnings);
    if (snapshots.length === 0) return failure('SNAPSHOT_MISSING', statusWarnings, ingestOptions.expectedRunId);
    if (snapshots.length !== 1 || !snapshots[0] || !snapshots[0].root || snapshots[0].root.nativeId !== ingestOptions.expectedRunId) {
      return failure('SNAPSHOT_MISMATCH', statusWarnings, ingestOptions.expectedRunId);
    }
    const snapshot = snapshots[0];

    const eventOptions = {
      root: ingestOptions.root,
      runDirectory: ingestOptions.runDirectory,
      expectedRunId: ingestOptions.expectedRunId,
      cursor
    };
    for (const key of ['maxReadBytes', 'maxEventBytes', 'maxLines']) {
      if (ingestOptions[key] !== undefined) eventOptions[key] = ingestOptions[key];
    }
    let eventsResult;
    try {
      eventsResult = readEvents(eventOptions);
    } catch {
      return sourceReadFailed();
    }
    if (!eventsResult || eventsResult.ok !== true || !eventsResult.value) return sourceReadFailed();

    const eventValue = eventsResult.value;
    const eventWarnings = warningsFrom(eventValue.warnings);
    if (eventWarnings.some((warning) => EVENT_SOURCE_WARNINGS.has(warning))) {
      return failure('EVENTS_UNAVAILABLE', eventWarnings, ingestOptions.expectedRunId);
    }
    const nextCursor = publicCursor(eventValue.cursor);
    if (!Array.isArray(eventValue.events) || !nextCursor || typeof eventValue.hasMore !== 'boolean' ||
        typeof eventValue.incompleteLine !== 'boolean' || (eventValue.reset !== null && eventValue.reset !== 'rotated' && eventValue.reset !== 'truncated')) {
      return sourceReadFailed();
    }

    const observation = { snapshot, events: eventValue.events, cursor: nextCursor };
    if (eventValue.reset === 'truncated') observation.cursorReset = 'truncated';
    let committed;
    try {
      committed = store.commitObservation(observation);
    } catch {
      return persistenceFailed();
    }
    if (!committed || !committed.events || !validPositiveOrZero(committed.events.inserted) ||
        !validPositiveOrZero(committed.events.duplicate)) return persistenceFailed();

    return {
      ok: true,
      value: {
        schemaVersion: 1,
        source: 'pi-subagents-ingestion',
        runId: ingestOptions.expectedRunId,
        committed: true,
        cursor: nextCursor,
        inserted: committed.events.inserted,
        duplicate: committed.events.duplicate,
        read: eventValue.events.length,
        hasMore: eventValue.hasMore,
        incompleteLine: eventValue.incompleteLine,
        reset: eventValue.reset,
        warnings: [...new Set([...statusWarnings, ...eventWarnings])]
      }
    };
  }

  return { ingestRun };
}

function validPositiveOrZero(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

module.exports = { createPiIngestionCoordinator };
