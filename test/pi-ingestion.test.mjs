// RF-K01b3a — ledger SQLite pentru observații Pi normalizate. Fixture-urile
// sunt exclusiv sintetice; fiecare handle/director temporar se curăță în finally.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createPiIngestionStore } = require('../pi-ingestion.js');
const { normalizePiSubagentsEvent } = require('../adapters/pi-subagents-events-contract.js');
const { normalizePiSubagentsStatus } = require('../adapters/pi-subagents-contract.js');
const { openDatabase, MIGRATIONS_DIR } = require('../db.js');

const RUN = 'root-1';
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rf-k01b3a-'));
const clean = (dir) => fs.rmSync(dir, { recursive: true, force: true });
const fileFor = (dir) => path.join(dir, 'ledger.db');
const cursor = (seed = 'one', extra = {}) => ({ version: 1, fileKey: sha(seed), offset: 10, ...extra });
const storeFor = (dir, now = () => 1000) => createPiIngestionStore({ dbPath: fileFor(dir), migrationsDir: MIGRATIONS_DIR, now });

function root(nativeId = RUN, extra = {}) {
  return { nativeId, parentNativeId: null, kind: 'root', sourceState: 'running', lifecycle: 'running', agent: null, phase: null, label: null, mode: 'single', attention: null, activity: null, startedAt: 1, endedAt: null, lastActivityAt: 2, model: null, usage: { input: 2, output: 3 }, ...extra };
}
function snapshot(nativeId = RUN, extra = {}) {
  return { schemaVersion: 1, source: 'pi-subagents', observedAt: 100, root: root(nativeId), children: [], truncated: { depth: false, count: false }, warnings: [], ...extra };
}
function normalize(raw) {
  const normalized = normalizePiSubagentsEvent(raw, { expectedRunId: RUN });
  assert.equal(normalized.ok, true, `fixture b2a invalid: ${raw.type}`);
  return normalized.value;
}
function rawEvents() {
  return [
    { type: 'subagent.events.truncated', ts: 1 },
    { type: 'subagent.run.started', runId: RUN, ts: 2, mode: 'workflow' },
    { type: 'subagent.run.completed', runId: RUN, ts: 3, status: 'complete', durationMs: 4 },
    { type: 'subagent.run.paused', runId: RUN, ts: 4 },
    { type: 'subagent.run.stopped', runId: RUN, ts: 5 },
    { type: 'subagent.run.timed_out', runId: RUN, ts: 6 },
    { type: 'subagent.run.repaired_stale', runId: RUN, ts: 7 },
    { type: 'subagent.run.process_terminal', runId: RUN, ts: 8, processTerminal: { runId: RUN, state: 'observed' } },
    { type: 'subagent.step.started', runId: RUN, ts: 9, stepIndex: 1, agent: 'coder' },
    { type: 'subagent.step.completed', runId: RUN, ts: 10, stepIndex: 2, agent: 'coder', exitCode: 0, durationMs: 1 },
    { type: 'subagent.step.failed', runId: RUN, ts: 11, stepIndex: 3, agent: 'coder', exitCode: 1 },
    { type: 'subagent.step.paused', runId: RUN, ts: 12, stepIndex: 4, agent: 'coder' },
    { type: 'subagent.step.stopped', runId: RUN, ts: 13, stepIndex: 5, agent: 'coder' },
    { type: 'subagent.child-status', runId: RUN, ts: 14, version: 1, childId: 'child-1', status: 'stopped', workflowKey: 'w'.repeat(128) },
    { type: 'subagent.control', event: { runId: RUN, ts: 15, agent: 'planner', type: 'needs_attention', to: 'needs_attention', index: 1, reason: 'idle' } },
  ];
}
const observation = (extra = {}) => ({ snapshot: snapshot(), events: [normalize(rawEvents()[1])], cursor: cursor(), ...extra });
function hasCode(code, privateValues = []) {
  return (error) => {
    assert.equal(error?.code, code);
    for (const value of privateValues) assert.equal(String(error.message).includes(value), false);
    return true;
  };
}

