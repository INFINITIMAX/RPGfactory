// Teste pentru rank.js (T-02).
//
// rank.js e CommonJS (`module.exports = { getRank, encodeCwd, modelToRank }`).
// `readTail` și `findLastAssistantModel` NU sunt exportate — nu pot fi testate
// direct. Le acoperim INDIRECT prin `getRank`, mocănd manual `fs.statSync` /
// `fs.openSync` / `fs.readSync` / `fs.closeSync` (fără librărie nouă — doar
// salvare/restaurare a metodelor pe obiectul `fs` real, în try/finally, ca în
// stilul minimalist deja folosit în test/app.test.mjs cu node:vm).
//
// De ce mock de fs și nu fișiere reale în os.tmpdir(): `PROJECTS_DIR` din
// rank.js e derivat hardcodat din os.homedir() + '.claude/projects' — nu
// poate fi injectat un folder de bază alternativ fără să modificăm rank.js
// (interzis de brief). Scriind fixture-uri direct sub `~/.claude/projects/`
// am fi atins un folder real al lui Lucian, chiar dacă am folosi nume
// sintetice — riscant și inutil. Mocănd `fs`, testăm exact logica de parsare
// / cache / truncare din getRank, fără să atingem discul deloc.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const { getRank, encodeCwd, modelToRank } = require('../rank.js');

// --- 1. modelToRank ---------------------------------------------------------

test('modelToRank: mapează familiile de modele cunoscute la rangul corect', () => {
  assert.equal(modelToRank('claude-opus-5'), 'Fleet Admiral');
  assert.equal(modelToRank('claude-sonnet-5'), 'Captain');
  assert.equal(modelToRank('claude-haiku-4-5-20251001'), 'Cadet');
});

test('modelToRank: e case-insensitive', () => {
  assert.equal(modelToRank('Claude-Opus-5'), 'Fleet Admiral');
  assert.equal(modelToRank('CLAUDE-SONNET-5'), 'Captain');
  assert.equal(modelToRank('Claude-Haiku-4-5'), 'Cadet');
});

test('modelToRank: model necunoscut întoarce null', () => {
  assert.equal(modelToRank('gpt-4'), null);
  assert.equal(modelToRank('gemini-pro'), null);
});

test('modelToRank: input null/undefined/gol întoarce null fără să arunce', () => {
  assert.doesNotThrow(() => {
    assert.equal(modelToRank(null), null);
    assert.equal(modelToRank(undefined), null);
    assert.equal(modelToRank(''), null);
  });
});

// --- 2. encodeCwd ------------------------------------------------------------

test('encodeCwd: exemplul verificat manual de coder pe disc', () => {
  assert.equal(encodeCwd('C:\\Users\\Lucian-PC'), 'C--Users-Lucian-PC');
});

test('encodeCwd: cwd cu separatori "/" (alt OS)', () => {
  assert.equal(encodeCwd('/home/lucian/project'), '-home-lucian-project');
});

test('encodeCwd: cwd mixt cu ":" și "/" și "\\\\"', () => {
  assert.equal(encodeCwd('C:/Users/lucian\\proj'), 'C--Users-lucian-proj');
});

// --- Helper de mock pentru fs (folosit doar de testele getRank) ------------

const FAKE_FD = -12345;

// Aplică peste `fs` real un fals fișier la `filePath`, cu `size`/`mtimeMs`
// controlate și conținut `fullBuffer` (readSync întoarce mereu ultimii
// `length` bytes din fullBuffer, exact ce ar face un readTail real pe un
// fișier de `size` = fullBuffer.length). Orice altă cale trece prin fs real.
// Restaurează metodele originale în finally, indiferent ce se întâmplă.
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
  // Reproduce exact construcția din rank.js: PROJECTS_DIR = ~/.claude/projects
  return path.join(os.homedir(), '.claude', 'projects', encodeCwd(cwd), sessionId + '.jsonl');
}

function uniqueSession() {
  return 'fixture-' + randomUUID();
}

// --- 3. getRank cu fixture-uri controlate prin mock de fs -------------------

test('getRank: găsește modelul din ultima linie assistant validă și îl mapează la rang', () => {
  const cwd = 'FIXTURE-CWD';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  const lines = [
    '{"type":"summary","summary":"ceva"}',
    '{"type":"assistant","message":{"model":"claude-sonnet-5"}}',
    '{"type":"assistant","message":{"model":"claude-opus-5"}}',
  ];
  const fullBuffer = Buffer.from(lines.join('\n'), 'utf8');

  withFakeFile({ filePath, size: fullBuffer.length, mtimeMs: 1000, fullBuffer }, () => {
    const result = getRank(cwd, sessionId);
    assert.deepEqual(result, { rank: 'Fleet Admiral', model: 'claude-opus-5' });
  });
});

test('getRank: o linie assistant fără message.model e ignorată, căutarea continuă înapoi', () => {
  const cwd = 'FIXTURE-CWD-NO-MODEL-TAIL';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  const lines = [
    '{"type":"assistant","message":{"model":"claude-haiku-4-5"}}',
    '{"type":"assistant","message":{}}',
    '{"type":"assistant"}',
  ];
  const fullBuffer = Buffer.from(lines.join('\n'), 'utf8');

  withFakeFile({ filePath, size: fullBuffer.length, mtimeMs: 1000, fullBuffer }, () => {
    const result = getRank(cwd, sessionId);
    assert.deepEqual(result, { rank: 'Cadet', model: 'claude-haiku-4-5' });
  });
});

