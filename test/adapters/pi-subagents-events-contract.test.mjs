// RF-K01b2a: contract pur; fără filesystem, rețea, DB, server sau procese copil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizePiSubagentsEvent } = require('../../adapters/pi-subagents-events-contract.js');

const RUN_ID = 'run-accepted';
const TS = 1700000000000;
const OPTIONS = { expectedRunId: RUN_ID };
const invalid = { ok: false, error: { code: 'INVALID_EVENT' } };
const unsupported = { ok: false, error: { code: 'UNSUPPORTED_EVENT' } };
const mismatch = { ok: false, error: { code: 'RUN_ID_MISMATCH' } };

function event(type, fields = {}) {
  return { type, ts: TS, runId: RUN_ID, ...fields };
}

function normalize(raw, options = OPTIONS) {
  return normalizePiSubagentsEvent(raw, options);
}

function value(raw, options = OPTIONS) {
  const result = normalize(raw, options);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
}

function base(kind, extras = {}) {
  return {
    schemaVersion: 1,
    source: 'pi-subagents-events',
    kind,
    ts: TS,
    runId: RUN_ID,
    ...extras
  };
}

function assertPrivateAbsent(result, markers) {
  const serialized = JSON.stringify(result);
  for (const marker of markers) assert.equal(serialized.includes(marker), false, `private marker leaked: ${marker}`);
}

test('invalid options, raw inputs, and malformed known types return the exact stable error', () => {
  const invalidOptions = [undefined, null, [], {}, { expectedRunId: '' }, { expectedRunId: ' spaced ' }, { expectedRunId: 'bad\nrun' }, { expectedRunId: 42 }];
  for (const options of invalidOptions) {
    assert.doesNotThrow(() => normalizePiSubagentsEvent(event('subagent.run.paused'), options));
    assert.deepEqual(normalizePiSubagentsEvent(event('subagent.run.paused'), options), invalid);
  }
  for (const raw of [undefined, null, [], 'line', 3, {}, { type: 2 }, { type: 'subagent.run.started', ts: TS, runId: RUN_ID }]) {
    assert.doesNotThrow(() => normalize(raw));
    assert.deepEqual(normalize(raw), invalid);
  }
});

test('unknown type is unsupported without echoing attacker payload', () => {
  const marker = 'UNKNOWN_EVENT_PRIVATE_MARKER';
  const result = normalize({ type: 'subagent.future.private', secret: marker }, OPTIONS);
  assert.deepEqual(result, unsupported);
  assertPrivateAbsent(result, [marker, 'subagent.future.private']);
});

test('all lifecycle kinds project exact versioned allowlisted envelopes', () => {
  const cases = [
    [event('subagent.run.started', { mode: 'workflow' }), base('run_started', { mode: 'workflow' })],
    [event('subagent.run.completed', { status: 'complete', durationMs: 4 }), base('run_completed', { state: 'completed', durationMs: 4 })],
    [event('subagent.run.paused'), base('run_paused', { state: 'paused' })],
    [event('subagent.run.stopped'), base('run_stopped', { state: 'stopped' })],
    [event('subagent.run.timed_out'), base('run_timed_out')],
    [event('subagent.run.process_terminal', { processTerminal: { state: 'observed', runId: RUN_ID } }), base('run_process_terminal', { processState: 'observed' })],
    [event('subagent.run.repaired_stale'), base('run_repaired_stale')],
    [event('subagent.step.started', { stepIndex: 0, agent: 'planner' }), base('step_started', { stepIndex: 0, agent: 'planner' })],
    [event('subagent.step.completed', { stepIndex: 1, agent: 'coder', exitCode: 0, durationMs: 5 }), base('step_completed', { stepIndex: 1, agent: 'coder', exitCode: 0, durationMs: 5 })],
    [event('subagent.step.failed', { stepIndex: 2, agent: 'tester', exitCode: 1, durationMs: 6 }), base('step_failed', { stepIndex: 2, agent: 'tester', exitCode: 1, durationMs: 6 })],
    [event('subagent.step.paused', { stepIndex: 3, agent: 'reviewer', durationMs: 7 }), base('step_paused', { stepIndex: 3, agent: 'reviewer', durationMs: 7 })],
    [event('subagent.step.stopped', { stepIndex: 4, agent: 'worker', exitCode: -1, durationMs: 8 }), base('step_stopped', { stepIndex: 4, agent: 'worker', exitCode: -1, durationMs: 8 })],
    [event('subagent.child-status', { version: 1, childId: 'child-1', status: 'stopping' }), base('child_status', { childId: 'child-1', childStatus: 'stopping' })],
    [{ type: 'subagent.control', event: { type: 'needs_attention', to: 'needs_attention', ts: TS, runId: RUN_ID, agent: 'reviewer' } }, base('control_attention', { agent: 'reviewer', attention: 'needs_attention' })],
    [{ type: 'subagent.events.truncated', ts: TS }, base('source_truncated')]
  ];
  assert.equal(cases.length, 15);
  for (const [raw, expected] of cases) assert.deepEqual(value(raw), expected);
});

