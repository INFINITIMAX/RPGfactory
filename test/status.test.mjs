// Teste pentru status.js (T-05).
//
// status.js e CommonJS (`module.exports = { getActivityState }`), structurat
// la fel ca rank.js: citește doar coada (.jsonl) prin fs.statSync/openSync/
// readSync/closeSync, cu cache pe mtime. `readTail` și `awaitingReplyFromText`
// NU sunt exportate — le acoperim indirect prin `getActivityState`.
//
// Mocăm manual `fs`, exact ca în test/rank.test.mjs, din același motiv:
// PROJECTS_DIR e derivat hardcodat din os.homedir(), nu poate fi injectat un
// folder alternativ fără să modificăm status.js (interzis de brief).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const { getActivityState } = require('../status.js');
const { encodeCwd } = require('../rank.js');

const ACTIVE_WINDOW_MS = 30 * 60 * 1000;
const FAKE_FD = -54321;

// Aplică peste `fs` real un fals fișier la `filePath`, cu `size`/`mtimeMs`
// controlate și conținut `fullBuffer` (readSync întoarce mereu ultimii
// `length` bytes din fullBuffer, exact ce ar face un readTail real). Orice
// altă cale trece prin fs real. Restaurează metodele originale în finally.
function withFakeFile({ filePath, size, mtimeMs, fullBuffer, statThrows }, fn) {
  const orig = {
    statSync: fs.statSync,
    openSync: fs.openSync,
    readSync: fs.readSync,
    closeSync: fs.closeSync,
  };
  const calls = { statSync: 0, openSync: 0, readSync: 0 };

  fs.statSync = (p, ...rest) => {
    if (p === filePath) {
      calls.statSync++;
      if (statThrows) {
        const err = new Error('ENOENT: no such file');
        err.code = 'ENOENT';
        throw err;
      }
      return { size, mtimeMs };
    }
    return orig.statSync(p, ...rest);
  };
  fs.openSync = (p, ...rest) => {
    if (p === filePath) {
      calls.openSync++;
      return FAKE_FD;
    }
    return orig.openSync(p, ...rest);
  };
  fs.readSync = (fd, buffer, offset, length, position) => {
    if (fd === FAKE_FD) {
      calls.readSync++;
      const start = fullBuffer.length - length;
      fullBuffer.copy(buffer, offset, start, start + length);
      return length;
    }
    return orig.readSync(fd, buffer, offset, length, position);
  };
  fs.closeSync = (fd, ...rest) => {
    if (fd === FAKE_FD) return;
    return orig.closeSync(fd, ...rest);
  };

  try {
    return fn(calls);
  } finally {
    Object.assign(fs, orig);
  }
}

function fixturePath(cwd, sessionId) {
  // Reproduce exact construcția din status.js: PROJECTS_DIR = ~/.claude/projects
  return path.join(os.homedir(), '.claude', 'projects', encodeCwd(cwd), sessionId + '.jsonl');
}

function uniqueSession() {
  return 'fixture-status-' + randomUUID();
}

// mtime "proaspăt" (în interiorul ferestrei de 30 min) — folosit peste tot
// unde vrem să testăm parsarea conținutului, nu pragul de prospețime.
const FRESH_MTIME = Date.now() - 1000; // 1 secundă în urmă

function bufferFrom(lines) {
  return Buffer.from(lines.join('\n'), 'utf8');
}

// --- 1. Ultima linie relevantă 'user' -> working (NU waiting) --------------

test('getActivityState: ultima linie "user" -> activity working', () => {
  const cwd = 'FIXTURE-CWD-USER-LAST';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  const lines = [
    '{"type":"assistant","message":{"content":[],"stop_reason":"end_turn"}}',
    '{"type":"user","message":{"content":"salut"}}',
  ];
  const fullBuffer = bufferFrom(lines);

  withFakeFile({ filePath, size: fullBuffer.length, mtimeMs: FRESH_MTIME, fullBuffer }, () => {
    const result = getActivityState(cwd, sessionId);
    assert.deepEqual(result, { activity: 'working' });
  });
});

// --- 2. assistant cu tool_use în content -> working -------------------------

test('getActivityState: ultima linie "assistant" cu tool_use în content -> working', () => {
  const cwd = 'FIXTURE-CWD-TOOL-USE';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  const lines = [
    '{"type":"assistant","message":{"content":[{"type":"text","text":"ok"},{"type":"tool_use","name":"Read"}],"stop_reason":"tool_use"}}',
  ];
  const fullBuffer = bufferFrom(lines);

  withFakeFile({ filePath, size: fullBuffer.length, mtimeMs: FRESH_MTIME, fullBuffer }, () => {
    const result = getActivityState(cwd, sessionId);
    assert.deepEqual(result, { activity: 'working' });
  });
});

