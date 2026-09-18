'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { openDatabase } = require('./db');

const DEFAULT_MAX_MISSIONS = 200;
const MAX_MISSIONS = 1000;
const DEFAULT_MAX_MISSION_BYTES = 1024 * 1024;
const MAX_MISSION_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_RUNS = 200;
const MAX_RUNS = 1000;
const DEFAULT_MAX_PROOFS = 200;
const MAX_PROOFS = 1000;
const MAX_TARGET_LENGTH = 4096;
const MISSION_STATUSES = new Set(['planned', 'active', 'waiting', 'needs_decision', 'completed', 'failed', 'cancelled']);
const RUN_MODES = new Set(['single', 'parallel', 'chain', 'workflow', 'scheduled', 'external']);
const RUN_STATUSES = new Set(['queued', 'running', 'completed', 'failed', 'stopped', 'paused', 'unknown']);
const GOAL_STATUSES = new Set(['active', 'paused', 'budget-exhausted']);
const ARTIFACT_KINDS = new Set(['status', 'output', 'patch', 'manifest', 'review', 'note', 'other']);
const RECEIPT_KINDS = new Set(['pull_request', 'ci', 'deployment', 'release']);
const RECEIPT_STATUSES = new Set(['pending', 'ready', 'succeeded', 'failed']);
const HEX_ID = /^[a-f0-9]{64}$/;
const NATIVE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const WARNING_CODES = new Set([
  'ROOT_UNAVAILABLE', 'ROOT_REJECTED', 'MISSION_CANDIDATE_REJECTED', 'MISSION_TOO_LARGE',
  'MISSION_READ_FAILED', 'MISSION_JSON_INVALID', 'MISSION_INVALID', 'MISSION_NAME_MISMATCH',
  'RUN_INVALID', 'DECISION_INVALID', 'PROOF_INVALID'
]);

function createWarningCollector() {
  const seen = new Set();
  return {
    push(code) { if (WARNING_CODES.has(code)) seen.add(code); },
    values() { return [...seen]; }
  };
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  return isPlainObject(value) && Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key));
}

