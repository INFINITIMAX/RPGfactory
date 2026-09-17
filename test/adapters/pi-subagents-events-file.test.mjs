// RF-K01b2b: reader JSONL incremental; toate sursele sunt directoare temporare sintetice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readPiSubagentsEvents } = require('../../adapters/pi-subagents-events-file.js');
const RUN_ID = 'run-events-test';
const TS = 1700000000000;

function temp(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-k01b2b-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function source(t, content = '') {
  const root = temp(t);
  const runDirectory = path.join(root, 'run');
  fs.mkdirSync(runDirectory);
  const events = path.join(runDirectory, 'events.jsonl');
  if (content !== null) fs.writeFileSync(events, content);
  return { root, runDirectory, events };
}
function event(type = 'subagent.run.paused', fields = {}) {
  return JSON.stringify({ type, ts: TS, runId: RUN_ID, ...fields });
}
function read(options) {
  const result = readPiSubagentsEvents(options);
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
}
function options(s, extra = {}) { return { root: s.root, runDirectory: s.runDirectory, expectedRunId: RUN_ID, ...extra }; }
function noPrivate(value, markers) {
  const serialized = JSON.stringify(value);
  for (const marker of markers) assert.equal(serialized.includes(marker), false, `private marker leaked: ${marker}`);
}

const invalid = { ok: false, error: { code: 'INVALID_OPTIONS' } };
test('invalid options and cursors return the exact non-throwing stable error', (t) => {
  const s = source(t);
  const base = options(s);
  const cases = [undefined, null, [], {}, { ...base, root: '' }, { ...base, root: 'relative' },
    { ...base, runDirectory: 'relative' }, { ...base, runDirectory: path.join(s.root, '..', 'outside') },
    { ...base, expectedRunId: '' }, { ...base, expectedRunId: ' bad ' },
    { ...base, maxReadBytes: 0 }, { ...base, maxReadBytes: 1.5 }, { ...base, maxReadBytes: 4 * 1024 * 1024 + 1 },
    { ...base, maxEventBytes: 0 }, { ...base, maxEventBytes: 1.5 }, { ...base, maxLines: 0 }, { ...base, maxLines: 1001 },
    { ...base, maxReadBytes: 256, maxEventBytes: 256 }, { ...base, maxReadBytes: 257, maxEventBytes: 256 },
    { ...base, maxReadBytes: 4, maxEventBytes: 4 },
    { ...base, cursor: { version: 2, fileKey: 'a'.repeat(64), offset: 0 } },
    { ...base, cursor: { version: 1, fileKey: 'A'.repeat(64), offset: 0 } },
    { ...base, cursor: { version: 1, fileKey: 'a'.repeat(63), offset: 0 } },
    { ...base, cursor: { version: 1, fileKey: 'a'.repeat(64), offset: -1 } },
    { ...base, cursor: { version: 1, fileKey: 'a'.repeat(64), offset: .5 } },
    { ...base, cursor: { version: 1, fileKey: 'a'.repeat(64), offset: Number.MAX_SAFE_INTEGER + 1 } },
    { ...base, cursor: { version: 1, fileKey: 'a'.repeat(64), offset: 0, discardingOversizedLine: false } },
    { ...base, cursor: { version: 1, fileKey: 'a'.repeat(64), offset: 0, unexpected: true } }];
  for (const input of cases) {
    assert.doesNotThrow(() => readPiSubagentsEvents(input));
    assert.deepEqual(readPiSubagentsEvents(input), invalid);
  }
  const value = read({ ...base, cursor: { version: 1, fileKey: 'a'.repeat(64), offset: 0 } });
  assert.equal(value.cursor.offset, 0);
  assert.deepEqual(read({ ...base, maxReadBytes: 258, maxEventBytes: 256 }).warnings, []);
});

test('missing file has the exact path-free envelope and preserves its input cursor', (t) => {
  const s = source(t, null);
  const cursor = { version: 1, fileKey: 'a'.repeat(64), offset: 0 };
  const value = read(options(s, { cursor }));
  assert.deepEqual(value, { schemaVersion: 1, source: 'pi-subagents-events-file', runId: RUN_ID, events: [], cursor, hasMore: false, incompleteLine: false, reset: null, limits: { bytes: false, lines: false }, warnings: ['EVENTS_MISSING'] });
  noPrivate(value, [s.root, s.runDirectory]);
});

test('unsafe roots and run directories are rejected without source paths', (t) => {
  const s = source(t);
  const file = path.join(s.root, 'not-directory'); fs.writeFileSync(file, 'x');
  const unavailableRoot = path.join(s.root, 'missing-private-root');
  const unavailable = read({ root: unavailableRoot, runDirectory: path.join(unavailableRoot, 'run'), expectedRunId: RUN_ID });
  assert.deepEqual(unavailable.warnings, ['ROOT_UNAVAILABLE']);
  const rootFile = read({ root: file, runDirectory: path.join(file, 'run'), expectedRunId: RUN_ID });
  assert.deepEqual(rootFile.warnings, ['ROOT_NOT_DIRECTORY']);
  const runFile = read({ root: s.root, runDirectory: file, expectedRunId: RUN_ID });
  assert.deepEqual(runFile.warnings, ['RUN_DIRECTORY_REJECTED']);
  for (const value of [unavailable, rootFile, runFile]) noPrivate(value, [s.root, 'missing-private-root']);
});

test('root links are rejected or skipped only when root-link creation lacks permission', (t) => {
  const s = source(t);
  const rootLink = path.join(s.root, 'root-link');
  try { fs.symlinkSync(s.root, rootLink, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error?.code === 'EPERM' || error?.code === 'EACCES') return t.skip(`root link creation unavailable: ${error.code}`); throw error; }
  assert.deepEqual(read({ root: rootLink, runDirectory: path.join(rootLink, 'run'), expectedRunId: RUN_ID }).warnings, ['ROOT_LINK_REJECTED']);
});

test('run links are rejected or skipped only when run-link creation lacks permission', (t) => {
  const s = source(t);
  const runLink = path.join(s.root, 'run-link');
  try { fs.symlinkSync(s.runDirectory, runLink, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error?.code === 'EPERM' || error?.code === 'EACCES') return t.skip(`run link creation unavailable: ${error.code}`); throw error; }
  assert.deepEqual(read({ root: s.root, runDirectory: runLink, expectedRunId: RUN_ID }).warnings, ['RUN_DIRECTORY_REJECTED']);
});

test('events-file links are rejected or skipped only when file-link creation lacks permission', (t) => {
  const s = source(t);
  const target = path.join(s.root, 'target-events'); fs.writeFileSync(target, event() + '\n');
  fs.rmSync(s.events);
  try { fs.symlinkSync(target, s.events, 'file'); }
  catch (error) { if (error?.code === 'EPERM' || error?.code === 'EACCES') return t.skip(`events link creation unavailable: ${error.code}`); throw error; }
  assert.deepEqual(read(options(s)).warnings, ['EVENTS_LINK_REJECTED']);
});

test('a directory named events.jsonl is classified portably as not a file', (t) => {
  const s = source(t, null); fs.mkdirSync(s.events);
  assert.deepEqual(read(options(s)).warnings, ['EVENTS_NOT_FILE']);
});

test('LF, CRLF and blank complete lines project in order, checkpoint exactly, and append without replay', (t) => {
  const first = event('subagent.run.started', { mode: 'single' });
  const second = event('subagent.step.started', { stepIndex: 2, agent: 'coder' });
  const s = source(t, `${first}\n\r\n${second}\r\n`);
  const initial = read(options(s));
  assert.deepEqual(initial.events.map((item) => item.kind), ['run_started', 'step_started']);
  assert.equal(initial.cursor.offset, Buffer.byteLength(`${first}\n\r\n${second}\r\n`));
  assert.match(initial.cursor.fileKey, /^[a-f0-9]{64}$/); assert.equal(initial.hasMore, false);
  assert.deepEqual(read(options(s, { cursor: initial.cursor })).events, []);
  fs.appendFileSync(s.events, event('subagent.run.paused') + '\n');
  const appended = read(options(s, { cursor: initial.cursor }));
  assert.deepEqual(appended.events.map((item) => item.kind), ['run_paused']);
});

test('an incomplete final line remains unconsumed and becomes one event only after its LF arrives', (t) => {
  const line = event(); const s = source(t, line.slice(0, -2));
  const first = read(options(s));
  assert.deepEqual(first.events, []); assert.equal(first.cursor.offset, 0); assert.equal(first.incompleteLine, true); assert.equal(first.hasMore, false);
  fs.appendFileSync(s.events, line.slice(-2) + '\n');
  const second = read(options(s, { cursor: first.cursor }));
  assert.deepEqual(second.events.map((item) => item.kind), ['run_paused']);
});

test('byte windows, including one ending inside a valid line, resume without loss or duplication', (t) => {
  const one = event('subagent.run.started', { mode: 'single' }); const two = event();
  const s = source(t, `${one}\n${two}\n`);
  const first = read(options(s, { maxReadBytes: Buffer.byteLength(one) + 3, maxEventBytes: Buffer.byteLength(one), maxLines: 10 }));
  assert.deepEqual(first.events.map((item) => item.kind), ['run_started']); assert.equal(first.limits.bytes, true); assert.equal(first.hasMore, true);
  const second = read(options(s, { cursor: first.cursor, maxReadBytes: 4096, maxEventBytes: Buffer.byteLength(one), maxLines: 10 }));
  assert.deepEqual(second.events.map((item) => item.kind), ['run_paused']);
});

test('line budgets charge blank, invalid and unsupported complete lines before parsing, but do not falsely truncate exact EOF', (t) => {
  const s = source(t, `\n{bad}\n${JSON.stringify({ type: 'future.private', secret: 'PRIVATE' })}\n${event()}\n`);
  const first = read(options(s, { maxLines: 3 }));
  assert.deepEqual(first.events, []); assert.equal(first.limits.lines, true); assert.equal(first.hasMore, true);
  assert.deepEqual(first.warnings, ['EVENT_JSON_INVALID', 'EVENT_UNSUPPORTED']);
  const second = read(options(s, { cursor: first.cursor, maxLines: 3 })); assert.deepEqual(second.events.map((x) => x.kind), ['run_paused']);
  const exact = source(t, event() + '\n'); const value = read(options(exact, { maxLines: 1 }));
  assert.equal(value.limits.lines, false); assert.equal(value.hasMore, false);
});

test('bad encodings and semantic rejections map once, in first order, without raw content', (t) => {
  const hostile = 'PRIVATE_RAW_MARKER';
  const s = source(t, Buffer.concat([Buffer.from('{bad}\n{bad}\n'), Buffer.from([0xc3, 0x28, 0x0a]), Buffer.from(`${JSON.stringify({ type: 'future.private', secret: hostile })}\n${JSON.stringify({ type: 'subagent.run.started', ts: TS, runId: RUN_ID, mode: 'bad', task: hostile })}\n${event('subagent.run.paused', { runId: 'other-run', prompt: hostile })}\n`)]));
  const value = read(options(s));
  assert.deepEqual(value.warnings, ['EVENT_JSON_INVALID', 'EVENT_ENCODING_INVALID', 'EVENT_UNSUPPORTED', 'EVENT_INVALID', 'EVENT_RUN_ID_MISMATCH']);
  noPrivate(value, [hostile, 'other-run']);
});

test('event-byte boundary accepts exactly the maximum and consumes an oversized LF line', (t) => {
  const payload = event(); const s = source(t, `${payload}\n${'x'.repeat(Buffer.byteLength(payload) + 1)}\n`);
  const value = read(options(s, { maxEventBytes: Buffer.byteLength(payload), maxReadBytes: 4096 }));
  assert.deepEqual(value.events.map((x) => x.kind), ['run_paused']); assert.deepEqual(value.warnings, ['EVENT_LINE_TOO_LARGE']);
});

test('an exact-limit CR-terminated payload stays incomplete until LF then emits exactly once', (t) => {
  const maxEventBytes = 256;
  const record = { type: 'subagent.run.paused', ts: TS, runId: RUN_ID, padding: '' };
  record.padding = 'x'.repeat(maxEventBytes - Buffer.byteLength(JSON.stringify(record)));
  const payload = JSON.stringify(record);
  assert.equal(Buffer.byteLength(payload), maxEventBytes);
  const s = source(t, `${payload}\r`);
  const first = read(options(s, { maxEventBytes, maxReadBytes: maxEventBytes + 2 }));
  assert.deepEqual(first.events, []); assert.deepEqual(first.warnings, []); assert.equal(first.cursor.offset, 0);
  assert.equal(first.incompleteLine, true); assert.equal(first.hasMore, false);
  fs.appendFileSync(s.events, '\n');
  const second = read(options(s, { cursor: first.cursor, maxEventBytes, maxReadBytes: maxEventBytes + 2 }));
  assert.deepEqual(second.events.map((item) => item.kind), ['run_paused']); assert.equal(second.warnings.includes('EVENT_LINE_TOO_LARGE'), false);
  const third = read(options(s, { cursor: second.cursor, maxEventBytes, maxReadBytes: maxEventBytes + 2 }));
  assert.deepEqual(third.events, []); assert.equal(third.warnings.includes('EVENT_LINE_TOO_LARGE'), false);
});

test('a clearly oversized CR-terminated EOF line advances to EOF without retrying offset zero', (t) => {
  const maxEventBytes = 256; const s = source(t, `${'x'.repeat(maxEventBytes + 1)}\r`);
  const first = read(options(s, { maxEventBytes, maxReadBytes: maxEventBytes + 3 }));
  assert.deepEqual(first.warnings, ['EVENT_LINE_TOO_LARGE']); assert.equal(first.cursor.offset, maxEventBytes + 2);
  assert.equal(first.cursor.discardingOversizedLine, true); assert.equal(first.hasMore, false);
  const second = read(options(s, { cursor: first.cursor, maxEventBytes, maxReadBytes: maxEventBytes + 3 }));
  assert.equal(second.cursor.offset, first.cursor.offset); assert.equal(second.cursor.discardingOversizedLine, true);
});

test('an exact-limit payload followed by CR and non-LF becomes an oversized discarded line', (t) => {
  const maxEventBytes = 256;
  const record = { type: 'subagent.run.paused', ts: TS, runId: RUN_ID, padding: '' };
  record.padding = 'x'.repeat(maxEventBytes - Buffer.byteLength(JSON.stringify(record)));
  const payload = JSON.stringify(record);
  assert.equal(Buffer.byteLength(payload), maxEventBytes);
  const s = source(t, `${payload}\rx`);
  const value = read(options(s, { maxEventBytes, maxReadBytes: maxEventBytes + 2 }));
  assert.deepEqual(value.events, []); assert.deepEqual(value.warnings, ['EVENT_LINE_TOO_LARGE']);
  assert.equal(value.cursor.offset, maxEventBytes + 2); assert.equal(value.cursor.discardingOversizedLine, true);
  assert.equal(value.incompleteLine, false); assert.equal(value.hasMore, false);
});

test('oversized EOF and oversized multi-window discard advance boundedly then recover at the next line', (t) => {
  const directEof = source(t, 'x'.repeat(500));
  const direct = read(options(directEof, { maxEventBytes: 256, maxReadBytes: 600 }));
  assert.deepEqual(direct.warnings, ['EVENT_LINE_TOO_LARGE']);
  assert.equal(direct.cursor.offset, 500); assert.equal(direct.cursor.discardingOversizedLine, true);
  assert.equal(direct.hasMore, false); assert.equal(direct.limits.bytes, false);

  const s = source(t, 'x'.repeat(500));
  const eof = read(options(s, { maxEventBytes: 256, maxReadBytes: 300 }));
  assert.equal(eof.cursor.discardingOversizedLine, true); assert.equal(eof.cursor.offset, 300); assert.equal(eof.hasMore, true); assert.equal(eof.limits.bytes, true);
  const end = read(options(s, { cursor: eof.cursor, maxEventBytes: 256, maxReadBytes: 400 }));
  assert.equal(end.cursor.discardingOversizedLine, true); assert.equal(end.hasMore, false); assert.equal(end.limits.bytes, false);
  fs.appendFileSync(s.events, `\n${event()}\n`);
  const recovered = read(options(s, { cursor: end.cursor, maxEventBytes: 256, maxReadBytes: 4096 }));
  assert.equal(recovered.cursor.discardingOversizedLine, undefined); assert.deepEqual(recovered.events.map((x) => x.kind), ['run_paused']);
});

test('replacement resets as rotated and same-file shrink resets as truncated', (t) => {
  const s = source(t, event() + '\n'); const initial = read(options(s));
  const replacement = path.join(s.root, 'replacement'); const retired = path.join(s.root, 'retired-events');
  fs.writeFileSync(replacement, event('subagent.run.started', { mode: 'single' }) + '\n');
  fs.renameSync(s.events, retired); fs.renameSync(replacement, s.events);
  const rotated = read(options(s, { cursor: initial.cursor }));
  assert.equal(rotated.reset, 'rotated'); assert.deepEqual(rotated.warnings, ['EVENTS_ROTATED']); assert.deepEqual(rotated.events.map((x) => x.kind), ['run_started']);
  fs.appendFileSync(s.events, event() + '\n'); const advanced = read(options(s, { cursor: rotated.cursor }));
  fs.truncateSync(s.events, 1);
  const truncated = read(options(s, { cursor: advanced.cursor }));
  assert.equal(truncated.reset, 'truncated'); assert.deepEqual(truncated.warnings, ['EVENTS_TRUNCATED']); assert.equal(truncated.cursor.offset, 0);
});

test('read failures preserve a nonzero cursor and rotation reset while closing descriptors', (t) => {
  const s = source(t, event() + '\n');
  const initial = read(options(s));
  fs.appendFileSync(s.events, event('subagent.run.started', { mode: 'single' }) + '\n');
  const originalRead = fs.readSync; const originalClose = fs.closeSync; let closes = 0;
  try {
    fs.readSync = () => { throw new Error('PRIVATE_READ_FAILURE'); };
    fs.closeSync = function patched(...args) { closes += 1; return originalClose.apply(fs, args); };
    const value = read(options(s, { cursor: initial.cursor }));
    assert.deepEqual(value.warnings, ['EVENTS_READ_FAILED']); assert.deepEqual(value.cursor, initial.cursor);
    assert.equal(value.reset, null); assert.equal(closes, 1); noPrivate(value, ['PRIVATE_READ_FAILURE']);
  } finally { fs.readSync = originalRead; fs.closeSync = originalClose; }

  const replacement = path.join(s.root, 'replacement'); const retired = path.join(s.root, 'retired-events');
  fs.writeFileSync(replacement, event('subagent.run.started', { mode: 'single' }) + '\n');
  fs.renameSync(s.events, retired); fs.renameSync(replacement, s.events);
  const originalRotatedRead = fs.readSync; const originalRotatedClose = fs.closeSync; let rotatedCloses = 0;
  try {
    fs.readSync = () => { throw new Error('PRIVATE_ROTATED_READ_FAILURE'); };
    fs.closeSync = function patched(...args) { rotatedCloses += 1; return originalRotatedClose.apply(fs, args); };
    const value = read(options(s, { cursor: initial.cursor }));
    assert.deepEqual(value.warnings, ['EVENTS_ROTATED', 'EVENTS_READ_FAILED']);
    assert.equal(value.reset, 'rotated'); assert.equal(value.cursor.offset, 0);
    assert.notEqual(value.cursor.fileKey, initial.cursor.fileKey); assert.equal(rotatedCloses, 1);
    noPrivate(value, ['PRIVATE_ROTATED_READ_FAILURE']);
  } finally { fs.readSync = originalRotatedRead; fs.closeSync = originalRotatedClose; }
});

test('TOCTOU, read failures and premature reads never project substituted or unstable bytes and restore fs patches', (t) => {
  const s = source(t, event() + '\n'); const external = path.join(s.root, 'external'); const retired = path.join(s.root, 'retired-events');
  fs.writeFileSync(external, event('subagent.run.started', { mode: 'single', task: 'EXTERNAL_PRIVATE' }) + '\n');
  const originalOpen = fs.openSync; let swapped = false;
  try {
    fs.openSync = function patched(file, ...args) { if (!swapped && path.resolve(file) === path.resolve(s.events)) { swapped = true; fs.renameSync(s.events, retired); fs.renameSync(external, s.events); } return originalOpen.call(fs, file, ...args); };
    const value = read(options(s)); assert.deepEqual(value.events, []); assert.deepEqual(value.warnings, ['EVENTS_LINK_REJECTED']); noPrivate(value, ['EXTERNAL_PRIVATE']);
  } finally { fs.openSync = originalOpen; }
  const originalRead = fs.readSync;
  try { fs.readSync = () => { throw new Error('PRIVATE_READ_FAILURE'); }; const value = read(options(s)); assert.deepEqual(value.events, []); assert.deepEqual(value.warnings, ['EVENTS_READ_FAILED']); noPrivate(value, ['PRIVATE_READ_FAILURE']); }
  finally { fs.readSync = originalRead; }
  const originalReadShort = fs.readSync;
  try { fs.readSync = () => 0; const value = read(options(s)); assert.deepEqual(value.events, []); assert.deepEqual(value.warnings, ['EVENTS_READ_FAILED', 'EVENTS_TRUNCATED']); assert.equal(value.reset, 'truncated'); assert.equal(value.cursor.offset, 0); }
  finally { fs.readSync = originalReadShort; }
});

test('reads are non-mutating, outputs retain no raw input references, and snapshot growth waits for next call', (t) => {
  const line = event() + '\n'; const s = source(t, line); const before = fs.readFileSync(s.events);
  const originalFstat = fs.fstatSync; let grew = false;
  try { fs.fstatSync = function patched(fd) { const stat = originalFstat.call(fs, fd); if (!grew) { grew = true; fs.appendFileSync(s.events, event('subagent.run.started', { mode: 'single' }) + '\n'); } return stat; }; const first = read(options(s)); assert.deepEqual(first.events.map((x) => x.kind), ['run_paused']); const second = read(options(s, { cursor: first.cursor })); assert.deepEqual(second.events.map((x) => x.kind), ['run_started']); }
  finally { fs.fstatSync = originalFstat; }
  assert.deepEqual(fs.readFileSync(s.events).subarray(0, before.length), before);
});
