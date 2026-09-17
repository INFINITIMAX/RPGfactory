'use strict';

const crypto = require('crypto');
const { openDatabase } = require('./db');

const LIFECYCLES = new Set(['queued', 'running', 'completed', 'failed', 'stopped', 'paused', 'unknown']);
const WARNING_CODES = new Set([
  'INVALID_NODE_FIELD', 'TRUNCATED_NODE_FIELD', 'MISSING_STATE', 'PARTIAL_STATE',
  'REJECTED_STATE', 'UNKNOWN_STATE', 'INVALID_USAGE', 'UNKNOWN_ACTIVITY_STATE',
  'ACTIVE_LONG_RUNNING_UNVERIFIED', 'INVALID_ACTIVITY', 'INVALID_MAX_DEPTH',
  'INVALID_MAX_NODES', 'INVALID_OBSERVED_AT', 'INVALID_NESTED_LIST',
  'INVALID_NESTED_NODE', 'INVALID_STEP_NODE', 'DUPLICATE_NATIVE_ID', 'INVALID_DECLARED_PARENT'
]);
const NODE_KEYS = [
  'nativeId', 'parentNativeId', 'kind', 'sourceState', 'lifecycle', 'agent',
  'phase', 'label', 'mode', 'attention', 'activity', 'startedAt', 'endedAt',
  'lastActivityAt', 'model', 'usage'
];
const EVENT_KEYS = {
  source_truncated: ['schemaVersion', 'source', 'kind', 'ts', 'runId'],
  run_started: ['schemaVersion', 'source', 'kind', 'ts', 'runId', 'mode', 'lifecycleArtifactVersion'],
  run_completed: ['schemaVersion', 'source', 'kind', 'ts', 'runId', 'state', 'durationMs', 'lifecycleArtifactVersion'],
  run_paused: ['schemaVersion', 'source', 'kind', 'ts', 'runId', 'state'],
  run_stopped: ['schemaVersion', 'source', 'kind', 'ts', 'runId', 'state'],
  run_timed_out: ['schemaVersion', 'source', 'kind', 'ts', 'runId'],
  run_repaired_stale: ['schemaVersion', 'source', 'kind', 'ts', 'runId'],
  run_process_terminal: ['schemaVersion', 'source', 'kind', 'ts', 'runId', 'processState', 'lifecycleArtifactVersion'],
  step_started: ['schemaVersion', 'source', 'kind', 'ts', 'runId', 'stepIndex', 'agent'],
  step_completed: ['schemaVersion', 'source', 'kind', 'ts', 'runId', 'stepIndex', 'agent', 'exitCode', 'durationMs'],
  step_failed: ['schemaVersion', 'source', 'kind', 'ts', 'runId', 'stepIndex', 'agent', 'exitCode', 'durationMs'],
  step_paused: ['schemaVersion', 'source', 'kind', 'ts', 'runId', 'stepIndex', 'agent', 'exitCode', 'durationMs'],
  step_stopped: ['schemaVersion', 'source', 'kind', 'ts', 'runId', 'stepIndex', 'agent', 'exitCode', 'durationMs'],
  control_attention: ['schemaVersion', 'source', 'kind', 'ts', 'runId', 'agent', 'attention', 'stepIndex', 'reason'],
  child_status: ['schemaVersion', 'source', 'kind', 'ts', 'runId', 'childId', 'childStatus', 'stepIndex', 'agent', 'childRunId', 'workflowKey']
};
const EVENT_KINDS = new Set(Object.keys(EVENT_KEYS));
const OPTIONAL_EVENT_FIELDS = {
  source_truncated: new Set(),
  run_started: new Set(['lifecycleArtifactVersion']),
  run_completed: new Set(['durationMs', 'lifecycleArtifactVersion']),
  run_paused: new Set(),
  run_stopped: new Set(),
  run_timed_out: new Set(),
  run_repaired_stale: new Set(),
  run_process_terminal: new Set(['lifecycleArtifactVersion']),
  step_started: new Set(),
  step_completed: new Set(['exitCode', 'durationMs']),
  step_failed: new Set(['exitCode', 'durationMs']),
  step_paused: new Set(['exitCode', 'durationMs']),
  step_stopped: new Set(['exitCode', 'durationMs']),
  control_attention: new Set(['stepIndex', 'reason']),
  child_status: new Set(['stepIndex', 'agent', 'childRunId', 'workflowKey'])
};