test('lazy create, close idempotent și migrația 005 la prima operație', () => {
  const dir = tmp(); const store = storeFor(dir);
  try {
    assert.equal(fs.existsSync(fileFor(dir)), false);
    store.close(); store.close();
    store.commitObservation(observation());
    assert.equal(fs.existsSync(fileFor(dir)), true);
    store.close(); store.close();
  } finally { store.close(); clean(dir); }
});

test('migrația reală 005 este aditivă în schema_migrations și are PK/FK/index/CHECK verificabile', () => {
  const dir = tmp(); const store = storeFor(dir);
  try {
    store.commitObservation(observation()); store.close();
    const handle = openDatabase({ path: fileFor(dir), migrationsDir: MIGRATIONS_DIR });
    try {
      const applied = handle.db.prepare('SELECT name FROM schema_migrations ORDER BY name').all().map((row) => row.name);
      assert.ok(applied.includes('005-pi-ingestion.sql'));
      assert.ok(applied.includes('001-profiluri.sql') && applied.includes('002-sesiuni.sql'));
      for (const name of ['pi_run_snapshots', 'pi_run_events', 'pi_run_cursors']) {
        assert.ok(handle.db.prepare(`PRAGMA table_info(${name})`).all().some((column) => column.pk === 1));
        assert.ok(handle.db.prepare(`PRAGMA foreign_key_list(${name})`).all().some((fk) => fk.table === 'runs'));
      }
      assert.ok(handle.db.prepare("PRAGMA index_list('pi_run_events')").all().some((index) => index.name === 'idx_pi_run_events_run_time'));
    } finally { handle.close(); }
  } finally { store.close(); clean(dir); }
});

test('toate cele 15 kind-uri b2a normalizate se persistă; snapshot lifecycle rămâne autoritar', () => {
  const dir = tmp(); const store = storeFor(dir);
  try {
    const events = rawEvents().map(normalize);
    const result = store.commitObservation(observation({ events }));
    assert.equal(result.events.inserted, 15);
    assert.deepEqual(store.listEvents(RUN).map((event) => event.kind).sort(), events.map((event) => event.kind).sort());
    const terminal = normalize(rawEvents()[2]);
    store.commitObservation(observation({ events: [terminal], cursor: cursor('next', { offset: 20 }) }));
    const handle = openDatabase({ path: fileFor(dir), migrationsDir: MIGRATIONS_DIR });
    try { assert.equal(handle.db.prepare('SELECT lifecycle FROM runs WHERE id = ?').get(`pi-subagents:${RUN}`).lifecycle, 'running'); } finally { handle.close(); }
  } finally { store.close(); clean(dir); }
});

test('step/control/child-status nu acceptă lipsa câmpurilor obligatorii de bază', () => {
  const dir = tmp(); const store = storeFor(dir);
  try {
    const forms = [
      [normalize(rawEvents()[8]), ['stepIndex', 'agent']],
      [normalize(rawEvents()[9]), ['stepIndex', 'agent']],
      [normalize(rawEvents()[14]), ['agent', 'attention']],
      [normalize(rawEvents()[13]), ['childId', 'childStatus']],
    ];
    for (const [value, required] of forms) for (const field of required) {
      const broken = { ...value }; delete broken[field];
      assert.throws(() => store.commitObservation(observation({ events: [broken] })), hasCode('VALIDATION'));
    }
  } finally { store.close(); clean(dir); }
});

test('workflowKey la 128 este acceptat, la 129 este respins; status normalizat cu INVALID_STEP_NODE se persistă', () => {
  const dir = tmp(); const store = storeFor(dir);
  try {
    const valid = normalize(rawEvents()[13]);
    store.commitObservation(observation({ events: [valid] }));
    assert.throws(() => store.commitObservation(observation({ events: [{ ...valid, workflowKey: 'w'.repeat(129) }] })), hasCode('VALIDATION'));
    const status = normalizePiSubagentsStatus({ runId: 'invalid-step-root', state: 'running', startedAt: 1, steps: [null] }, { observedAt: 2 });
    assert.equal(status.ok, true);
    assert.ok(status.value.warnings.includes('INVALID_STEP_NODE'));
    store.commitObservation({ snapshot: status.value, events: [], cursor: cursor('invalid-step') });
    assert.deepEqual(store.getSnapshot('invalid-step-root').warnings, ['INVALID_STEP_NODE']);
  } finally { store.close(); clean(dir); }
});

