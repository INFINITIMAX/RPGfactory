// RF-K01b3b: coordonatorul leagă numai fixture-uri Pi sintetice, directoare temporare și SQLite temporar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createPiIngestionCoordinator } = require('../pi-ingestion-coordinator.js');
const { createPiIngestionStore } = require('../pi-ingestion.js');
const { MIGRATIONS_DIR, openDatabase } = require('../db.js');

const RUN = 'coordinator-root';
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

function workspace(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-k01b3b-'));
  const root = path.join(directory, 'root');
  const runDirectory = path.join(root, 'run');
  fs.mkdirSync(runDirectory, { recursive: true });
  const store = createPiIngestionStore({ dbPath: path.join(directory, 'ledger.sqlite'), migrationsDir: MIGRATIONS_DIR, now: () => 1000 });
  t.after(() => { store.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  return { directory, root, runDirectory, eventsPath: path.join(runDirectory, 'events.jsonl'), store };
}

function status(runId = RUN, state = 'running', privateValue) {
  const value = { runId, state, startedAt: 10, steps: [] };
  if (privateValue) value.prompt = privateValue;
  return value;
}
function writeStatus(source, value = status()) { fs.writeFileSync(path.join(source.runDirectory, 'status.json'), JSON.stringify(value)); }
function event(type, ts, extra = {}) { return JSON.stringify({ type, runId: RUN, ts, ...extra }); }
function append(source, ...lines) { fs.appendFileSync(source.eventsPath, lines.map((line) => line + '\n').join('')); }
function options(source, extra = {}) { return { root: source.root, runDirectory: source.runDirectory, expectedRunId: RUN, ...extra }; }
function privateFree(value, markers) {
  const text = JSON.stringify(value);
  for (const marker of markers) assert.equal(text.includes(marker), false, `private marker leaked: ${marker}`);
}
function cursor(seed, offset = 0) { return { version: 1, fileKey: sha(seed), offset }; }
function revision(source, runId = RUN) {
  const handle = openDatabase({ path: path.join(source.directory, 'ledger.sqlite'), migrationsDir: MIGRATIONS_DIR, now: () => 1002 });
  try { return handle.db.prepare('SELECT revision FROM runs WHERE id = ?').get('pi-subagents:' + runId)?.revision ?? null; } finally { handle.close(); }
}
function validReaders(snapshot, eventValue = { events: [], cursor: cursor('reader', 0), hasMore: false, incompleteLine: false, reset: null, warnings: [] }) {
  return {
    scanStatuses: () => ({ ok: true, value: { runs: [snapshot], warnings: [] } }),
    readEvents: () => ({ ok: true, value: eventValue })
  };
}

// K01B3B-1: validation occurs before readers/stores can observe unsafe input.
test('factory and ingest options reject unknown, relative, outside, invalid IDs and invalid limits without throw or echo', (t) => {
  const source = workspace(t); let calls = 0;
  const coordinator = createPiIngestionCoordinator({ store: { getCursor: () => { calls += 1; return null; }, commitObservation: () => { calls += 1; } }, scanStatuses: () => { calls += 1; }, readEvents: () => { calls += 1; } });
  const invalid = [undefined, null, {}, { ...options(source), unknown: 'PRIVATE_UNKNOWN' },
    { ...options(source), root: 'relative' }, { ...options(source), runDirectory: path.join(source.root, '..', 'outside') },
    { ...options(source), expectedRunId: ' bad ' }, { ...options(source), expectedRunId: 'bad\u0000id' },
    { ...options(source), maxLines: 0 }, { ...options(source), maxLines: 1001 },
    { ...options(source), maxReadBytes: 256, maxEventBytes: 256 },
    { ...options(source), maxReadBytes: 64 * 1024 }, { ...options(source), maxEventBytes: 1024 * 1024 },
    { ...options(source), maxReadBytes: 4 * 1024 * 1024 + 1 },
    { ...options(source), maxEventBytes: 1024 * 1024 + 1 },
    { ...options(source), maxStatusBytes: 4 * 1024 * 1024 + 1 },
    { ...options(source), observedAt: -1 }, { ...options(source), observedAt: Number.MAX_SAFE_INTEGER + 1 }];
  for (const input of invalid) {
    assert.doesNotThrow(() => coordinator.ingestRun(input));
    const result = coordinator.ingestRun(input);
    assert.deepEqual(result, { ok: false, error: { code: 'INVALID_OPTIONS' } });
    privateFree(result, ['PRIVATE_UNKNOWN', source.directory]);
  }
  assert.equal(calls, 0);
  let received;
  const defaults = createPiIngestionCoordinator({ store: source.store, scanStatuses: () => ({ ok: true, value: { runs: [], warnings: [] } }), readEvents: (input) => { received = input; } });
  defaults.ingestRun(options(source));
  assert.equal(received, undefined, 'a missing snapshot must not reach the event reader');
  const limits = createPiIngestionCoordinator({ store: source.store, scanStatuses: () => ({ ok: true, value: { runs: [], warnings: [] } }) });
  assert.deepEqual(limits.ingestRun(options(source, { maxReadBytes: 64 * 1024, maxEventBytes: 64 * 1024 })), { ok: false, error: { code: 'INVALID_OPTIONS' } });
  assert.deepEqual(createPiIngestionCoordinator({}).ingestRun(options(source)), { ok: false, error: { code: 'INVALID_OPTIONS' } });
});

// K01B3B-2/3/5/6: actual b1, b2b and b3a cooperate over restart and replay.
test('real readers and store commit snapshot/event/cursor, preserve snapshot lifecycle, restart from cursor and replay idempotently', (t) => {
  const source = workspace(t); writeStatus(source, status(RUN, 'running'));
  fs.writeFileSync(source.eventsPath, '');
  append(source, event('subagent.run.completed', 1, { status: 'complete' }));
  const coordinator = createPiIngestionCoordinator({ store: source.store });
  const first = coordinator.ingestRun(options(source));
  assert.equal(first.ok, true); assert.equal(first.value.committed, true); assert.equal(first.value.inserted, 1);
  assert.equal(source.store.getSnapshot(RUN).root.lifecycle, 'running');
  const firstCursor = source.store.getCursor(RUN);
  source.store.close();
  const reopened = createPiIngestionStore({ dbPath: path.join(source.directory, 'ledger.sqlite'), migrationsDir: MIGRATIONS_DIR, now: () => 1001 });
  const resumed = createPiIngestionCoordinator({ store: reopened });
  append(source, event('subagent.run.paused', 2));
  const second = resumed.ingestRun(options(source));
  assert.equal(second.value.inserted, 1); assert.ok(second.value.cursor.offset > firstCursor.offset);
  const replay = resumed.ingestRun(options(source));
  assert.equal(replay.value.inserted, 0); assert.equal(replay.value.duplicate, 0);
  assert.equal(reopened.listEvents(RUN).length, 2);
  assert.equal(reopened.getSnapshot(RUN).root.lifecycle, 'running');
  reopened.close();
});

test('each call processes one bounded window and passes the committed cursor unchanged to b2b', (t) => {
  const source = workspace(t); writeStatus(source); fs.writeFileSync(source.eventsPath, '');
  append(source, event('subagent.run.paused', 1), event('subagent.run.stopped', 2));
  const coordinator = createPiIngestionCoordinator({ store: source.store });
  const first = coordinator.ingestRun(options(source, { maxLines: 1 }));
  assert.equal(first.value.read, 1); assert.equal(first.value.hasMore, true);
  const committedCursor = source.store.getCursor(RUN);
  let receivedCursor;
  const observed = createPiIngestionCoordinator({ store: source.store,
    scanStatuses: (input) => require('../adapters/pi-subagents-files.js').scanPiSubagentsStatuses(input),
    readEvents: (input) => { receivedCursor = input.cursor; return require('../adapters/pi-subagents-events-file.js').readPiSubagentsEvents(input); } });
  const second = observed.ingestRun(options(source, { maxLines: 1 }));
  assert.deepEqual(receivedCursor, committedCursor);
  assert.equal(second.value.read, 1); assert.equal(second.value.hasMore, false);
  assert.equal(source.store.listEvents(RUN).length, 2);
});

// K01B3B-4/8: failures never reach event reading or persistence, and private details stay private.
test('missing, mismatched and unsafe sources plus reader/store exceptions leave cursor unchanged and return sanitized results', (t) => {
  const source = workspace(t); writeStatus(source); fs.writeFileSync(source.eventsPath, '');
  const original = cursor('old', 7); source.store.commitObservation({ snapshot: { schemaVersion: 1, source: 'pi-subagents', observedAt: 1, root: { nativeId: RUN, parentNativeId: null, kind: 'root', sourceState: 'running', lifecycle: 'running', agent: null, phase: null, label: null, mode: 'single', attention: null, activity: null, startedAt: 1, endedAt: null, lastActivityAt: 1, model: null, usage: null }, children: [], truncated: { depth: false, count: false }, warnings: [] }, events: [], cursor: original });
  let eventCalls = 0;
  const mismatch = createPiIngestionCoordinator({ store: source.store, scanStatuses: () => ({ ok: true, value: { runs: [{ root: { nativeId: 'other' } }], warnings: ['PRIVATE_STATUS'] } }), readEvents: () => { eventCalls += 1; } });
  const mismatchResult = mismatch.ingestRun(options(source));
  assert.equal(mismatchResult.value.committed, false); assert.equal(mismatchResult.value.reason, 'SNAPSHOT_MISMATCH'); assert.equal(eventCalls, 0);
  for (const runs of [[], [{ root: { nativeId: RUN } }, { root: { nativeId: RUN } }]]) {
    const rejected = createPiIngestionCoordinator({ store: source.store,
      scanStatuses: () => ({ ok: true, value: { runs, warnings: [] } }),
      readEvents: () => { throw new Error('must not read events before snapshot is unique'); } }).ingestRun(options(source));
    assert.equal(rejected.value.committed, false);
    assert.equal(rejected.value.reason, runs.length === 0 ? 'SNAPSHOT_MISSING' : 'SNAPSHOT_MISMATCH');
  }
  fs.writeFileSync(path.join(source.runDirectory, 'status.json'), '{invalid status');
  const invalidStatus = createPiIngestionCoordinator({ store: source.store }).ingestRun(options(source));
  assert.equal(invalidStatus.value.committed, false); assert.equal(invalidStatus.value.reason, 'SNAPSHOT_MISSING');
  const unsafe = createPiIngestionCoordinator({ store: source.store, scanStatuses: () => ({ ok: true, value: { runs: [{ root: { nativeId: RUN } }], warnings: [] } }), readEvents: () => ({ ok: true, value: { events: [], cursor: original, hasMore: false, incompleteLine: false, reset: null, warnings: ['EVENTS_MISSING'] } }) });
  assert.equal(unsafe.ingestRun(options(source)).value.reason, 'EVENTS_UNAVAILABLE');
  const readerFailure = createPiIngestionCoordinator({ store: source.store, scanStatuses: () => ({ ok: true, value: { runs: [{ root: { nativeId: RUN } }], warnings: [] } }), readEvents: () => ({ ok: false, error: { code: 'PRIVATE_READER_ERROR' } }) });
  assert.deepEqual(readerFailure.ingestRun(options(source)), { ok: false, error: { code: 'SOURCE_READ_FAILED' } });
  const throwing = createPiIngestionCoordinator({ store: { getCursor: () => { throw new Error('PRIVATE_DATABASE_PATH_SQL'); }, commitObservation() {} } });
  assert.deepEqual(throwing.ingestRun(options(source)), { ok: false, error: { code: 'PERSISTENCE_FAILED' } });
  const commitThrows = createPiIngestionCoordinator({ store: { getCursor: () => null, commitObservation: () => { throw new Error('PRIVATE_COMMIT_PATH'); } }, ...validReaders(source.store.getSnapshot(RUN)) });
  const commitFailure = commitThrows.ingestRun(options(source));
  assert.deepEqual(commitFailure, { ok: false, error: { code: 'PERSISTENCE_FAILED' } });
  privateFree(commitFailure, ['PRIVATE_COMMIT_PATH']);
  const invalidStatusEnvelope = createPiIngestionCoordinator({ store: source.store, scanStatuses: () => ({ ok: true, value: { runs: 'PRIVATE_BAD' } }) });
  assert.deepEqual(invalidStatusEnvelope.ingestRun(options(source)), { ok: false, error: { code: 'SOURCE_READ_FAILED' } });
  const invalidEventsEnvelope = createPiIngestionCoordinator({ store: source.store, ...validReaders(source.store.getSnapshot(RUN), { events: [], cursor: cursor('bad', 1) }) });
  assert.deepEqual(invalidEventsEnvelope.ingestRun(options(source)), { ok: false, error: { code: 'SOURCE_READ_FAILED' } });
  const invalidCommit = createPiIngestionCoordinator({ store: { getCursor: () => null, commitObservation: () => ({ events: { inserted: 'bad', duplicate: 0 } }) }, ...validReaders(source.store.getSnapshot(RUN)) });
  assert.deepEqual(invalidCommit.ingestRun(options(source)), { ok: false, error: { code: 'PERSISTENCE_FAILED' } });
  const sourceThrow = createPiIngestionCoordinator({ store: source.store, scanStatuses: () => { throw new Error('PRIVATE_SOURCE_PATH'); } }).ingestRun(options(source));
  assert.deepEqual(sourceThrow, { ok: false, error: { code: 'SOURCE_READ_FAILED' } });
  assert.deepEqual(source.store.getCursor(RUN), original);
  privateFree([mismatchResult, sourceThrow], ['PRIVATE_STATUS', 'PRIVATE_DATABASE_PATH_SQL', 'PRIVATE_SOURCE_PATH', source.directory]);
});

// K01B3B-7: b2b's reset is the only way a same-file offset can regress.
test('real rotation and truncation recover, while incompatible truncation markers roll back completely', (t) => {
  const source = workspace(t); writeStatus(source); fs.writeFileSync(source.eventsPath, '');
  append(source, event('subagent.run.paused', 1), event('subagent.run.stopped', 2));
  const coordinator = createPiIngestionCoordinator({ store: source.store });
  coordinator.ingestRun(options(source));
  const beforeRotation = source.store.getCursor(RUN);
  fs.renameSync(source.eventsPath, source.eventsPath + '.old'); fs.writeFileSync(source.eventsPath, event('subagent.run.started', 3, { mode: 'single' }) + '\n');
  const rotated = coordinator.ingestRun(options(source));
  assert.equal(rotated.value.reset, 'rotated'); assert.notEqual(source.store.getCursor(RUN).fileKey, beforeRotation.fileKey);
  append(source, event('subagent.run.paused', 4)); coordinator.ingestRun(options(source));
  fs.truncateSync(source.eventsPath, 0); append(source, event('subagent.run.stopped', 5));
  const truncated = coordinator.ingestRun(options(source));
  assert.equal(truncated.value.reset, 'truncated'); assert.equal(source.store.listEvents(RUN).length, 5);
  source.store.close();
  const reopened = createPiIngestionStore({ dbPath: path.join(source.directory, 'ledger.sqlite'), migrationsDir: MIGRATIONS_DIR, now: () => 1001 });
  append(source, event('subagent.run.completed', 6, { status: 'complete' }));
  const afterReopen = createPiIngestionCoordinator({ store: reopened }).ingestRun(options(source));
  assert.equal(afterReopen.value.inserted, 1); assert.equal(reopened.listEvents(RUN).length, 6);
  reopened.close();
  const continued = createPiIngestionStore({ dbPath: path.join(source.directory, 'ledger.sqlite'), migrationsDir: MIGRATIONS_DIR, now: () => 1002 });
  const savedCursor = continued.getCursor(RUN); const savedEvents = continued.listEvents(RUN);
  const fake = createPiIngestionCoordinator({ store: continued,
    scanStatuses: () => ({ ok: true, value: { runs: [continued.getSnapshot(RUN)], warnings: [] } }),
    readEvents: () => ({ ok: true, value: { events: [], cursor: savedCursor, hasMore: false, incompleteLine: false, reset: 'truncated', warnings: [] } }) });
  assert.deepEqual(fake.ingestRun(options(source)), { ok: false, error: { code: 'PERSISTENCE_FAILED' } });
  assert.deepEqual(continued.getCursor(RUN), savedCursor); assert.deepEqual(continued.listEvents(RUN), savedEvents);
  continued.close();
});

// K01B3B-r2: public success output is minimal, source-tagged and warning-deduplicated.
test('successful commits tag their source, deduplicate allowlisted warnings and omit raw private fields', (t) => {
  const source = workspace(t); writeStatus(source, status(RUN, 'running', 'PRIVATE_STATUS_PAYLOAD'));
  fs.writeFileSync(source.eventsPath, event('subagent.run.paused', 1, { privateEvent: 'PRIVATE_EVENT_PAYLOAD' }) + '\n');
  const seed = createPiIngestionCoordinator({ store: source.store }).ingestRun(options(source));
  const snapshot = source.store.getSnapshot(RUN); const events = source.store.listEvents(RUN);
  const result = createPiIngestionCoordinator({ store: source.store,
    scanStatuses: () => ({ ok: true, value: { runs: [snapshot], warnings: ['STATUS_INVALID', 'STATUS_INVALID'] } }),
    readEvents: () => ({ ok: true, value: { events, cursor: source.store.getCursor(RUN), hasMore: false, incompleteLine: false, reset: null, warnings: ['STATUS_INVALID', 'EVENT_JSON_INVALID', 'EVENT_JSON_INVALID'] } })
  }).ingestRun(options(source));
  assert.equal(seed.value.committed, true); assert.equal(result.ok, true); assert.equal(result.value.source, 'pi-subagents-ingestion');
  assert.deepEqual(result.value.warnings, ['STATUS_INVALID', 'EVENT_JSON_INVALID']);
  assert.equal(Object.hasOwn(result.value, 'snapshot'), false); assert.equal(Object.hasOwn(result.value, 'events'), false);
  privateFree(result, ['PRIVATE_STATUS_PAYLOAD', 'PRIVATE_EVENT_PAYLOAD']);
});

// K01B3B-r2: replay is a true no-op, and every invalid b3a marker rolls back atomically.
test('replay preserves revision, rows and usage; b3a rejects every incompatible reset marker with validation', (t) => {
  const source = workspace(t); writeStatus(source, status(RUN, 'running'));
  fs.writeFileSync(source.eventsPath, event('subagent.run.completed', 1, { status: 'complete' }) + '\n');
  const coordinator = createPiIngestionCoordinator({ store: source.store });
  coordinator.ingestRun(options(source));
  const before = { cursor: source.store.getCursor(RUN), events: source.store.listEvents(RUN), snapshot: source.store.getSnapshot(RUN), revision: revision(source) };
  const replay = coordinator.ingestRun(options(source));
  assert.equal(replay.value.inserted, 0); assert.equal(replay.value.duplicate, 0);
  assert.equal(revision(source), before.revision); assert.deepEqual(source.store.listEvents(RUN), before.events);
  assert.deepEqual(source.store.getSnapshot(RUN).root.usage, before.snapshot.root.usage);
  const rejected = [
    { cursorReset: 'rotated', cursor: before.cursor },
    { cursorReset: 'truncated', cursor: { ...before.cursor, offset: before.cursor.offset } },
    { cursorReset: 'truncated', cursor: { ...before.cursor, fileKey: sha('new-file'), offset: 0 } }
  ];
  for (const observation of rejected) {
    assert.throws(() => source.store.commitObservation({ snapshot: before.snapshot, events: [], ...observation }), { code: 'VALIDATION' });
    assert.deepEqual(source.store.getCursor(RUN), before.cursor); assert.deepEqual(source.store.listEvents(RUN), before.events);
  }
  const empty = createPiIngestionStore({ dbPath: path.join(source.directory, 'empty.sqlite'), migrationsDir: MIGRATIONS_DIR, now: () => 1003 });
  assert.throws(() => empty.commitObservation({ snapshot: before.snapshot, events: [], cursor: { ...before.cursor, offset: 0 }, cursorReset: 'truncated' }), { code: 'VALIDATION' });
  assert.equal(empty.getCursor(RUN), null); empty.close();
  assert.throws(() => source.store.commitObservation({ snapshot: before.snapshot, events: [], cursor: { ...before.cursor, offset: before.cursor.offset - 1 } }), { code: 'VALIDATION' });
  assert.deepEqual(source.store.getCursor(RUN), before.cursor); assert.deepEqual(source.store.listEvents(RUN), before.events);
});