test('getRank: linii JSON invalide sunt ignorate silențios, fără să arunce', () => {
  const cwd = 'FIXTURE-CWD-BAD-JSON';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  const lines = [
    '{"type":"assistant","message":{"model":"claude-sonnet-5"}}',
    'nu e deloc JSON valid {{{',
    '',
  ];
  const fullBuffer = Buffer.from(lines.join('\n'), 'utf8');

  withFakeFile({ filePath, size: fullBuffer.length, mtimeMs: 1000, fullBuffer }, () => {
    let result;
    assert.doesNotThrow(() => {
      result = getRank(cwd, sessionId);
    });
    assert.deepEqual(result, { rank: 'Captain', model: 'claude-sonnet-5' });
  });
});

test('getRank: niciun assistant valid în fișier -> { rank: null, model: null }', () => {
  const cwd = 'FIXTURE-CWD-NO-ASSISTANT';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  const lines = ['{"type":"user","message":{"content":"salut"}}', '{"type":"summary"}'];
  const fullBuffer = Buffer.from(lines.join('\n'), 'utf8');

  withFakeFile({ filePath, size: fullBuffer.length, mtimeMs: 1000, fullBuffer }, () => {
    const result = getRank(cwd, sessionId);
    assert.deepEqual(result, { rank: null, model: null });
  });
});

test('getRank: fișier lipsă (statSync aruncă) -> { rank: null, model: null }, fără să arunce', () => {
  const cwd = 'FIXTURE-CWD-MISSING';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  withFakeFile({ filePath, size: 0, mtimeMs: 0, fullBuffer: Buffer.alloc(0), statThrows: true }, () => {
    let result;
    assert.doesNotThrow(() => {
      result = getRank(cwd, sessionId);
    });
    assert.deepEqual(result, { rank: null, model: null });
  });
});

test('getRank: cwd sau sessionId lipsă -> null imediat, fără să atingă deloc fs', () => {
  const spyStat = () => {
    throw new Error('fs.statSync NU ar fi trebuit apelat pentru argumente invalide');
  };
  const orig = fs.statSync;
  fs.statSync = spyStat;
  try {
    assert.deepEqual(getRank(undefined, 'sess-1'), { rank: null, model: null });
    assert.deepEqual(getRank('some-cwd', undefined), { rank: null, model: null });
    assert.deepEqual(getRank('', ''), { rank: null, model: null });
    assert.deepEqual(getRank(null, null), { rank: null, model: null });
  } finally {
    fs.statSync = orig;
  }
});

test('getRank: truncare pe fișiere mari — prima linie (parțială) e ignorată, modelul din coadă tot se găsește', () => {
  const cwd = 'FIXTURE-CWD-TRUNCATED';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  // Filler mare fără newline la început, simulează tăierea unei linii la
  // mijloc — readTail real ar arunca prima linie "usable" ca fiind parțială.
  const filler = 'X'.repeat(30000);
  const lines = [
    filler, // devine prima linie "usable" din coadă -> trebuie ignorată
    '{"type":"assistant","message":{"model":"claude-sonnet-5"}}',
    '{"type":"assistant","message":{}}',
    '{"type":"assistant","message":{"model":"claude-opus-5"}}',
  ];
  const fullBuffer = Buffer.from(lines.join('\n'), 'utf8');

  withFakeFile({ filePath, size: fullBuffer.length, mtimeMs: 1000, fullBuffer }, () => {
    const result = getRank(cwd, sessionId);
    assert.deepEqual(result, { rank: 'Fleet Admiral', model: 'claude-opus-5' });
  });
});

// --- 4. Cache -----------------------------------------------------------------

test('getRank: cache — al doilea apel cu același mtimeMs NU mai citește fișierul', () => {
  const cwd = 'FIXTURE-CWD-CACHE';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  const fullBuffer = Buffer.from('{"type":"assistant","message":{"model":"claude-opus-5"}}', 'utf8');

  withFakeFile({ filePath, size: fullBuffer.length, mtimeMs: 500, fullBuffer }, (calls) => {
    const first = getRank(cwd, sessionId);
    assert.deepEqual(first, { rank: 'Fleet Admiral', model: 'claude-opus-5' });
    assert.equal(calls.openSync, 1, 'primul apel ar fi trebuit să citească fișierul o dată');

    const second = getRank(cwd, sessionId);
    assert.deepEqual(second, { rank: 'Fleet Admiral', model: 'claude-opus-5' });
    assert.equal(calls.openSync, 1, 'al doilea apel cu mtime neschimbat n-ar fi trebuit să mai citească fișierul (cache)');
  });
});

test('getRank: cache — schimbarea mtimeMs invalidează cache-ul și re-citește fișierul', () => {
  const cwd = 'FIXTURE-CWD-CACHE-INVALIDATE';
  const sessionId = uniqueSession();
  const filePath = fixturePath(cwd, sessionId);

  const bufferV1 = Buffer.from('{"type":"assistant","message":{"model":"claude-sonnet-5"}}', 'utf8');
  const bufferV2 = Buffer.from('{"type":"assistant","message":{"model":"claude-opus-5"}}', 'utf8');

  const first = withFakeFile(
    { filePath, size: bufferV1.length, mtimeMs: 1, fullBuffer: bufferV1 },
    () => getRank(cwd, sessionId)
  );
  assert.deepEqual(first, { rank: 'Captain', model: 'claude-sonnet-5' });

  withFakeFile({ filePath, size: bufferV2.length, mtimeMs: 2, fullBuffer: bufferV2 }, (calls) => {
    const second = getRank(cwd, sessionId);
    assert.deepEqual(
      second,
      { rank: 'Fleet Admiral', model: 'claude-opus-5' },
      'mtime schimbat ar fi trebuit să invalideze cache-ul și să întoarcă modelul nou'
    );
    assert.equal(calls.openSync, 1, 'fișierul ar fi trebuit re-citit după schimbarea mtime');
  });
});