function validLimit(value, fallback, maximum) {
  if (value === undefined) return fallback;
  return Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : null;
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function opaqueId(domain, value) {
  return crypto.createHash('sha256').update(domain + '\u0000' + value, 'utf8').digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (isPlainObject(value)) return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function lstat(filePath) {
  try { return fs.lstatSync(filePath); } catch { return null; }
}

function sameIdentity(first, second) {
  return first.dev === second.dev && first.ino === second.ino;
}

function canonicalRoot(root, warnings) {
  const initial = lstat(root);
  if (!initial) { warnings.push('ROOT_UNAVAILABLE'); return null; }
  if (initial.isSymbolicLink() || !initial.isDirectory()) { warnings.push('ROOT_REJECTED'); return null; }
  let resolved;
  try { resolved = fs.realpathSync(root); } catch { warnings.push('ROOT_UNAVAILABLE'); return null; }
  const current = lstat(root);
  const canonical = lstat(resolved);
  if (!current || !canonical || current.isSymbolicLink() || canonical.isSymbolicLink() ||
      !current.isDirectory() || !canonical.isDirectory() || !sameIdentity(initial, current) || !sameIdentity(initial, canonical)) {
    warnings.push('ROOT_REJECTED');
    return null;
  }
  return resolved;
}

function epoch(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 80) return null;
  const parsed = Date.parse(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function nonNegativeUsage(value) {
  return isPlainObject(value) && exactKeys(value, ['tokens']) && safeInteger(value.tokens) ? value.tokens : null;
}

function validAbsolutePath(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_TARGET_LENGTH &&
    !/[\u0000-\u001f\u007f-\u009f]/.test(value) && path.isAbsolute(value);
}

function validHttpUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TARGET_LENGTH || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch { return false; }
}

function missionId(value) {
  return typeof value === 'string' && NATIVE_ID.test(value) && !value.includes('..') ? value : null;
}

function projectMission(raw, limits, warnings, truncated) {
  if (!isPlainObject(raw) || raw.schemaVersion !== 1 || !missionId(raw.id) || !MISSION_STATUSES.has(raw.status) ||
      typeof raw.title !== 'string' || !raw.title.trim() || typeof raw.objective !== 'string' || !raw.objective.trim() ||
      !Array.isArray(raw.runs) || !Array.isArray(raw.decisions) || !Array.isArray(raw.artifacts) ||
      (raw.receipts !== undefined && !Array.isArray(raw.receipts))) {
    warnings.push('MISSION_INVALID');
    return null;
  }
  const createdAt = epoch(raw.createdAt);
  const updatedAt = epoch(raw.updatedAt);
  if (createdAt === null || updatedAt === null || updatedAt < createdAt) { warnings.push('MISSION_INVALID'); return null; }
  let goalStatus = null;
  if (raw.goal !== undefined) {
    if (!exactKeys(raw.goal, ['status']) || !GOAL_STATUSES.has(raw.goal.status)) { warnings.push('MISSION_INVALID'); return null; }
    goalStatus = raw.goal.status;
  }
  const usageTokens = raw.usage === undefined ? null : nonNegativeUsage(raw.usage);
  if (raw.usage !== undefined && usageTokens === null) { warnings.push('MISSION_INVALID'); return null; }

  const runs = [];
  for (let index = 0; index < raw.runs.length && index < limits.maxRuns; index += 1) {
    const run = raw.runs[index];
    if (!isPlainObject(run) || !missionId(run.runId) || !RUN_MODES.has(run.mode)) { warnings.push('RUN_INVALID'); continue; }
    const startedAt = run.startedAt === undefined ? null : epoch(run.startedAt);
    const completedAt = run.completedAt === undefined ? null : epoch(run.completedAt);
    const runUsage = run.usage === undefined ? null : nonNegativeUsage(run.usage);
    if ((run.startedAt !== undefined && startedAt === null) || (run.completedAt !== undefined && completedAt === null) ||
        (startedAt !== null && completedAt !== null && completedAt < startedAt) || (run.usage !== undefined && runUsage === null)) {
      warnings.push('RUN_INVALID'); continue;
    }
    runs.push({ id: opaqueId('rpgfactory:pi-kingdom:v1', run.runId), mode: run.mode,
      status: typeof run.status === 'string' && RUN_STATUSES.has(run.status) ? run.status : null,
      startedAt, completedAt, usageTokens: runUsage });
  }
  if (raw.runs.length > limits.maxRuns) truncated.runs = true;

  let openDecisionCount = 0;
  for (const decision of raw.decisions) {
    if (!isPlainObject(decision) || !missionId(decision.id) || (decision.status !== 'open' && decision.status !== 'resolved') || epoch(decision.createdAt) === null) {
      warnings.push('DECISION_INVALID');
      continue;
    }
    if (decision.status === 'open') openDecisionCount += 1;
  }

  const nativeId = raw.id;
  const proofs = [];
  const proofTargets = [];
  const seenProofRefs = new Set();
  let proofCandidates = 0;
  function addProof(source, item) {
    if (proofCandidates >= limits.maxProofs) { truncated.proofs = true; return false; }
    proofCandidates += 1;
    const isArtifact = source === 'artifact';
    const kinds = isArtifact ? ARTIFACT_KINDS : RECEIPT_KINDS;
    if (!isPlainObject(item) || !kinds.has(item.kind)) { warnings.push('PROOF_INVALID'); return true; }
    const target = isArtifact ? item.path : item.url;
    if ((isArtifact ? !validAbsolutePath(target) : !validHttpUrl(target)) ||
        (!isArtifact && !RECEIPT_STATUSES.has(item.status))) { warnings.push('PROOF_INVALID'); return true; }
    const ref = opaqueId('rpgfactory:pi-mission-proof:v1', nativeId + '\u0000' + source + '\u0000' + target);
    if (seenProofRefs.has(ref)) return true;
    seenProofRefs.add(ref);
    proofs.push({ ref, source, kind: item.kind, status: isArtifact ? null : item.status });
    proofTargets.push({ ref, targetType: isArtifact ? 'path' : 'url', target });
    return true;
  }
  for (const artifact of raw.artifacts) {
    if (!addProof('artifact', artifact)) break;
  }
  if (!truncated.proofs) {
    for (const receipt of raw.receipts || []) {
      if (!addProof('receipt', receipt)) break;
    }
  }

  const id = opaqueId('rpgfactory:pi-mission:v1', nativeId);
  return { projection: { schemaVersion: 1, source: 'pi-subagents-mission', id, status: raw.status, createdAt, updatedAt,
    goalStatus, usageTokens, openDecisionCount, runs, proofs }, proofTargets };
}

function readMission(candidate, root, maxBytes, limits, warnings, truncated) {
  const initial = lstat(candidate);
  if (!initial || initial.isSymbolicLink() || !initial.isFile()) { warnings.push('MISSION_CANDIDATE_REJECTED'); return null; }
  if (initial.size > maxBytes) { warnings.push('MISSION_TOO_LARGE'); return null; }
  let resolved;
  try { resolved = fs.realpathSync(candidate); } catch { warnings.push('MISSION_READ_FAILED'); return null; }
  if (!inside(root, resolved)) { warnings.push('MISSION_CANDIDATE_REJECTED'); return null; }
  let flags = fs.constants.O_RDONLY;
  if (typeof fs.constants.O_NOFOLLOW === 'number') flags |= fs.constants.O_NOFOLLOW;
  let descriptor;
  try { descriptor = fs.openSync(candidate, flags); } catch (error) { warnings.push(error && error.code === 'ELOOP' ? 'MISSION_CANDIDATE_REJECTED' : 'MISSION_READ_FAILED'); return null; }
  try {
    let opened;
    try { opened = fs.fstatSync(descriptor); } catch { warnings.push('MISSION_READ_FAILED'); return null; }
    if (!opened.isFile() || !sameIdentity(initial, opened)) { warnings.push('MISSION_CANDIDATE_REJECTED'); return null; }
    if (opened.size > maxBytes) { warnings.push('MISSION_TOO_LARGE'); return null; }
    const buffer = Buffer.alloc(opened.size + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      let read;
      try { read = fs.readSync(descriptor, buffer, bytesRead, buffer.length - bytesRead, null); } catch { warnings.push('MISSION_READ_FAILED'); return null; }
      if (read === 0) break;
      bytesRead += read;
    }
    if (bytesRead > maxBytes) { warnings.push('MISSION_TOO_LARGE'); return null; }
    let raw;
    try { raw = JSON.parse(buffer.toString('utf8', 0, bytesRead)); } catch { warnings.push('MISSION_JSON_INVALID'); return null; }
    const result = projectMission(raw, limits, warnings, truncated);
    if (!result) return null;
    if (path.basename(candidate) !== raw.id + '.json') { warnings.push('MISSION_NAME_MISMATCH'); return null; }
    return result;
  } finally { try { fs.closeSync(descriptor); } catch { /* result was already classified */ } }
}

function scanPiSubagentsMissions(options) {
  const allowed = ['root', 'observedAt', 'maxMissions', 'maxMissionBytes', 'maxRunsPerMission', 'maxProofsPerMission'];
  if (!isPlainObject(options) || Object.keys(options).some((key) => !allowed.includes(key)) || typeof options.root !== 'string' || !path.isAbsolute(options.root) ||
      (options.observedAt !== undefined && (!Number.isFinite(options.observedAt) || !Number.isSafeInteger(options.observedAt) || options.observedAt < 0))) {
    return { ok: false, error: { code: 'INVALID_OPTIONS' } };
  }
  const maxMissions = validLimit(options.maxMissions, DEFAULT_MAX_MISSIONS, MAX_MISSIONS);
  const maxMissionBytes = validLimit(options.maxMissionBytes, DEFAULT_MAX_MISSION_BYTES, MAX_MISSION_BYTES);
  const maxRuns = validLimit(options.maxRunsPerMission, DEFAULT_MAX_RUNS, MAX_RUNS);
  const maxProofs = validLimit(options.maxProofsPerMission, DEFAULT_MAX_PROOFS, MAX_PROOFS);
  if (maxMissions === null || maxMissionBytes === null || maxRuns === null || maxProofs === null) return { ok: false, error: { code: 'INVALID_OPTIONS' } };
  const warnings = createWarningCollector();
  const root = canonicalRoot(options.root, warnings);
  const value = { schemaVersion: 1, source: 'pi-subagents-missions', observedAt: options.observedAt === undefined ? null : options.observedAt,
    missions: [], truncated: { missions: false, runs: false, proofs: false }, warnings: [] };
  if (!root) {
    value.warnings = warnings.values();
    return { ok: true, value };
  }
  let entries;
  try { entries = fs.readdirSync(root).filter((entry) => entry.endsWith('.json')).sort(); } catch {
    warnings.push('ROOT_UNAVAILABLE');
    value.warnings = warnings.values();
    return { ok: true, value };
  }
  if (entries.length > maxMissions) value.truncated.missions = true;
  for (let index = 0; index < entries.length && index < maxMissions; index += 1) {
    const mission = readMission(path.join(root, entries[index]), root, maxMissionBytes, { maxRuns, maxProofs }, warnings, value.truncated);
    if (mission) value.missions.push(mission);
  }
  value.warnings = warnings.values();
  return { ok: true, value };
}

function fail(code) {
  const error = new Error(code === 'VALIDATION' ? 'Date mission invalide' : 'Persistența mission a eșuat');
  error.code = code;
  return error;
}

function validateProjection(value) {
  if (!exactKeys(value, ['schemaVersion', 'source', 'id', 'status', 'createdAt', 'updatedAt', 'goalStatus', 'usageTokens', 'openDecisionCount', 'runs', 'proofs']) ||
      value.schemaVersion !== 1 || value.source !== 'pi-subagents-mission' || !HEX_ID.test(value.id) || !MISSION_STATUSES.has(value.status) ||
      !safeInteger(value.createdAt) || !safeInteger(value.updatedAt) || value.updatedAt < value.createdAt ||
      (value.goalStatus !== null && !GOAL_STATUSES.has(value.goalStatus)) || (value.usageTokens !== null && !safeInteger(value.usageTokens)) ||
      !safeInteger(value.openDecisionCount) || !Array.isArray(value.runs) || value.runs.length > MAX_RUNS || !Array.isArray(value.proofs) || value.proofs.length > MAX_PROOFS) return false;
  const proofRefs = new Set();
  for (const run of value.runs) {
    if (!exactKeys(run, ['id', 'mode', 'status', 'startedAt', 'completedAt', 'usageTokens']) || !HEX_ID.test(run.id) || !RUN_MODES.has(run.mode) ||
        (run.status !== null && !RUN_STATUSES.has(run.status)) || (run.startedAt !== null && !safeInteger(run.startedAt)) ||
        (run.completedAt !== null && !safeInteger(run.completedAt)) || (run.startedAt !== null && run.completedAt !== null && run.completedAt < run.startedAt) ||
        (run.usageTokens !== null && !safeInteger(run.usageTokens))) return false;
  }
  for (const proof of value.proofs) {
    if (!exactKeys(proof, ['ref', 'source', 'kind', 'status']) || !HEX_ID.test(proof.ref) || proofRefs.has(proof.ref) ||
        (proof.source !== 'artifact' && proof.source !== 'receipt') || !(proof.source === 'artifact' ? ARTIFACT_KINDS : RECEIPT_KINDS).has(proof.kind) ||
        (proof.source === 'artifact' ? proof.status !== null : !RECEIPT_STATUSES.has(proof.status))) return false;
    proofRefs.add(proof.ref);
  }
  return true;
}

function validateScan(value) {
  if (!exactKeys(value, ['schemaVersion', 'source', 'observedAt', 'missions', 'truncated', 'warnings']) || value.schemaVersion !== 1 ||
      value.source !== 'pi-subagents-missions' || (value.observedAt !== null && !safeInteger(value.observedAt)) || !Array.isArray(value.missions) ||
      value.missions.length > MAX_MISSIONS || !exactKeys(value.truncated, ['missions', 'runs', 'proofs']) ||
      Object.values(value.truncated).some((item) => typeof item !== 'boolean') || !Array.isArray(value.warnings) ||
      value.warnings.length > WARNING_CODES.size) return false;
  const warningCodes = new Set();
  for (const warning of value.warnings) {
    if (!WARNING_CODES.has(warning) || warningCodes.has(warning)) return false;
    warningCodes.add(warning);
  }
  const ids = new Set();
  for (const mission of value.missions) {
    if (!exactKeys(mission, ['projection', 'proofTargets']) || !validateProjection(mission.projection) || ids.has(mission.projection.id) ||
        !Array.isArray(mission.proofTargets) || mission.proofTargets.length !== mission.projection.proofs.length) return false;
    ids.add(mission.projection.id);
    const proofs = new Map(mission.projection.proofs.map((proof) => [proof.ref, proof]));
    const refs = new Set();
    for (const target of mission.proofTargets) {
      const proof = proofs.get(target && target.ref);
      if (!exactKeys(target, ['ref', 'targetType', 'target']) || !proof || refs.has(target.ref) ||
          (target.targetType !== 'path' && target.targetType !== 'url') ||
          (target.targetType === 'path' ? !validAbsolutePath(target.target) : !validHttpUrl(target.target)) ||
          (proof.source === 'artifact') !== (target.targetType === 'path')) return false;
      refs.add(target.ref);
    }
  }
  return true;
}

function createPiMissionsStore(options = {}) {
  if (!isPlainObject(options) || Object.keys(options).some((key) => !['dbPath', 'migrationsDir', 'now'].includes(key)) ||
      (options.now !== undefined && typeof options.now !== 'function')) throw fail('VALIDATION');
  let handle = null;
  function db() {
    if (!handle) handle = openDatabase({ path: options.dbPath, migrationsDir: options.migrationsDir, now: options.now });
    return handle.db;
  }
  function timestamp() {
    const value = (options.now || (() => Date.now()))();
    if (!safeInteger(value)) throw fail('PERSISTENCE');
    return value;
  }
  function commitScan(scanValue) {
    if (!validateScan(scanValue)) throw fail('VALIDATION');
    const prepared = scanValue.missions.map((mission) => {
      const json = canonicalJson(mission.projection);
      if (Buffer.byteLength(json, 'utf8') > 2 * 1024 * 1024) throw fail('VALIDATION');
      return { mission, json, hash: opaqueId('rpgfactory:pi-mission-projection:v1', json) };
    });
    let database = null;
    let inserted = 0; let updated = 0; let unchanged = 0;
    try {
      database = db();
      const now = timestamp();
      database.exec('BEGIN');
      const existingStatement = database.prepare('SELECT projection_hash, updated_at FROM pi_missions WHERE id = ?');
      const insertMission = database.prepare('INSERT INTO pi_missions (id, projection_hash, projection_json, source_created_at, source_updated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const updateMission = database.prepare('UPDATE pi_missions SET projection_hash = ?, projection_json = ?, source_created_at = ?, source_updated_at = ?, updated_at = ? WHERE id = ?');
      const deleteTargets = database.prepare('DELETE FROM pi_mission_proof_targets WHERE mission_id = ?');
      const insertTarget = database.prepare('INSERT INTO pi_mission_proof_targets (proof_ref, mission_id, source, kind, status, target_type, target_value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const item of prepared) {
        const projection = item.mission.projection;
        const existing = existingStatement.get(projection.id);
        if (existing && existing.projection_hash === item.hash) { unchanged += 1; continue; }
        if (existing) {
          if (!safeInteger(existing.updated_at) || existing.updated_at === Number.MAX_SAFE_INTEGER) throw fail('PERSISTENCE');
          const updatedAt = Math.max(now, existing.updated_at + 1);
          if (!safeInteger(updatedAt)) throw fail('PERSISTENCE');
          updateMission.run(item.hash, item.json, projection.createdAt, projection.updatedAt, updatedAt, projection.id);
          updated += 1;
        } else {
          insertMission.run(projection.id, item.hash, item.json, projection.createdAt, projection.updatedAt, now, now);
          inserted += 1;
        }
        deleteTargets.run(projection.id);
        const proofs = new Map(projection.proofs.map((proof) => [proof.ref, proof]));
        for (const target of item.mission.proofTargets) {
          const proof = proofs.get(target.ref);
          insertTarget.run(target.ref, projection.id, proof.source, proof.kind, proof.status, target.targetType, target.target, now, now);
        }
      }
      database.exec('COMMIT');
      return { missions: { inserted, updated, unchanged } };
    } catch (error) {
      try { if (database) database.exec('ROLLBACK'); } catch { /* original error remains private */ }
      if (error && error.code === 'VALIDATION') throw error;
      throw fail('PERSISTENCE');
    }
  }
  function listMissionProjections() {
    try {
      return db().prepare('SELECT projection_json FROM pi_missions ORDER BY source_updated_at DESC, id ASC').all().map((row) => {
        const projection = JSON.parse(row.projection_json);
        if (!validateProjection(projection)) throw fail('PERSISTENCE');
        return projection;
      });
    } catch (error) { if (error && error.code === 'PERSISTENCE') throw error; throw fail('PERSISTENCE'); }
  }
  function close() {
    if (!handle) return;
    try { handle.close(); } catch { throw fail('PERSISTENCE'); } finally { handle = null; }
  }
  return { commitScan, listMissionProjections, close };
}

module.exports = { scanPiSubagentsMissions, createPiMissionsStore };