test('replay păstrează exact usage și hashul cu canonicalizare inclusiv nested', () => {
  const dir = tmp(); const store = storeFor(dir);
  try {
    const child = { ...root('child-1'), parentNativeId: RUN, kind: 'nested', usage: { windowPeak: 9, total: 8, output: 3, input: 2 } };
    const first = snapshot(RUN, { children: [child], root: root(RUN, { usage: { windowPeak: 9, total: 8, output: 3, input: 2 } }) });
    const initial = store.commitObservation(observation({ snapshot: first }));
    const reordered = { warnings: [], truncated: { count: false, depth: false }, children: [{ usage: { input: 2, output: 3, total: 8, windowPeak: 9 }, model: null, lastActivityAt: 2, endedAt: null, startedAt: 1, activity: null, attention: null, mode: 'single', label: null, phase: null, agent: null, lifecycle: 'running', sourceState: 'running', kind: 'nested', parentNativeId: RUN, nativeId: 'child-1' }], root: { ...root(RUN, { usage: { input: 2, output: 3, total: 8, windowPeak: 9 } }) }, observedAt: 100, source: 'pi-subagents', schemaVersion: 1 };
    const replay = store.commitObservation(observation({ snapshot: reordered }));
    assert.equal(replay.snapshot.hash, initial.snapshot.hash);
    assert.equal(replay.events.inserted, 0);
    assert.deepEqual(store.getSnapshot(RUN).root.usage, { windowPeak: 9, total: 8, output: 3, input: 2 });
  } finally { store.close(); clean(dir); }
});

test('cursor same-file forward, regression rollback și rotație reset sunt distincte', () => {
  const dir = tmp(); const store = storeFor(dir);
  try {
    store.commitObservation(observation({ cursor: cursor('same', { offset: 10 }) }));
    const forward = cursor('same', { offset: 11, discardingOversizedLine: true });
    store.commitObservation(observation({ cursor: forward }));
    assert.deepEqual(store.getCursor(RUN), forward);
    assert.throws(() => store.commitObservation(observation({ snapshot: snapshot(RUN, { observedAt: 999 }), cursor: cursor('same', { offset: 9 }) })), hasCode('VALIDATION'));
    assert.equal(store.getSnapshot(RUN).observedAt, 100);
    const rotation = cursor('rotated', { offset: 0 });
    store.commitObservation(observation({ cursor: rotation }));
    assert.deepEqual(store.getCursor(RUN), rotation);
  } finally { store.close(); clean(dir); }
});

test('close/reopen și eșec SQLite după scriere păstrează atomic starea precedentă', () => {
  const dir = tmp(); let store = storeFor(dir);
  try {
    const initial = observation({ cursor: cursor('before', { offset: 7 }) });
    store.commitObservation(initial); store.close(); store = storeFor(dir);
    assert.deepEqual(store.getCursor(RUN), initial.cursor);
    const raw = openDatabase({ path: fileFor(dir), migrationsDir: MIGRATIONS_DIR });
    try { raw.db.exec(`CREATE TRIGGER reject_cursor BEFORE INSERT ON pi_run_cursors WHEN NEW.file_key = '${sha('trigger')}' BEGIN SELECT RAISE(ABORT, 'private-trigger-message'); END;`); } finally { raw.close(); }
    assert.throws(() => store.commitObservation(observation({ snapshot: snapshot(RUN, { observedAt: 999 }), events: [normalize({ type: 'subagent.run.timed_out', runId: RUN, ts: 999 })], cursor: cursor('trigger', { offset: 999 }) })), hasCode('PERSISTENCE', ['private-trigger-message', dir, 'SELECT']));
    assert.deepEqual(store.getCursor(RUN), initial.cursor);
    assert.equal(store.getSnapshot(RUN).observedAt, 100);
    assert.equal(store.listEvents(RUN).length, 1);
  } finally { store.close(); clean(dir); }
});

