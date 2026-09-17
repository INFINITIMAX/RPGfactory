// RF-K01b1: teste independente cu filesystem temporar sintetic.
// Nu citesc artefacte Pi reale, configurare utilizator, DB, rețea, server sau procese copil.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { scanPiSubagentsStatuses } = require('../../adapters/pi-subagents-files.js');

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-k01b1-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function status(runId, overrides = {}) {
  return { runId, state: 'running', startedAt: 100, steps: [], ...overrides };
}

function writeRun(parent, name, value) {
  const directory = path.join(parent, name);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'status.json'), JSON.stringify(value));
  return directory;
}

function scan(options) {
  const result = scanPiSubagentsStatuses(options);
  assert.equal(result.ok, true);
  return result.value;
}

function assertNoPrivateData(value, markers) {
  const serialized = JSON.stringify(value);
  for (const marker of markers) assert.equal(serialized.includes(marker), false, `private marker leaked: ${marker}`);
}

test('invalid options return the exact stable error without throwing', () => {
  const invalid = [
    undefined,
    null,
    [],
    {},
    { roots: null },
    { roots: ['relative'] },
    { roots: ['   '] },
    { roots: [123] },
    { roots: [], observedAt: -1 },
    { roots: [], observedAt: Infinity },
    { roots: [], maxRoots: 0 },
    { roots: [], maxRoots: 33 },
    { roots: [], maxRoots: 1.5 },
    { roots: [], maxRuns: 0 },
    { roots: [], maxRuns: 1001 },
    { roots: [], maxRuns: '2' },
    { roots: [], maxStatusBytes: 0 },
    { roots: [], maxStatusBytes: (4 * 1024 * 1024) + 1 },
    { roots: [], maxStatusBytes: 1.2 }
  ];
  for (const options of invalid) {
    assert.doesNotThrow(() => scanPiSubagentsStatuses(options));
    assert.deepEqual(scanPiSubagentsStatuses(options), { ok: false, error: { code: 'INVALID_OPTIONS' } });
  }
});

test('empty roots return the stable empty versioned envelope', () => {
  const value = scan({ roots: [] });
  assert.deepEqual(value, {
    schemaVersion: 1,
    source: 'pi-subagents-files',
    observedAt: null,
    runs: [],
    truncated: { roots: false, runs: false },
    warnings: []
  });
});

test('a direct run directory yields the RF-K01a projection', (t) => {
  const root = temporaryDirectory(t);
  const run = writeRun(root, 'direct-run', status('direct-id', { activityState: 'needs_attention' }));
  const value = scan({ roots: [run], observedAt: 456 });
  assert.equal(value.observedAt, 456);
  assert.equal(value.runs.length, 1);
  assert.equal(value.runs[0].root.nativeId, 'direct-id');
  assert.equal(value.runs[0].root.attention, 'needs_attention');
  assert.equal(value.runs[0].observedAt, 456);
});

test('container children are immediate and sorted deterministically', (t) => {
  const container = temporaryDirectory(t);
  writeRun(container, 'z-last', status('z-id'));
  writeRun(container, 'a-first', status('a-id'));
  const nested = writeRun(container, 'nested-parent', status('parent-id'));
  writeRun(nested, 'grandchild', status('must-not-appear'));

  const value = scan({ roots: [container] });
  assert.deepEqual(value.runs.map((run) => run.root.nativeId), ['a-id', 'parent-id', 'z-id']);
  assert.equal(value.runs.some((run) => run.root.nativeId === 'must-not-appear'), false);
});

test('unavailable, non-directory, and duplicate canonical roots have stable path-free warnings', (t) => {
  const temp = temporaryDirectory(t);
  const run = writeRun(temp, 'run', status('kept-id'));
  const file = path.join(temp, 'not-a-directory');
  fs.writeFileSync(file, 'x');
  const unavailable = path.join(temp, 'attacker-chosen-root-name');
  const value = scan({ roots: [unavailable, file, run, run] });

  assert.deepEqual(value.runs.map((item) => item.root.nativeId), ['kept-id']);
  assert.deepEqual(value.warnings, ['ROOT_UNAVAILABLE', 'ROOT_NOT_DIRECTORY', 'DUPLICATE_ROOT']);
  assertNoPrivateData(value.warnings, ['attacker-chosen-root-name', temp]);
});

