'use strict';

const MAX_RUN_ID_LENGTH = 256;
const MAX_AGENT_LENGTH = 128;
const MAX_WORKFLOW_KEY_LENGTH = 128;
const MAX_STEP_INDEX = 1000000;
const MAX_ARTIFACT_VERSION = 1000;
const CONTROL_REASONS = new Set([
  'idle', 'completion_guard', 'active_long_running', 'tool_failures',
  'supervisor_request', 'time_threshold', 'turn_threshold',
  'token_threshold', 'tool_open_threshold'
]);
const RUN_MODES = new Set(['single', 'parallel', 'chain', 'workflow']);
const RUN_STATUSES = new Set(['completed', 'failed', 'partial', 'paused', 'stopped']);
const CONTROL_TYPES = new Set(['active_long_running', 'needs_attention']);
const CHILD_STATUSES = new Set(['stopping', 'stopped']);
const PROCESS_STATES = new Set(['observed', 'unknown']);
const STEP_TYPES = new Map([
  ['subagent.step.started', 'step_started'],
  ['subagent.step.completed', 'step_completed'],
  ['subagent.step.failed', 'step_failed'],
  ['subagent.step.paused', 'step_paused'],
  ['subagent.step.stopped', 'step_stopped']
]);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeInteger(value, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function validString(value, maximum) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
    value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}

function validId(value) {
  return validString(value, MAX_RUN_ID_LENGTH);
}

function invalid() {
  return { ok: false, error: { code: 'INVALID_EVENT' } };
}

function mismatch() {
  return { ok: false, error: { code: 'RUN_ID_MISMATCH' } };
}

function validOptions(options) {
  return isPlainObject(options) && validId(options.expectedRunId) ? options.expectedRunId : null;
}

function requiredRunId(raw, expectedRunId) {
  if (!validId(raw.runId)) return null;
  return raw.runId === expectedRunId ? raw.runId : false;
}

function base(kind, ts, runId) {
  return {
    schemaVersion: 1,
    source: 'pi-subagents-events',
    kind,
    ts,
    runId
  };
}

function artifactVersion(raw) {
  if (raw.lifecycleArtifactVersion === undefined) return undefined;
  return safeInteger(raw.lifecycleArtifactVersion, 1, MAX_ARTIFACT_VERSION) ? raw.lifecycleArtifactVersion : null;
}

function directEvent(raw, expectedRunId) {
  const runId = requiredRunId(raw, expectedRunId);
  if (runId === false) return mismatch();
  if (runId === null || !safeInteger(raw.ts, 0)) return invalid();
  return { runId, ts: raw.ts };
}

function optionalTerminalFields(raw, value) {
  if (raw.exitCode !== undefined && raw.exitCode !== null) {
    if (!safeInteger(raw.exitCode, -2147483648, 2147483647)) return false;
    value.exitCode = raw.exitCode;
  }
  if (raw.durationMs !== undefined) {
    if (!safeInteger(raw.durationMs, 0)) return false;
    value.durationMs = raw.durationMs;
  }
  return true;
}

function normalizePiSubagentsEvent(raw, options) {
  const expectedRunId = validOptions(options);
  if (!expectedRunId || !isPlainObject(raw) || typeof raw.type !== 'string') return invalid();

  if (!knownType(raw.type)) return { ok: false, error: { code: 'UNSUPPORTED_EVENT' } };

  if (raw.type === 'subagent.events.truncated') {
    if (!safeInteger(raw.ts, 0)) return invalid();
    if (raw.runId !== undefined) {
      if (!validId(raw.runId)) return invalid();
      if (raw.runId !== expectedRunId) return mismatch();
    }
    return { ok: true, value: base('source_truncated', raw.ts, expectedRunId) };
  }

  if (raw.type === 'subagent.control') return normalizeControl(raw, expectedRunId);

  const direct = directEvent(raw, expectedRunId);
  if (direct.ok === false) return direct;

  if (raw.type === 'subagent.run.started') {
    if (!RUN_MODES.has(raw.mode)) return invalid();
    const version = artifactVersion(raw);
    if (version === null) return invalid();
    const value = base('run_started', direct.ts, direct.runId);
    value.mode = raw.mode;
    if (version !== undefined) value.lifecycleArtifactVersion = version;
    return { ok: true, value };
  }

  if (raw.type === 'subagent.run.completed') {
    const status = raw.status === 'complete' ? 'completed' : raw.status;
    if (!RUN_STATUSES.has(status)) return invalid();
    const version = artifactVersion(raw);
    if (version === null || (raw.durationMs !== undefined && !safeInteger(raw.durationMs, 0))) return invalid();
    const value = base('run_completed', direct.ts, direct.runId);
    value.state = status;
    if (raw.durationMs !== undefined) value.durationMs = raw.durationMs;
    if (version !== undefined) value.lifecycleArtifactVersion = version;
    return { ok: true, value };
  }

  if (raw.type === 'subagent.run.paused' || raw.type === 'subagent.run.stopped') {
    const state = raw.type === 'subagent.run.paused' ? 'paused' : 'stopped';
    return { ok: true, value: { ...base(raw.type === 'subagent.run.paused' ? 'run_paused' : 'run_stopped', direct.ts, direct.runId), state } };
  }

  if (raw.type === 'subagent.run.timed_out') {
    return { ok: true, value: base('run_timed_out', direct.ts, direct.runId) };
  }

  if (raw.type === 'subagent.run.repaired_stale') {
    return { ok: true, value: base('run_repaired_stale', direct.ts, direct.runId) };
  }

  if (raw.type === 'subagent.run.process_terminal') {
    if (!isPlainObject(raw.processTerminal) || !PROCESS_STATES.has(raw.processTerminal.state) || !validId(raw.processTerminal.runId)) return invalid();
    if (raw.processTerminal.runId !== expectedRunId) return mismatch();
    const version = artifactVersion(raw);
    if (version === null) return invalid();
    const value = base('run_process_terminal', direct.ts, direct.runId);
    value.processState = raw.processTerminal.state;
    if (version !== undefined) value.lifecycleArtifactVersion = version;
    return { ok: true, value };
  }

  if (STEP_TYPES.has(raw.type)) return normalizeStep(raw, direct, STEP_TYPES.get(raw.type));
  return normalizeChildStatus(raw, direct);
}