test('CHECK-urile SQL file_key, offset, discard și event_type sunt testate cu run existent, nu prin FK', () => {
  const dir = tmp(); const store = storeFor(dir);
  try {
    store.commitObservation(observation()); store.close();
    const handle = openDatabase({ path: fileFor(dir), migrationsDir: MIGRATIONS_DIR }); const runId = `pi-subagents:${RUN}`;
    try {
      const insertCursor = handle.db.prepare('INSERT INTO pi_run_cursors(run_id,file_key,offset,discarding_oversized_line,updated_at) VALUES (?, ?, ?, ?, 1)');
      const insertRun = handle.db.prepare("INSERT INTO runs(id,source_harness,native_id,lifecycle,first_observed_at,last_observed_at,created_at,updated_at,revision) VALUES (?,?,?,'running',1,1,1,1,1)");
      insertRun.run('pi-subagents:check-a', 'pi-subagents', 'check-a');
      insertRun.run('pi-subagents:check-b', 'pi-subagents', 'check-b');
      assert.throws(() => insertCursor.run('pi-subagents:check-a', 'A'.repeat(64), 1, 0));
      assert.throws(() => insertCursor.run('pi-subagents:check-b', sha('b'), -1, 0));
      assert.throws(() => insertCursor.run('pi-subagents:check-b', sha('b'), 1, 2));
      assert.throws(() => handle.db.prepare("INSERT INTO pi_run_events(event_id,run_id,event_type,event_json,stored_at) VALUES (?, ?, 'bad_kind', '{}', 1)").run(sha('bad'), runId));
    } finally { handle.close(); }
  } finally { store.close(); clean(dir); }
});

test('validările ostile tabelare r2 resping valori private, limite, enumuri și numerice fără ecou', () => {
  const dir = tmp(); const store = storeFor(dir); const secret = 'PRIVATE_task_prompt_message_output_error_path';
  try {
    const privateKeys = ['task', 'prompt', 'message', 'output', 'error', 'path', 'cwd', 'sessionPath', 'url'];
    const cases = [
      ...privateKeys.map((key) => observation({ events: [{ ...normalize(rawEvents()[1]), [key]: secret }] })),
      observation({ snapshot: snapshot(RUN, { root: root(RUN, { usage: { input: 1, nested: { prompt: secret } } }) }) }),
      observation({ snapshot: snapshot('bad\u0000id') }), observation({ snapshot: snapshot('x'.repeat(257)) }),
      observation({ snapshot: snapshot(RUN, { observedAt: NaN }) }), observation({ snapshot: snapshot(RUN, { observedAt: Infinity }) }),
      observation({ events: [{ ...normalize(rawEvents()[1]), ts: Number.MAX_SAFE_INTEGER + 1 }] }), observation({ events: [{ ...normalize(rawEvents()[1]), ts: -1 }] }),
      observation({ snapshot: snapshot(RUN, { root: root(RUN, { lifecycle: 'invented' }) }) }), observation({ events: [{ ...normalize(rawEvents()[1]), mode: 'invented' }] }),
    ];
    store.commitObservation({ snapshot: snapshot('m'.repeat(256)), events: [], cursor: cursor('max-id') });
    for (const input of cases) assert.throws(() => store.commitObservation(input), hasCode('VALIDATION', [secret, dir, 'SELECT']));
  } finally { store.close(); clean(dir); }
});

// RF-K01b3a r3: completări aditive după re-review.
test('r3 fiecare formă step/control/child-status respinge orice câmp obligatoriu, inclusiv baza comună', () => {
  const dir = tmp(); const store = storeFor(dir);
  try {
    const common = ['schemaVersion', 'source', 'kind', 'ts', 'runId'];
    const forms = [
      [normalize(rawEvents()[8]), [...common, 'stepIndex', 'agent']], [normalize(rawEvents()[9]), [...common, 'stepIndex', 'agent']],
      [normalize(rawEvents()[10]), [...common, 'stepIndex', 'agent']], [normalize(rawEvents()[11]), [...common, 'stepIndex', 'agent']],
      [normalize(rawEvents()[12]), [...common, 'stepIndex', 'agent']], [normalize(rawEvents()[14]), [...common, 'agent', 'attention']],
      [normalize(rawEvents()[13]), [...common, 'childId', 'childStatus']],
    ];
    for (const [valid, required] of forms) for (const field of required) {
      const broken = { ...valid }; delete broken[field];
      assert.throws(() => store.commitObservation(observation({ events: [broken] })), hasCode('VALIDATION'));
    }
  } finally { store.close(); clean(dir); }
});