test('run start validates all modes and artifact version while excluding private fields', () => {
  for (const mode of ['single', 'parallel', 'chain', 'workflow']) {
    assert.deepEqual(value(event('subagent.run.started', { mode, lifecycleArtifactVersion: 1000 })), base('run_started', { mode, lifecycleArtifactVersion: 1000 }));
  }
  for (const bad of ['', 'unknown', null, 1]) assert.deepEqual(normalize(event('subagent.run.started', { mode: bad })), invalid);
  for (const bad of [0, 1001, 1.5, NaN, Infinity]) assert.deepEqual(normalize(event('subagent.run.started', { mode: 'single', lifecycleArtifactVersion: bad })), invalid);
  const result = value(event('subagent.run.started', { mode: 'single', cwd: 'PRIVATE_CWD', task: 'PRIVATE_TASK', prompt: 'PRIVATE_PROMPT', args: { secret: 'PRIVATE_ARGS' } }));
  assertPrivateAbsent(result, ['PRIVATE_CWD', 'PRIVATE_TASK', 'PRIVATE_PROMPT', 'PRIVATE_ARGS']);
});

test('run completed validates states and bounds; terminal run hints do not invent state', () => {
  for (const state of ['complete', 'completed', 'failed', 'partial', 'paused', 'stopped']) {
    const expectedState = state === 'complete' ? 'completed' : state;
    assert.equal(value(event('subagent.run.completed', { status: state })).state, expectedState);
  }
  for (const lifecycleArtifactVersion of [1, 1000]) {
    assert.equal(value(event('subagent.run.completed', { status: 'completed', lifecycleArtifactVersion })).lifecycleArtifactVersion, lifecycleArtifactVersion);
  }
  for (const bad of ['running', '', 1, null]) assert.deepEqual(normalize(event('subagent.run.completed', { status: bad })), invalid);
  for (const bad of [0, 1001]) assert.deepEqual(normalize(event('subagent.run.completed', { status: 'completed', lifecycleArtifactVersion: bad })), invalid);
  for (const bad of [-1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.deepEqual(normalize(event('subagent.run.completed', { status: 'completed', durationMs: bad })), invalid);
  for (const raw of [
    event('subagent.run.paused', { message: 'PRIVATE_MESSAGE' }),
    event('subagent.run.stopped', { message: 'PRIVATE_MESSAGE' }),
    event('subagent.run.timed_out', { message: 'PRIVATE_MESSAGE', timeoutMs: 5, deadlineAt: 6 }),
    event('subagent.run.repaired_stale', { message: 'PRIVATE_MESSAGE', pid: 9, resultPath: 'PRIVATE_PATH' })
  ]) {
    const projected = value(raw);
    assert.equal(Object.hasOwn(projected, 'message'), false);
    assert.equal(Object.hasOwn(projected, 'state'), raw.type === 'subagent.run.paused' || raw.type === 'subagent.run.stopped');
    assertPrivateAbsent(projected, ['PRIVATE_MESSAGE', 'PRIVATE_PATH']);
  }
});

test('process terminal validates nested anchor and excludes its private proof', () => {
  for (const state of ['observed', 'unknown']) {
    assert.deepEqual(value(event('subagent.run.process_terminal', {
      lifecycleArtifactVersion: 3,
      processTerminal: { state, runId: RUN_ID, diagnostic: 'PRIVATE_DIAGNOSTIC', runnerProcessInstanceId: 'PRIVATE_PROCESS', reason: 'PRIVATE_REASON' }
    })), base('run_process_terminal', { processState: state, lifecycleArtifactVersion: 3 }));
  }
  assert.deepEqual(normalize(event('subagent.run.process_terminal', { processTerminal: { state: 'observed', runId: 'other-run' } })), mismatch);
  for (const proof of [null, [], { state: 'gone', runId: RUN_ID }, { state: 'observed', runId: '' }, new (class Proof {})()]) {
    assert.deepEqual(normalize(event('subagent.run.process_terminal', { processTerminal: proof })), invalid);
  }
});

test('step lifecycle validates bounds and omits null exitCode, usage and private payloads', () => {
  const terminalTypes = ['completed', 'failed', 'paused', 'stopped'];
  for (const state of terminalTypes) {
    const projected = value(event(`subagent.step.${state}`, { stepIndex: 1000000, agent: 'a'.repeat(128), exitCode: null, durationMs: 0, tokens: { total: 44 }, task: 'PRIVATE_TASK', output: 'PRIVATE_OUTPUT', error: 'PRIVATE_ERROR' }));
    assert.equal(Object.hasOwn(projected, 'exitCode'), false);
    assertPrivateAbsent(projected, ['PRIVATE_TASK', 'PRIVATE_OUTPUT', 'PRIVATE_ERROR', 'tokens']);
  }
  for (const badIndex of [-1, 1000001, 0.5, NaN, Infinity]) assert.deepEqual(normalize(event('subagent.step.started', { stepIndex: badIndex, agent: 'worker' })), invalid);
  for (const badAgent of ['', ' worker', 'worker ', 'bad\u0000agent', 'a'.repeat(129)]) assert.deepEqual(normalize(event('subagent.step.started', { stepIndex: 0, agent: badAgent })), invalid);
  for (const badExit of [-2147483649, 2147483648, 1.5, NaN, Infinity]) assert.deepEqual(normalize(event('subagent.step.failed', { stepIndex: 0, agent: 'worker', exitCode: badExit })), invalid);
  for (const badDuration of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(normalize(event('subagent.step.failed', { stepIndex: 0, agent: 'worker', durationMs: badDuration })), invalid);
  }
});

test('direct event timestamps and all projected ID/string boundaries are enforced', () => {
  for (const badTs of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(normalize(event('subagent.run.paused', { ts: badTs })), invalid);
  }

  const id256 = 'r'.repeat(256);
  assert.deepEqual(value(event('subagent.run.paused', { runId: id256 }), { expectedRunId: id256 }), {
    schemaVersion: 1, source: 'pi-subagents-events', kind: 'run_paused', ts: TS, runId: id256, state: 'paused'
  });
  assert.deepEqual(normalizePiSubagentsEvent(event('subagent.run.paused', { runId: 'r'.repeat(257) }), { expectedRunId: 'r'.repeat(257) }), invalid);
  assert.deepEqual(normalize(event('subagent.run.paused', { runId: 'bad\u0085run' })), invalid);

  const child256 = 'c'.repeat(256);
  const workflow128 = 'w'.repeat(128);
  const agent128 = 'a'.repeat(128);
  assert.deepEqual(value(event('subagent.child-status', {
    version: 1, childId: child256, status: 'stopped', workflowKey: workflow128, agent: agent128, stepIndex: 1000000
  })), base('child_status', {
    childId: child256, childStatus: 'stopped', workflowKey: workflow128, agent: agent128, stepIndex: 1000000
  }));
  for (const fields of [
    { version: 1, childId: 'c'.repeat(257), status: 'stopped' },
    { version: 1, childId: 'child', status: 'stopped', workflowKey: 'w'.repeat(129) },
    { version: 1, childId: 'child', status: 'stopped', agent: 'a'.repeat(129) },
    { version: 1, childId: 'child', status: 'stopped', stepIndex: 1000001 }
  ]) assert.deepEqual(normalize(event('subagent.child-status', fields)), invalid);
});

test('child status validates fields and omits child-control and path metadata', () => {
  const childRunId256 = 'r'.repeat(256);
  assert.equal(value(event('subagent.child-status', {
    version: 1, childId: 'child', status: 'stopped', childRunId: childRunId256
  })).childRunId, childRunId256);
  for (const childRunId of ['r'.repeat(257), 'bad\u0000child-run']) {
    assert.deepEqual(normalize(event('subagent.child-status', {
      version: 1, childId: 'child', status: 'stopped', childRunId
    })), invalid);
  }
  const projected = value(event('subagent.child-status', {
    version: 1, childId: 'child', status: 'stopped', stepIndex: 2, agent: 'worker', childRunId: 'nested', workflowKey: 'lane',
    reason: 'PRIVATE_REASON', phase: 'PRIVATE_PHASE', label: 'PRIVATE_LABEL', source: 'PRIVATE_SOURCE', asyncDir: 'PRIVATE_PATH'
  }));
  assert.deepEqual(projected, base('child_status', { childId: 'child', childStatus: 'stopped', stepIndex: 2, agent: 'worker', childRunId: 'nested', workflowKey: 'lane' }));
  assertPrivateAbsent(projected, ['PRIVATE_REASON', 'PRIVATE_PHASE', 'PRIVATE_LABEL', 'PRIVATE_SOURCE', 'PRIVATE_PATH']);
  for (const raw of [
    event('subagent.child-status', { version: 2, childId: 'child', status: 'stopped' }),
    event('subagent.child-status', { version: 1, childId: '', status: 'stopped' }),
    event('subagent.child-status', { version: 1, childId: 'child', status: 'running' }),
    event('subagent.child-status', { version: 1, childId: 'child', status: 'stopped', workflowKey: 'bad\u007fkey' }),
    event('subagent.child-status', { version: 1, childId: 'child', status: 'stopped', childRunId: ' bad' })
  ]) assert.deepEqual(normalize(raw), invalid);
});

test('control projects only nested event attention and validates both values and reasons', () => {
  for (const attention of ['active_long_running', 'needs_attention']) {
    const projected = value({ type: 'subagent.control', noticeText: 'PRIVATE_NOTICE', channels: ['PRIVATE'], targets: ['PRIVATE'], event: {
      type: attention, to: attention, ts: TS, runId: RUN_ID, agent: 'worker', index: 3, reason: 'supervisor_request',
      message: 'PRIVATE_MESSAGE', taskPreview: 'PRIVATE_TASK', recentFailureSummary: 'PRIVATE_FAILURE', currentPath: 'PRIVATE_PATH', currentTool: 'PRIVATE_TOOL', tokens: 5, workflowKey: 'PRIVATE_WORKFLOW'
    } });
    assert.deepEqual(projected, base('control_attention', { agent: 'worker', attention, stepIndex: 3, reason: 'supervisor_request' }));
    assertPrivateAbsent(projected, ['PRIVATE_NOTICE', 'PRIVATE_MESSAGE', 'PRIVATE_TASK', 'PRIVATE_FAILURE', 'PRIVATE_PATH', 'PRIVATE_TOOL', 'PRIVATE_WORKFLOW']);
  }
  assert.deepEqual(normalize({ type: 'subagent.control', event: { type: 'needs_attention', to: 'needs_attention', ts: TS, runId: 'other', agent: 'worker' } }), mismatch);
  for (const bad of ['unknown', '', 1]) assert.deepEqual(normalize({ type: 'subagent.control', event: { type: bad, to: 'needs_attention', ts: TS, runId: RUN_ID, agent: 'worker' } }), invalid);
  for (const bad of ['unknown', '', 1]) assert.deepEqual(normalize({ type: 'subagent.control', event: { type: 'needs_attention', to: bad, ts: TS, runId: RUN_ID, agent: 'worker' } }), invalid);
  for (const badIndex of [-1, 1000001, 1.5, NaN, Infinity]) assert.deepEqual(normalize({ type: 'subagent.control', event: { type: 'needs_attention', to: 'needs_attention', ts: TS, runId: RUN_ID, agent: 'worker', index: badIndex } }), invalid);
  for (const reason of ['idle', 'completion_guard', 'active_long_running', 'tool_failures', 'supervisor_request', 'time_threshold', 'turn_threshold', 'token_threshold', 'tool_open_threshold']) {
    assert.equal(value({ type: 'subagent.control', event: { type: 'needs_attention', to: 'needs_attention', ts: TS, runId: RUN_ID, agent: 'worker', reason } }).reason, reason);
  }
  assert.deepEqual(normalize({ type: 'subagent.control', event: { type: 'needs_attention', to: 'needs_attention', ts: TS, runId: RUN_ID, agent: 'worker', reason: 'not-a-reason' } }), invalid);
});

test('truncation marker anchors to expected run and omits diagnostic fields', () => {
  assert.deepEqual(value({ type: 'subagent.events.truncated', ts: TS, maxBytes: 99, droppedEventType: 'PRIVATE_DROPPED' }), base('source_truncated'));
  assert.deepEqual(value({ type: 'subagent.events.truncated', ts: TS, runId: RUN_ID }), base('source_truncated'));
  assert.deepEqual(normalize({ type: 'subagent.events.truncated', ts: TS, runId: 'other' }), mismatch);
  assert.deepEqual(normalize({ type: 'subagent.events.truncated', ts: TS, runId: '' }), invalid);
  for (const badTs of [-1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.deepEqual(normalize({ type: 'subagent.events.truncated', ts: badTs }), invalid);
});

test('direct and nested run ID mismatches are distinct from malformed IDs', () => {
  assert.deepEqual(normalize(event('subagent.step.started', { runId: 'other', stepIndex: 0, agent: 'worker' })), mismatch);
  assert.deepEqual(normalize(event('subagent.child-status', { runId: 'other', version: 1, childId: 'child', status: 'stopped' })), mismatch);
  assert.deepEqual(normalize(event('subagent.run.completed', { runId: 'other', status: 'completed' })), mismatch);
  assert.deepEqual(normalize(event('subagent.run.started', { runId: ' bad ', mode: 'single' })), invalid);
  assert.deepEqual(normalize(event('subagent.run.process_terminal', { processTerminal: { state: 'observed', runId: 'other' } })), mismatch);
  assert.deepEqual(normalize({ type: 'subagent.control', event: { type: 'needs_attention', to: 'needs_attention', ts: TS, runId: 'other', agent: 'worker' } }), mismatch);
});

test('plain null-prototype records are accepted while arrays and class instances are rejected where records are required', () => {
  const raw = Object.assign(Object.create(null), { type: 'subagent.run.started', ts: TS, runId: RUN_ID, mode: 'single' });
  assert.deepEqual(value(raw), base('run_started', { mode: 'single' }));
  const control = Object.assign(Object.create(null), { type: 'needs_attention', to: 'needs_attention', ts: TS, runId: RUN_ID, agent: 'worker' });
  assert.deepEqual(value({ type: 'subagent.control', event: control }), base('control_attention', { agent: 'worker', attention: 'needs_attention' }));
  class EventRecord { constructor() { this.type = 'subagent.run.started'; this.ts = TS; this.runId = RUN_ID; this.mode = 'single'; } }
  class Proof { constructor() { this.state = 'observed'; this.runId = RUN_ID; } }
  assert.deepEqual(normalize(new EventRecord()), invalid);
  assert.deepEqual(normalize(event('subagent.run.process_terminal', { processTerminal: [] })), invalid);
  assert.deepEqual(normalize(event('subagent.run.process_terminal', { processTerminal: new Proof() })), invalid);
});

test('hostile aggregate never leaks private data and output shares no nested raw references', () => {
  const marker = 'RF_K01B2A_PRIVATE_MARKER';
  const raw = event('subagent.control', {
    message: marker, prompt: marker, output: marker, error: marker, cwd: marker, path: marker, sessionPath: marker,
    args: { marker }, tool: { marker }, totalTokens: { marker }, totalCost: marker, usageBudget: { marker }, diagnostics: marker,
    event: { type: 'needs_attention', to: 'needs_attention', ts: TS, runId: RUN_ID, agent: 'worker', message: marker, taskPreview: marker, recentFailureSummary: marker, currentPath: marker, currentTool: marker, metadata: { marker } }
  });
  const result = normalize(raw);
  assert.equal(result.ok, true);
  assertPrivateAbsent(result, [marker]);
  raw.event.agent = marker;
  raw.event.metadata.marker = 'MUTATED_PRIVATE_MARKER';
  assertPrivateAbsent(result, [marker, 'MUTATED_PRIVATE_MARKER']);
  assert.deepEqual(result.value, base('control_attention', { agent: 'worker', attention: 'needs_attention' }));
});