function fail(code) {
  const error = new Error(code === 'VALIDATION' ? 'Date de ingestie invalide' : 'Persistența ingestiei a eșuat');
  error.code = code;
  return error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys, optional = new Set()) {
  if (!isPlainObject(value)) return false;
  const allowed = new Set(keys);
  const actual = Object.keys(value);
  if (actual.some((key) => !allowed.has(key))) return false;
  return keys.every((key) => optional.has(key) || Object.prototype.hasOwnProperty.call(value, key));
}

function validString(value, maximum) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
    value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}

function safeNumber(value, minimum = 0) {
  return typeof value === 'number' && Number.isFinite(value) &&
    Math.abs(value) <= Number.MAX_SAFE_INTEGER && value >= minimum;
}

function safeInteger(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function validateNode(node, rootId, isRoot) {
  if (!exactKeys(node, NODE_KEYS)) return false;
  if (!validString(node.nativeId, 256) || node.kind !== (isRoot ? 'root' : node.kind)) return false;
  if (isRoot ? node.kind !== 'root' || node.parentNativeId !== null :
    !(['step', 'nested'].includes(node.kind) && validString(node.parentNativeId, 256))) return false;
  if (node.nativeId === rootId && !isRoot) return false;
  if (node.sourceState !== null && !validString(node.sourceState, 160)) return false;
  if (!LIFECYCLES.has(node.lifecycle)) return false;
  for (const key of ['agent', 'phase', 'label', 'mode', 'model']) {
    if (node[key] !== null && !validString(node[key], 160)) return false;
  }
  if (node.attention !== null && node.attention !== 'needs_attention') return false;
  if (node.activity !== null && (!validString(node.activity, 120) || /[\\/]/.test(node.activity))) return false;
  for (const key of ['startedAt', 'endedAt', 'lastActivityAt']) {
    if (node[key] !== null && !safeNumber(node[key])) return false;
  }
  if (node.usage !== null) {
    const usageKeys = ['input', 'output', 'total', 'window', 'windowPeak'];
    if (!exactKeys(node.usage, usageKeys, new Set(usageKeys)) || Object.keys(node.usage).length === 0) return false;
    if (Object.values(node.usage).some((value) => !safeNumber(value))) return false;
  }
  return true;
}

function validateSnapshot(snapshot) {
  const keys = ['schemaVersion', 'source', 'observedAt', 'root', 'children', 'truncated', 'warnings'];
  if (!exactKeys(snapshot, keys) || snapshot.schemaVersion !== 1 || snapshot.source !== 'pi-subagents') return false;
  if (snapshot.observedAt !== null && !safeNumber(snapshot.observedAt)) return false;
  if (!validateNode(snapshot.root, snapshot.root && snapshot.root.nativeId, true) || !Array.isArray(snapshot.children) || snapshot.children.length > 1000) return false;
  const seen = new Set([snapshot.root.nativeId]);
  for (const child of snapshot.children) {
    if (!validateNode(child, snapshot.root.nativeId, false) || seen.has(child.nativeId)) return false;
    seen.add(child.nativeId);
  }
  if (!exactKeys(snapshot.truncated, ['depth', 'count']) || typeof snapshot.truncated.depth !== 'boolean' || typeof snapshot.truncated.count !== 'boolean') return false;
  if (!Array.isArray(snapshot.warnings) || snapshot.warnings.some((warning) => !WARNING_CODES.has(warning))) return false;
  return true;
}

function validateEvent(event, nativeRunId) {
  if (!isPlainObject(event) || !EVENT_KINDS.has(event.kind)) return false;
  if (!exactKeys(event, EVENT_KEYS[event.kind], OPTIONAL_EVENT_FIELDS[event.kind])) return false;
  if (event.schemaVersion !== 1 || event.source !== 'pi-subagents-events' || event.runId !== nativeRunId || !safeInteger(event.ts)) return false;
  if (event.mode !== undefined && !['single', 'parallel', 'chain', 'workflow'].includes(event.mode)) return false;
  if (event.state !== undefined && !['completed', 'failed', 'partial', 'paused', 'stopped'].includes(event.state)) return false;
  if (event.processState !== undefined && !['observed', 'unknown'].includes(event.processState)) return false;
  if (event.attention !== undefined && !['active_long_running', 'needs_attention'].includes(event.attention)) return false;
  if (event.childStatus !== undefined && !['stopping', 'stopped'].includes(event.childStatus)) return false;
  for (const key of ['agent', 'childId', 'childRunId', 'workflowKey']) {
    const maximum = key === 'agent' || key === 'workflowKey' ? 128 : 256;
    if (event[key] !== undefined && !validString(event[key], maximum)) return false;
  }
  if (event.stepIndex !== undefined && !safeInteger(event.stepIndex, 0, 1000000)) return false;
  if (event.lifecycleArtifactVersion !== undefined && !safeInteger(event.lifecycleArtifactVersion, 1, 1000)) return false;
  if (event.durationMs !== undefined && !safeInteger(event.durationMs)) return false;
  if (event.exitCode !== undefined && !safeInteger(event.exitCode, -2147483648, 2147483647)) return false;
  if (event.reason !== undefined && !['idle', 'completion_guard', 'active_long_running', 'tool_failures', 'supervisor_request', 'time_threshold', 'turn_threshold', 'token_threshold', 'tool_open_threshold'].includes(event.reason)) return false;
  return true;
}

function validateCursor(cursor) {
  return exactKeys(cursor, ['version', 'fileKey', 'offset', 'discardingOversizedLine'], new Set(['discardingOversizedLine'])) &&
    cursor.version === 1 && typeof cursor.fileKey === 'string' && /^[a-f0-9]{64}$/.test(cursor.fileKey) &&
    safeInteger(cursor.offset) &&
    (cursor.discardingOversizedLine === undefined || cursor.discardingOversizedLine === true);
}

function sanitizedCursor(cursor) {
  const value = { version: 1, fileKey: cursor.fileKey, offset: cursor.offset };
  if (cursor.discardingOversizedLine === true) value.discardingOversizedLine = true;
  return value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (isPlainObject(value)) {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function createPiIngestionStore(options = {}) {
  if (!isPlainObject(options)) throw fail('VALIDATION');
  const dbPath = options.dbPath;
  const migrationsDir = options.migrationsDir;
  const now = options.now || (() => Date.now());
  let dbHandle = null;

  function getDb() {
    if (!dbHandle) dbHandle = openDatabase({ path: dbPath, migrationsDir, now });
    return dbHandle.db;
  }

  function timestamp() {
    const value = now();
    if (!safeInteger(value)) throw fail('PERSISTENCE');
    return value;
  }

  function close() {
    if (dbHandle) {
      try {
        dbHandle.close();
      } catch (error) {
        throw fail('PERSISTENCE');
      } finally {
        dbHandle = null;
      }
    }
  }

  function commitObservation({ snapshot, events, cursor } = {}) {
    if (!validateSnapshot(snapshot) || !Array.isArray(events) || events.length > 1000 || !validateCursor(cursor)) throw fail('VALIDATION');
    const nativeRunId = snapshot.root.nativeId;
    if (events.some((event) => !validateEvent(event, nativeRunId))) throw fail('VALIDATION');
    const snapshotJson = canonicalJson(snapshot);
    if (Buffer.byteLength(snapshotJson, 'utf8') > 2 * 1024 * 1024) throw fail('VALIDATION');
    const preparedEvents = events.map((event) => {
      const json = canonicalJson(event);
      if (Buffer.byteLength(json, 'utf8') > 64 * 1024) throw fail('VALIDATION');
      return { json, id: digest('pi-subagents:' + nativeRunId + '\u001f' + json), type: event.kind, occurredAt: event.ts };
    });
    const snapshotHash = digest(snapshotJson);
    const runId = 'pi-subagents:' + nativeRunId;
    let db = null;
    let inserted = 0;
    try {
      db = getDb();
      const ts = timestamp();
      db.exec('BEGIN');
      const previousCursor = db.prepare('SELECT file_key, offset FROM pi_run_cursors WHERE run_id = ?').get(runId);
      if (previousCursor && previousCursor.file_key === cursor.fileKey && cursor.offset < previousCursor.offset) {
        throw fail('VALIDATION');
      }
      const existing = db.prepare('SELECT revision FROM runs WHERE id = ?').get(runId);
      const storedSnapshot = db.prepare('SELECT snapshot_hash FROM pi_run_snapshots WHERE run_id = ?').get(runId);
      const changed = !storedSnapshot || storedSnapshot.snapshot_hash !== snapshotHash;
      if (!existing) {
        db.prepare('INSERT INTO runs (id, source_harness, native_id, profile_id, project, lifecycle, first_observed_at, last_observed_at, created_at, updated_at, revision) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, 1)')
          .run(runId, 'pi-subagents', nativeRunId, snapshot.root.lifecycle, ts, ts, ts, ts);
      } else if (changed) {
        db.prepare('UPDATE runs SET lifecycle = ?, last_observed_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ?')
          .run(snapshot.root.lifecycle, ts, ts, runId);
      }
      if (changed) {
        db.prepare('INSERT INTO pi_run_snapshots (run_id, snapshot_hash, snapshot_json, observed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(run_id) DO UPDATE SET snapshot_hash = excluded.snapshot_hash, snapshot_json = excluded.snapshot_json, observed_at = excluded.observed_at, updated_at = excluded.updated_at')
          .run(runId, snapshotHash, snapshotJson, snapshot.observedAt, ts, ts);
      }
      const insertEvent = db.prepare('INSERT OR IGNORE INTO pi_run_events (event_id, run_id, event_type, occurred_at, event_json, stored_at) VALUES (?, ?, ?, ?, ?, ?)');
      for (const event of preparedEvents) inserted += insertEvent.run(event.id, runId, event.type, event.occurredAt, event.json, ts).changes;
      db.prepare('INSERT INTO pi_run_cursors (run_id, file_key, offset, discarding_oversized_line, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(run_id) DO UPDATE SET file_key = excluded.file_key, offset = excluded.offset, discarding_oversized_line = excluded.discarding_oversized_line, updated_at = excluded.updated_at')
        .run(runId, cursor.fileKey, cursor.offset, cursor.discardingOversizedLine === true ? 1 : 0, ts);
      db.exec('COMMIT');
      return {
        run: { id: runId, nativeId: nativeRunId, lifecycle: snapshot.root.lifecycle },
        snapshot: { hash: snapshotHash, observedAt: snapshot.observedAt },
        cursor: sanitizedCursor(cursor),
        events: { inserted, duplicate: events.length - inserted }
      };
    } catch (error) {
      try { if (db) db.exec('ROLLBACK'); } catch (rollbackError) { /* original error remains private */ }
      if (error && error.code === 'VALIDATION') throw error;
      throw fail('PERSISTENCE');
    }
  }

  function getCursor(nativeRunId) {
    if (!validString(nativeRunId, 256)) throw fail('VALIDATION');
    try {
      const row = getDb().prepare('SELECT file_key, offset, discarding_oversized_line FROM pi_run_cursors WHERE run_id = ?').get('pi-subagents:' + nativeRunId);
      if (!row) return null;
      const cursor = { version: 1, fileKey: row.file_key, offset: row.offset };
      if (row.discarding_oversized_line === 1) cursor.discardingOversizedLine = true;
      return cursor;
    } catch (error) { throw fail('PERSISTENCE'); }
  }

  function getSnapshot(nativeRunId) {
    if (!validString(nativeRunId, 256)) throw fail('VALIDATION');
    try {
      const row = getDb().prepare('SELECT snapshot_json FROM pi_run_snapshots WHERE run_id = ?').get('pi-subagents:' + nativeRunId);
      return row ? JSON.parse(row.snapshot_json) : null;
    } catch (error) { throw fail('PERSISTENCE'); }
  }

  function listEvents(nativeRunId) {
    if (!validString(nativeRunId, 256)) throw fail('VALIDATION');
    try {
      return getDb().prepare('SELECT event_json FROM pi_run_events WHERE run_id = ? ORDER BY occurred_at ASC, event_id ASC')
        .all('pi-subagents:' + nativeRunId).map((row) => JSON.parse(row.event_json));
    } catch (error) { throw fail('PERSISTENCE'); }
  }

  return { commitObservation, getCursor, getSnapshot, listEvents, close };
}

module.exports = { createPiIngestionStore };