test('root symlink or junction is rejected, or explicitly skipped where creation is denied', (t) => {
  const temp = temporaryDirectory(t);
  const target = writeRun(temp, 'target', status('target-id'));
  const link = path.join(temp, 'root-link');
  try {
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      t.skip(`symlink/junction creation unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const value = scan({ roots: [link] });
  assert.deepEqual(value.runs, []);
  assert.deepEqual(value.warnings, ['ROOT_LINK_REJECTED']);
  assertNoPrivateData(value.warnings, ['root-link', temp]);
});

test('invalid candidates consume the run budget before validation and warnings are bounded', (t) => {
  const container = temporaryDirectory(t);
  fs.writeFileSync(path.join(container, 'a-invalid-file'), 'x');
  fs.mkdirSync(path.join(container, 'b-missing-status'));
  writeRun(container, 'c-valid', status('must-not-appear'));

  const value = scan({ roots: [container], maxRuns: 2 });
  assert.deepEqual(value.runs, []);
  assert.deepEqual(value.warnings, ['RUN_CANDIDATE_REJECTED', 'STATUS_MISSING']);
  assert.deepEqual(value.truncated, { roots: false, runs: true });
});

test('maxRoots and maxRuns distinguish an exhausted budget from an exact candidate count', (t) => {
  const temp = temporaryDirectory(t);
  const first = writeRun(temp, 'first', status('first-id'));
  const second = writeRun(temp, 'second', status('second-id'));
  const rootsValue = scan({ roots: [first, second], maxRoots: 1 });
  assert.deepEqual(rootsValue.runs.map((run) => run.root.nativeId), ['first-id']);
  assert.deepEqual(rootsValue.truncated, { roots: true, runs: false });

  const exactContainer = path.join(temp, 'exact');
  fs.mkdirSync(exactContainer);
  writeRun(exactContainer, 'only', status('only-id'));
  const exactValue = scan({ roots: [exactContainer], maxRuns: 1 });
  assert.deepEqual(exactValue.truncated, { roots: false, runs: false });

  const overValue = scan({ roots: [exactContainer, second], maxRuns: 1 });
  assert.deepEqual(overValue.truncated, { roots: false, runs: true });
});

test('missing, non-file, oversized, invalid JSON, and semantically invalid status are isolated', (t) => {
  const container = temporaryDirectory(t);
  fs.mkdirSync(path.join(container, 'a-missing'));
  const directoryStatus = path.join(container, 'b-directory-status');
  fs.mkdirSync(path.join(directoryStatus, 'status.json'), { recursive: true });
  const oversized = path.join(container, 'c-oversized');
  fs.mkdirSync(oversized);
  fs.writeFileSync(path.join(oversized, 'status.json'), 'x'.repeat(128));
  const invalidJson = path.join(container, 'd-invalid-json');
  fs.mkdirSync(invalidJson);
  fs.writeFileSync(path.join(invalidJson, 'status.json'), '{bad');
  writeRun(container, 'e-invalid-status', { runId: 'no-start', state: 'running' });

  const value = scan({ roots: [container], maxStatusBytes: 64 });
  assert.deepEqual(value.runs, []);
  assert.deepEqual(value.warnings, [
    'STATUS_MISSING', 'STATUS_NOT_FILE', 'STATUS_TOO_LARGE', 'STATUS_JSON_INVALID', 'STATUS_INVALID'
  ]);
});

test('a status symlink is rejected, or explicitly skipped where creation is denied', (t) => {
  const temp = temporaryDirectory(t);
  const target = path.join(temp, 'target.json');
  fs.writeFileSync(target, JSON.stringify(status('outside-id')));
  const run = path.join(temp, 'run');
  fs.mkdirSync(run);
  const link = path.join(run, 'status.json');
  try {
    fs.symlinkSync(target, link, 'file');
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      t.skip(`symlink creation unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const value = scan({ roots: [run] });
  assert.deepEqual(value.runs, []);
  assert.deepEqual(value.warnings, ['STATUS_LINK_REJECTED']);
});

test('TOCTOU status-directory swap cannot import an external status or leak its private marker', (t) => {
  const temp = temporaryDirectory(t);
  const container = path.join(temp, 'container');
  fs.mkdirSync(container);
  const victim = writeRun(container, 'victim', status('internal-id'));
  const externalMarker = 'TOCTOU_EXTERNAL_PRIVATE_MARKER';
  const external = writeRun(temp, 'external', status('external-id', { cwd: externalMarker }));
  const statusPath = path.join(victim, 'status.json');
  const movedVictim = path.join(container, 'victim-moved');
  const originalOpenSync = fs.openSync;
  let swapped = false;

  try {
    fs.openSync = function patchedOpenSync(filePath, ...args) {
      if (!swapped && path.resolve(filePath) === path.resolve(statusPath)) {
        swapped = true;
        fs.renameSync(victim, movedVictim);
        try {
          fs.symlinkSync(external, victim, process.platform === 'win32' ? 'junction' : 'dir');
        } catch (error) {
          if (error?.code === 'EPERM' || error?.code === 'EACCES') throw error;
          throw error;
        }
      }
      return originalOpenSync.call(fs, filePath, ...args);
    };

    let value;
    try {
      value = scan({ roots: [container] });
    } catch (error) {
      if (error?.code === 'EPERM' || error?.code === 'EACCES') {
        t.skip(`symlink/junction creation unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    assert.equal(swapped, true);
    assert.equal(value.runs.some((run) => run.root.nativeId === 'external-id'), false);
    assert.deepEqual(value.warnings, ['STATUS_LINK_REJECTED']);
    assertNoPrivateData(value, [externalMarker]);
  } finally {
    fs.openSync = originalOpenSync;
  }
});

test('growth after fstat is bounded, rejected, and closes its descriptor', (t) => {
  const temp = temporaryDirectory(t);
  const run = writeRun(temp, 'run', status('small-id'));
  const statusPath = path.join(run, 'status.json');
  const maxStatusBytes = 128;
  const initialBytes = fs.statSync(statusPath).size;
  assert.ok(initialBytes < maxStatusBytes, 'the valid fixture must reach readSync before it grows');
  const originalReadSync = fs.readSync;
  const originalCloseSync = fs.closeSync;
  const requestedLengths = [];
  let grew = false;
  let closeCount = 0;

  try {
    fs.readSync = function patchedReadSync(descriptor, buffer, offset, length, position) {
      requestedLengths.push(length);
      if (!grew) {
        grew = true;
        fs.appendFileSync(statusPath, 'x'.repeat(128));
      }
      return originalReadSync.call(fs, descriptor, buffer, offset, length, position);
    };
    fs.closeSync = function patchedCloseSync(descriptor) {
      closeCount += 1;
      return originalCloseSync.call(fs, descriptor);
    };

    const value = scan({ roots: [run], maxStatusBytes });
    assert.equal(grew, true);
    assert.deepEqual(value.runs, []);
    assert.deepEqual(value.warnings, ['STATUS_TOO_LARGE']);
    assert.ok(requestedLengths.length > 0);
    assert.ok(requestedLengths.every((length) => length > 0 && length <= maxStatusBytes + 1));
    assert.equal(closeCount, 1);
  } finally {
    fs.readSync = originalReadSync;
    fs.closeSync = originalCloseSync;
  }
});

test('root swap before canonicalization cannot import an external container', (t) => {
  const temp = temporaryDirectory(t);
  const root = path.join(temp, 'root');
  fs.mkdirSync(root);
  writeRun(root, 'safe', status('safe-id'));
  const externalMarker = 'ROOT_SWAP_EXTERNAL_PRIVATE_MARKER';
  const external = path.join(temp, 'external');
  fs.mkdirSync(external);
  writeRun(external, 'external-run', status('external-id', { cwd: externalMarker }));
  const movedRoot = path.join(temp, 'root-moved');
  const originalRealpathSync = fs.realpathSync;
  let swapped = false;

  try {
    fs.realpathSync = function patchedRealpathSync(filePath, ...args) {
      if (!swapped && path.resolve(filePath) === path.resolve(root)) {
        swapped = true;
        fs.renameSync(root, movedRoot);
        fs.symlinkSync(external, root, process.platform === 'win32' ? 'junction' : 'dir');
      }
      return originalRealpathSync.call(fs, filePath, ...args);
    };

    let value;
    try {
      value = scan({ roots: [root] });
    } catch (error) {
      if (error?.code === 'EPERM' || error?.code === 'EACCES') {
        t.skip(`symlink/junction creation unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    assert.equal(swapped, true);
    assert.deepEqual(value.runs, []);
    assert.deepEqual(value.warnings, ['ROOT_LINK_REJECTED']);
    assertNoPrivateData(value, [externalMarker, 'external-id']);
  } finally {
    fs.realpathSync = originalRealpathSync;
    fs.rmSync(root, { recursive: true, force: true });
    if (fs.existsSync(movedRoot)) fs.renameSync(movedRoot, root);
  }
});

test('root swap restored after external canonicalization still rejects the external anchor', (t) => {
  const temp = temporaryDirectory(t);
  const root = path.join(temp, 'root');
  fs.mkdirSync(root);
  writeRun(root, 'safe', status('safe-id'));
  const externalMarker = 'ROOT_SWAP_RESTORE_PRIVATE_MARKER';
  const external = path.join(temp, 'external');
  fs.mkdirSync(external);
  writeRun(external, 'external-run', status('external-id', { cwd: externalMarker }));
  const movedRoot = path.join(temp, 'root-moved');
  const originalRealpathSync = fs.realpathSync;
  let swapped = false;
  let restored = false;

  try {
    fs.realpathSync = function patchedRealpathSync(filePath, ...args) {
      if (!swapped && path.resolve(filePath) === path.resolve(root)) {
        swapped = true;
        fs.renameSync(root, movedRoot);
        fs.symlinkSync(external, root, process.platform === 'win32' ? 'junction' : 'dir');
        const canonicalExternal = originalRealpathSync.call(fs, filePath, ...args);
        fs.rmSync(root, { recursive: true, force: true });
        fs.renameSync(movedRoot, root);
        restored = true;
        return canonicalExternal;
      }
      return originalRealpathSync.call(fs, filePath, ...args);
    };

    let value;
    try {
      value = scan({ roots: [root] });
    } catch (error) {
      if (error?.code === 'EPERM' || error?.code === 'EACCES') {
        t.skip(`symlink/junction creation unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    assert.equal(swapped, true);
    assert.equal(restored, true);
    assert.deepEqual(value.runs, []);
    assert.deepEqual(value.warnings, ['ROOT_LINK_REJECTED']);
    assertNoPrivateData(value, [externalMarker, 'external-id']);
  } finally {
    fs.realpathSync = originalRealpathSync;
    fs.rmSync(root, { recursive: true, force: true });
    if (fs.existsSync(movedRoot)) fs.renameSync(movedRoot, root);
  }
});

test('status identity mismatch wins over a non-file descriptor classification and closes it', (t) => {
  const temp = temporaryDirectory(t);
  const run = writeRun(temp, 'run', status('identity-id'));
  const originalFstatSync = fs.fstatSync;
  const originalCloseSync = fs.closeSync;
  let fstatCalls = 0;
  let closeCount = 0;

  try {
    fs.fstatSync = function patchedFstatSync(descriptor) {
      fstatCalls += 1;
      const opened = originalFstatSync.call(fs, descriptor);
      return {
        dev: opened.dev + 1,
        ino: opened.ino + 1,
        size: opened.size,
        isFile: () => false
      };
    };
    fs.closeSync = function patchedCloseSync(descriptor) {
      closeCount += 1;
      return originalCloseSync.call(fs, descriptor);
    };

    const value = scan({ roots: [run] });
    assert.equal(fstatCalls, 1);
    assert.deepEqual(value.runs, []);
    assert.deepEqual(value.warnings, ['STATUS_LINK_REJECTED']);
    assert.equal(closeCount, 1);
  } finally {
    fs.fstatSync = originalFstatSync;
    fs.closeSync = originalCloseSync;
  }
});

test('a candidate symlink or junction consumes maxRuns before rejection', (t) => {
  const temp = temporaryDirectory(t);
  const container = path.join(temp, 'container');
  fs.mkdirSync(container);
  const target = writeRun(temp, 'target', status('target-id'));
  const candidateLink = path.join(container, 'a-link');
  try {
    fs.symlinkSync(target, candidateLink, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      t.skip(`symlink/junction creation unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  writeRun(container, 'b-valid', status('must-not-appear'));

  const value = scan({ roots: [container], maxRuns: 1 });
  assert.deepEqual(value.runs, []);
  assert.deepEqual(value.warnings, ['RUN_CANDIDATE_REJECTED']);
  assert.equal(value.truncated.runs, true);
});

test('duplicate run IDs preserve the first valid projection and still consume budget', (t) => {
  const container = temporaryDirectory(t);
  writeRun(container, 'a-first', status('same-id', { label: 'first' }));
  writeRun(container, 'b-duplicate', status('same-id', { label: 'second' }));
  writeRun(container, 'c-later', status('later-id'));

  const value = scan({ roots: [container], maxRuns: 2 });
  assert.deepEqual(value.runs.map((run) => [run.root.nativeId, run.root.label]), [['same-id', 'first']]);
  assert.deepEqual(value.warnings, ['DUPLICATE_RUN_ID']);
  assert.equal(value.truncated.runs, true);
});

test('private hostile source fields and attacker-controlled names never leak into projection or warnings', (t) => {
  const container = temporaryDirectory(t);
  const marker = 'SYNTHETIC_PRIVATE_MARKER';
  writeRun(container, 'attacker-controlled-directory-name', status('safe-id', {
    cwd: marker, task: marker, prompt: marker, description: marker, args: marker,
    output: marker, error: marker, transcriptPath: marker, sessionPath: marker,
    artifactPath: marker, unknownField: marker
  }));
  fs.writeFileSync(path.join(container, 'attacker-controlled-file-name'), 'not a run');

  const value = scan({ roots: [container] });
  assert.equal(value.runs.length, 1);
  assertNoPrivateData(value, [
    marker, 'attacker-controlled-directory-name', 'attacker-controlled-file-name', container
  ]);
  assert.deepEqual(value.warnings, ['RUN_CANDIDATE_REJECTED']);
});

test('many invalid and duplicate candidates cannot exceed the configured warning/run budget', (t) => {
  const container = temporaryDirectory(t);
  for (let index = 0; index < 30; index += 1) fs.writeFileSync(path.join(container, `a-invalid-${index}`), 'x');
  for (let index = 0; index < 30; index += 1) writeRun(container, `z-duplicate-${index}`, status('one-id'));

  const value = scan({ roots: [container], maxRuns: 5 });
  assert.equal(value.runs.length, 0);
  assert.equal(value.warnings.length, 5);
  assert.equal(value.warnings.every((warning) => warning === 'RUN_CANDIDATE_REJECTED'), true);
  assert.equal(value.truncated.runs, true);
});
