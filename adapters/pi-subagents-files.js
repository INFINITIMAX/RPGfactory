'use strict';

const fs = require('fs');
const path = require('path');
const { normalizePiSubagentsStatus } = require('./pi-subagents-contract');

const DEFAULT_MAX_ROOTS = 8;
const MAX_ROOTS = 32;
const DEFAULT_MAX_RUNS = 200;
const MAX_RUNS = 1000;
const DEFAULT_MAX_STATUS_BYTES = 1024 * 1024;
const MAX_STATUS_BYTES = 4 * 1024 * 1024;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validLimit(value, fallback, maximum) {
  if (value === undefined) return fallback;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= maximum ? value : null;
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function lstatOrNull(filePath) {
  try {
    return { stat: fs.lstatSync(filePath) };
  } catch (error) {
    return { missing: error && error.code === 'ENOENT' };
  }
}

function sameIdentity(first, second) {
  return first.dev === second.dev && first.ino === second.ino;
}

function canonicalDirectory(root, warnings) {
  const rootStat = lstatOrNull(root);
  if (!rootStat.stat) {
    warnings.push('ROOT_UNAVAILABLE');
    return null;
  }
  if (rootStat.stat.isSymbolicLink()) {
    warnings.push('ROOT_LINK_REJECTED');
    return null;
  }
  if (!rootStat.stat.isDirectory()) {
    warnings.push('ROOT_NOT_DIRECTORY');
    return null;
  }

  let canonicalRoot;
  try {
    canonicalRoot = fs.realpathSync(root);
  } catch {
    warnings.push('ROOT_UNAVAILABLE');
    return null;
  }

  const currentRoot = lstatOrNull(root);
  const canonicalStat = lstatOrNull(canonicalRoot);
  if (!currentRoot.stat || !canonicalStat.stat) {
    warnings.push('ROOT_UNAVAILABLE');
    return null;
  }
  if (currentRoot.stat.isSymbolicLink() || canonicalStat.stat.isSymbolicLink() ||
      !currentRoot.stat.isDirectory() || !canonicalStat.stat.isDirectory() ||
      !sameIdentity(rootStat.stat, currentRoot.stat) || !sameIdentity(rootStat.stat, canonicalStat.stat)) {
    warnings.push('ROOT_LINK_REJECTED');
    return null;
  }
  return canonicalRoot;
}

function statusExists(runDirectory) {
  const status = lstatOrNull(path.join(runDirectory, 'status.json'));
  return Boolean(status.stat);
}

function readStatus(runDirectory, rootDirectory, maxStatusBytes, observedAt, warnings) {
  const statusPath = path.join(runDirectory, 'status.json');
  const statusInfo = lstatOrNull(statusPath);
  if (!statusInfo.stat) {
    warnings.push(statusInfo.missing ? 'STATUS_MISSING' : 'STATUS_READ_FAILED');
    return null;
  }
  if (statusInfo.stat.isSymbolicLink()) {
    warnings.push('STATUS_LINK_REJECTED');
    return null;
  }
  if (!statusInfo.stat.isFile()) {
    warnings.push('STATUS_NOT_FILE');
    return null;
  }
  if (statusInfo.stat.size > maxStatusBytes) {
    warnings.push('STATUS_TOO_LARGE');
    return null;
  }

  let canonicalStatus;
  try {
    canonicalStatus = fs.realpathSync(statusPath);
  } catch {
    warnings.push('STATUS_READ_FAILED');
    return null;
  }
  if (!inside(rootDirectory, canonicalStatus)) {
    warnings.push('STATUS_LINK_REJECTED');
    return null;
  }

  let flags = fs.constants.O_RDONLY;
  if (typeof fs.constants.O_NOFOLLOW === 'number') flags |= fs.constants.O_NOFOLLOW;

  let descriptor;
  try {
    descriptor = fs.openSync(statusPath, flags);
  } catch (error) {
    warnings.push(error && error.code === 'ELOOP' ? 'STATUS_LINK_REJECTED' : 'STATUS_READ_FAILED');
    return null;
  }

  try {
    let opened;
    try {
      opened = fs.fstatSync(descriptor);
    } catch {
      warnings.push('STATUS_READ_FAILED');
      return null;
    }
    if (!sameIdentity(opened, statusInfo.stat)) {
      warnings.push('STATUS_LINK_REJECTED');
      return null;
    }
    if (!opened.isFile()) {
      warnings.push('STATUS_NOT_FILE');
      return null;
    }
    if (opened.size > maxStatusBytes) {
      warnings.push('STATUS_TOO_LARGE');
      return null;
    }

    const buffer = Buffer.alloc(maxStatusBytes + 1);
    let bytesRead = 0;
    try {
      while (bytesRead < buffer.length) {
        const read = fs.readSync(descriptor, buffer, bytesRead, buffer.length - bytesRead, null);
        if (read === 0) break;
        bytesRead += read;
      }
    } catch {
      warnings.push('STATUS_READ_FAILED');
      return null;
    }
    if (bytesRead > maxStatusBytes) {
      warnings.push('STATUS_TOO_LARGE');
      return null;
    }

    let raw;
    try {
      raw = JSON.parse(buffer.toString('utf8', 0, bytesRead));
    } catch {
      warnings.push('STATUS_JSON_INVALID');
      return null;
    }
    const normalized = normalizePiSubagentsStatus(raw, { observedAt });
    if (!normalized.ok) {
      warnings.push('STATUS_INVALID');
      return null;
    }
    return normalized.value;
  } finally {
    try {
      fs.closeSync(descriptor);
    } catch {
      // A close failure cannot change an already classified read result.
    }
  }
}

function scanPiSubagentsStatuses(options) {
  if (!isPlainObject(options) || !Array.isArray(options.roots) ||
      options.roots.some((root) => typeof root !== 'string' || !root.trim() || !path.isAbsolute(root)) ||
      (options.observedAt !== undefined &&
        !(typeof options.observedAt === 'number' && Number.isFinite(options.observedAt) && options.observedAt >= 0))) {
    return { ok: false, error: { code: 'INVALID_OPTIONS' } };
  }

  const maxRoots = validLimit(options.maxRoots, DEFAULT_MAX_ROOTS, MAX_ROOTS);
  const maxRuns = validLimit(options.maxRuns, DEFAULT_MAX_RUNS, MAX_RUNS);
  const maxStatusBytes = validLimit(options.maxStatusBytes, DEFAULT_MAX_STATUS_BYTES, MAX_STATUS_BYTES);
  if (maxRoots === null || maxRuns === null || maxStatusBytes === null) {
    return { ok: false, error: { code: 'INVALID_OPTIONS' } };
  }

  const observedAt = options.observedAt === undefined ? null : options.observedAt;
  const warnings = [];
  const runs = [];
  const seenRoots = new Set();
  const seenRunIds = new Set();
  const truncated = { roots: options.roots.length > maxRoots, runs: false };
  let encounteredRuns = 0;
  let runBudgetExhausted = false;

  function processCandidate(candidate, canonicalRoot) {
    if (encounteredRuns >= maxRuns) {
      truncated.runs = true;
      runBudgetExhausted = true;
      return;
    }
    encounteredRuns += 1;

    const candidateInfo = lstatOrNull(candidate);
    if (!candidateInfo.stat || candidateInfo.stat.isSymbolicLink() || !candidateInfo.stat.isDirectory()) {
      warnings.push('RUN_CANDIDATE_REJECTED');
      return;
    }

    let canonicalCandidate;
    try {
      canonicalCandidate = fs.realpathSync(candidate);
    } catch {
      warnings.push('RUN_CANDIDATE_REJECTED');
      return;
    }
    if (!inside(canonicalRoot, canonicalCandidate)) {
      warnings.push('RUN_CANDIDATE_REJECTED');
      return;
    }

    const normalized = readStatus(candidate, canonicalRoot, maxStatusBytes, observedAt, warnings);
    if (!normalized) return;
    const runId = normalized.root.nativeId;
    if (seenRunIds.has(runId)) {
      warnings.push('DUPLICATE_RUN_ID');
      return;
    }
    seenRunIds.add(runId);
    runs.push(normalized);
  }

  for (let rootIndex = 0; rootIndex < options.roots.length && rootIndex < maxRoots; rootIndex += 1) {
    if (runBudgetExhausted) break;
    const canonicalRoot = canonicalDirectory(options.roots[rootIndex], warnings);
    if (!canonicalRoot) continue;
    if (seenRoots.has(canonicalRoot)) {
      warnings.push('DUPLICATE_ROOT');
      continue;
    }
    seenRoots.add(canonicalRoot);

    if (statusExists(options.roots[rootIndex])) {
      processCandidate(options.roots[rootIndex], canonicalRoot);
      continue;
    }

    let entries;
    try {
      entries = fs.readdirSync(options.roots[rootIndex]).sort();
    } catch {
      warnings.push('ROOT_UNAVAILABLE');
      continue;
    }
    for (const entry of entries) {
      processCandidate(path.join(options.roots[rootIndex], entry), canonicalRoot);
      if (runBudgetExhausted) break;
    }
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      source: 'pi-subagents-files',
      observedAt,
      runs,
      truncated,
      warnings
    }
  };
}

module.exports = { scanPiSubagentsStatuses };