test('r3 replayul aceluiași event reordonat păstrează rows, revision, usage și raportează duplicate', () => {
  const dir = tmp(); const store = storeFor(dir);
  try {
    const firstEvent = normalize(rawEvents()[1]);
    const first = store.commitObservation(observation({ events: [firstEvent] }));
    const reorderedEvent = { mode: firstEvent.mode, runId: firstEvent.runId, ts: firstEvent.ts, kind: firstEvent.kind, source: firstEvent.source, schemaVersion: firstEvent.schemaVersion };
    const replay = store.commitObservation(observation({ events: [reorderedEvent] }));
    assert.equal(first.events.inserted, 1); assert.equal(replay.events.inserted, 0); assert.equal(replay.events.duplicate, 1);
    assert.equal(store.listEvents(RUN).length, 1);
    const handle = openDatabase({ path: fileFor(dir), migrationsDir: MIGRATIONS_DIR });
    try { assert.equal(handle.db.prepare('SELECT revision FROM runs WHERE id = ?').get(`pi-subagents:${RUN}`).revision, 1); } finally { handle.close(); }
    assert.deepEqual(store.getSnapshot(RUN).root.usage, { input: 2, output: 3 });
  } finally { store.close(); clean(dir); }
});

test('r3 matrice ostilă separă unknown keys, mismatch, limite, numere și enumuri fără persistență sau ecou', () => {
  const dir = tmp(); const store = storeFor(dir); const secret = 'R3_PRIVATE_task_prompt_message_output_error_path';
  try {
    const started = normalize(rawEvents()[1]);
    const badNumberCases = [observation({ snapshot: snapshot(RUN, { observedAt: NaN }) }), observation({ snapshot: snapshot(RUN, { observedAt: Infinity }) }), observation({ events: [{ ...started, ts: Number.MAX_SAFE_INTEGER + 1 }] }), observation({ events: [{ ...started, ts: -1 }] })];
    const enumCases = [observation({ snapshot: snapshot(RUN, { root: root(RUN, { lifecycle: 'not-a-lifecycle' }) }) }), observation({ events: [{ ...started, mode: 'not-a-mode' }] }), observation({ events: [{ ...normalize(rawEvents()[13]), childStatus: 'not-a-status' }] })];
    const privateCases = ['task', 'prompt', 'message', 'output', 'error', 'path', 'cwd', 'sessionPath', 'url'].map((key) => observation({ events: [{ ...started, [key]: secret }] }));
    const inputs = [
      observation({ snapshot: snapshot(RUN, { unknownSnapshot: secret }) }), observation({ events: [{ ...started, unknownEvent: secret }] }), observation({ cursor: { ...cursor(), unknownCursor: secret } }),
      observation({ events: [{ ...started, runId: 'other-run' }] }), observation({ snapshot: snapshot('') }), observation({ snapshot: snapshot('i'.repeat(257)) }), observation({ snapshot: snapshot('control\u0000id') }),
      ...badNumberCases, ...enumCases, ...privateCases,
      observation({ snapshot: snapshot(RUN, { root: root(RUN, { usage: { input: 1, nested: { prompt: secret } } }) }) }),
      observation({ snapshot: snapshot(RUN, { warnings: Array.from({ length: 200000 }, () => 'UNKNOWN_STATE') }) }),
      observation({ events: [{ ...started, mode: secret.repeat(70000) }] }), observation({ events: Array.from({ length: 1001 }, () => started) }),
      observation({ snapshot: snapshot(RUN, { children: Array.from({ length: 1001 }, (_, index) => ({ ...root(`child-${index}`), parentNativeId: RUN, kind: 'step' })) }) }),
    ];
    store.commitObservation({ snapshot: snapshot('a'.repeat(256)), events: [], cursor: cursor('id-256') });
    for (const input of inputs) assert.throws(() => store.commitObservation(input), hasCode('VALIDATION', [secret, dir, 'SELECT']));
    assert.throws(() => createPiIngestionStore(null), hasCode('VALIDATION'));
    assert.throws(() => createPiIngestionStore('not-an-options-object'), hasCode('VALIDATION'));
  } finally { store.close(); clean(dir); }
});