function normalizeStep(raw, direct, kind) {
  if (!safeInteger(raw.stepIndex, 0, MAX_STEP_INDEX) || !validString(raw.agent, MAX_AGENT_LENGTH)) return invalid();
  const value = base(kind, direct.ts, direct.runId);
  value.stepIndex = raw.stepIndex;
  value.agent = raw.agent;
  if (kind !== 'step_started' && !optionalTerminalFields(raw, value)) return invalid();
  return { ok: true, value };
}

function normalizeChildStatus(raw, direct) {
  if (raw.version !== 1 || !validId(raw.childId) || !CHILD_STATUSES.has(raw.status)) return invalid();
  if (raw.stepIndex !== undefined && !safeInteger(raw.stepIndex, 0, MAX_STEP_INDEX)) return invalid();
  if (raw.agent !== undefined && !validString(raw.agent, MAX_AGENT_LENGTH)) return invalid();
  if (raw.childRunId !== undefined && !validId(raw.childRunId)) return invalid();
  if (raw.workflowKey !== undefined && !validString(raw.workflowKey, MAX_WORKFLOW_KEY_LENGTH)) return invalid();
  const value = base('child_status', direct.ts, direct.runId);
  value.childId = raw.childId;
  value.childStatus = raw.status;
  if (raw.stepIndex !== undefined) value.stepIndex = raw.stepIndex;
  if (raw.agent !== undefined) value.agent = raw.agent;
  if (raw.childRunId !== undefined) value.childRunId = raw.childRunId;
  if (raw.workflowKey !== undefined) value.workflowKey = raw.workflowKey;
  return { ok: true, value };
}

function normalizeControl(raw, expectedRunId) {
  if (!isPlainObject(raw.event) || !validId(raw.event.runId) || !safeInteger(raw.event.ts, 0) ||
      !validString(raw.event.agent, MAX_AGENT_LENGTH) || !CONTROL_TYPES.has(raw.event.type) || !CONTROL_TYPES.has(raw.event.to)) {
    return invalid();
  }
  if (raw.event.runId !== expectedRunId) return mismatch();
  if (raw.event.index !== undefined && !safeInteger(raw.event.index, 0, MAX_STEP_INDEX)) return invalid();
  if (raw.event.reason !== undefined && !CONTROL_REASONS.has(raw.event.reason)) return invalid();
  const value = base('control_attention', raw.event.ts, expectedRunId);
  value.agent = raw.event.agent;
  value.attention = raw.event.to;
  if (raw.event.index !== undefined) value.stepIndex = raw.event.index;
  if (raw.event.reason !== undefined) value.reason = raw.event.reason;
  return { ok: true, value };
}

function knownType(type) {
  return type === 'subagent.run.started' || type === 'subagent.run.completed' ||
    type === 'subagent.run.paused' || type === 'subagent.run.stopped' ||
    type === 'subagent.run.timed_out' || type === 'subagent.run.process_terminal' ||
    type === 'subagent.run.repaired_stale' || type === 'subagent.child-status' ||
    type === 'subagent.control' || type === 'subagent.events.truncated' || STEP_TYPES.has(type);
}

module.exports = { normalizePiSubagentsEvent };