// --- 3. assistant fără tool_use și stop_reason !== 'tool_use' -> waiting ----

test('getActivityState: "assistant" fără tool_use și stop_reason !== "tool_use" -> waiting', () => {
  const cwd = 'FIXTURE-CWD-WAITING';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  const lines = [
    '{"type":"assistant","message":{"content":[{"type":"text","text":"gata"}],"stop_reason":"end_turn"}}',
  ];
  const fullBuffer = bufferFrom(lines);

  withFakeFile({ filePath, size: fullBuffer.length, mtimeMs: FRESH_MTIME, fullBuffer }, () => {
    const result = getActivityState(cwd, sessionId);
    assert.deepEqual(result, { activity: 'waiting' });
  });
});

test('getActivityState: "assistant" fără tool_use dar stop_reason === "tool_use" -> working', () => {
  // Caz limită explicit din implementare: `return stopReason !== 'tool_use'`
  // se aplică chiar dacă `content` nu conține niciun element tool_use.
  const cwd = 'FIXTURE-CWD-STOPREASON-TOOLUSE-NO-CONTENT';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  const lines = [
    '{"type":"assistant","message":{"content":[{"type":"text","text":"..."}],"stop_reason":"tool_use"}}',
  ];
  const fullBuffer = bufferFrom(lines);

  withFakeFile({ filePath, size: fullBuffer.length, mtimeMs: FRESH_MTIME, fullBuffer }, () => {
    const result = getActivityState(cwd, sessionId);
    assert.deepEqual(result, { activity: 'working' });
  });
});

// --- 4. mtime vechi de peste 30 min -> sleeping, indiferent de conținut ----

test('getActivityState: mtime mai vechi de 30 min -> sleeping, chiar dacă ultima linie ar da working', () => {
  const cwd = 'FIXTURE-CWD-STALE';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  const staleMtime = Date.now() - (ACTIVE_WINDOW_MS + 60 * 1000); // 31 min în urmă
  const lines = [
    '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read"}],"stop_reason":"tool_use"}}',
  ];
  const fullBuffer = bufferFrom(lines);

  withFakeFile({ filePath, size: fullBuffer.length, mtimeMs: staleMtime, fullBuffer }, (calls) => {
    const result = getActivityState(cwd, sessionId);
    assert.deepEqual(result, { activity: 'sleeping' });
    assert.equal(calls.openSync, 0, 'conținutul nu ar fi trebuit citit deloc — mtime-ul decide singur "sleeping"');
  });
});

// --- 5. transcript inexistent -> { activity: null }, fără să arunce --------

test('getActivityState: fișier lipsă (statSync aruncă) -> { activity: null }, fără să arunce', () => {
  const cwd = 'FIXTURE-CWD-MISSING';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  withFakeFile({ filePath, size: 0, mtimeMs: 0, fullBuffer: Buffer.alloc(0), statThrows: true }, () => {
    let result;
    assert.doesNotThrow(() => {
      result = getActivityState(cwd, sessionId);
    });
    assert.deepEqual(result, { activity: null });
  });
});

test('getActivityState: cwd sau sessionId lipsă -> null imediat, fără să atingă fs', () => {
  const orig = fs.statSync;
  fs.statSync = () => {
    throw new Error('fs.statSync NU ar fi trebuit apelat pentru argumente invalide');
  };
  try {
    assert.deepEqual(getActivityState(undefined, 'sess-1'), { activity: null });
    assert.deepEqual(getActivityState('some-cwd', undefined), { activity: null });
    assert.deepEqual(getActivityState('', ''), { activity: null });
    assert.deepEqual(getActivityState(null, null), { activity: null });
  } finally {
    fs.statSync = orig;
  }
});

// --- 6. JSON invalid pe linia finală -> ignorat, căutarea continuă înapoi --

test('getActivityState: JSON invalid pe ultima linie e ignorat, se găsește linia validă anterioară', () => {
  const cwd = 'FIXTURE-CWD-BAD-JSON';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  const lines = [
    '{"type":"user","message":{"content":"salut"}}',
    'nu e deloc JSON valid {{{',
    '',
  ];
  const fullBuffer = bufferFrom(lines);

  withFakeFile({ filePath, size: fullBuffer.length, mtimeMs: FRESH_MTIME, fullBuffer }, () => {
    let result;
    assert.doesNotThrow(() => {
      result = getActivityState(cwd, sessionId);
    });
    assert.deepEqual(result, { activity: 'working' });
  });
});

// Corecție planner: brief-ul inițial spunea greșit că acest caz întoarce
// { activity: null }. Algoritmul bot-crossing (awaitingReply) întoarce
// explicit `false` (nu "necunoscut") când nu găsește nicio linie relevantă
// până la capătul cozii — fidelitatea cu referința înseamnă că acest caz e
// "working" (nu așteaptă), la fel ca la ei, nu un al treilea rezultat.
test('getActivityState: nicio linie validă în fișier -> { activity: "working" } (fidel cu awaitingReply, care implicit întoarce false)', () => {
  const cwd = 'FIXTURE-CWD-ONLY-INVALID';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  const lines = ['nu e json {{{', '{ inca nu e json'];
  const fullBuffer = bufferFrom(lines);

  withFakeFile({ filePath, size: fullBuffer.length, mtimeMs: FRESH_MTIME, fullBuffer }, () => {
    let result;
    assert.doesNotThrow(() => {
      result = getActivityState(cwd, sessionId);
    });
    assert.deepEqual(result, { activity: 'working' });
  });
});

// --- 7. Coadă tăiată (fișier > 64KB) — prima linie parțială e ignorată -----

test('getActivityState: truncare pe fișiere mari — prima linie (parțială) e ignorată', () => {
  const cwd = 'FIXTURE-CWD-TRUNCATED';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  // Filler mare fără newline la început, simulează tăierea unei linii la
  // mijloc — readTail real ar arunca prima linie "usable" ca fiind parțială.
  // Dacă NU ar fi ignorată, ar pica pe JSON.parse și ar fi tratată ca linie
  // invalidă oricum — dar aici o umplem cu ceva ce PARE JSON parțial valid
  // pentru un 'user', ca testul să demonstreze că e într-adevăr ignorată, nu
  // doar că ar fi eșuat oricum la parsare.
  const filler = '"type":"user"'.repeat(5000); // >64KB, fără fi JSON valid complet
  const lines = [
    filler,
    '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read"}],"stop_reason":"tool_use"}}',
  ];
  const fullBuffer = bufferFrom(lines);

  withFakeFile({ filePath, size: fullBuffer.length, mtimeMs: FRESH_MTIME, fullBuffer }, () => {
    const result = getActivityState(cwd, sessionId);
    assert.deepEqual(result, { activity: 'working' });
  });
});

// --- 8. Cache -----------------------------------------------------------------

test('getActivityState: cache — al doilea apel cu același mtimeMs NU mai citește fișierul', () => {
  const cwd = 'FIXTURE-CWD-CACHE';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  const fullBuffer = bufferFrom([
    '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read"}],"stop_reason":"tool_use"}}',
  ]);

  withFakeFile({ filePath, size: fullBuffer.length, mtimeMs: FRESH_MTIME, fullBuffer }, (calls) => {
    const first = getActivityState(cwd, sessionId);
    assert.deepEqual(first, { activity: 'working' });
    assert.equal(calls.openSync, 1, 'primul apel ar fi trebuit să citească fișierul o dată');

    const second = getActivityState(cwd, sessionId);
    assert.deepEqual(second, { activity: 'working' });
    assert.equal(calls.openSync, 1, 'al doilea apel cu mtime neschimbat n-ar fi trebuit să mai citească fișierul (cache)');
  });
});

test('getActivityState: cache — schimbarea mtimeMs invalidează cache-ul și re-citește fișierul', () => {
  const cwd = 'FIXTURE-CWD-CACHE-INVALIDATE';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  const bufferV1 = bufferFrom([
    '{"type":"assistant","message":{"content":[{"type":"text","text":"gata"}],"stop_reason":"end_turn"}}',
  ]);
  const bufferV2 = bufferFrom([
    '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read"}],"stop_reason":"tool_use"}}',
  ]);

  const first = withFakeFile(
    { filePath, size: bufferV1.length, mtimeMs: FRESH_MTIME, fullBuffer: bufferV1 },
    () => getActivityState(cwd, sessionId)
  );
  assert.deepEqual(first, { activity: 'waiting' });

  withFakeFile(
    { filePath, size: bufferV2.length, mtimeMs: FRESH_MTIME + 1000, fullBuffer: bufferV2 },
    (calls) => {
      const second = getActivityState(cwd, sessionId);
      assert.deepEqual(
        second,
        { activity: 'working' },
        'mtime schimbat ar fi trebuit să invalideze cache-ul și să întoarcă activity nou'
      );
      assert.equal(calls.openSync, 1, 'fișierul ar fi trebuit re-citit după schimbarea mtime');
    }
  );
});
