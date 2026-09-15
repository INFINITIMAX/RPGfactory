// Teste pentru wiring-ul `startPolling`/`stopPolling` din server.js (RF-03a).
// Server real pe port efemer, ca la test/server-runs.test.mjs — dar
// `pollIntervalMs` MIC (injectat), ca suita să nu aștepte 5 secunde reale
// (implicitul din createServer).
//
// Motiv pentru fișier separat (nu extindem test/server-runs.test.mjs): acolo
// se testează contractul HTTP al /api/runs*; aici testăm ciclul de viață al
// unui timer intern, fără nicio cerere HTTP relevantă — teme diferite,
// fișiere separate, ca planner-ul să poată rula/lucra pe fiecare independent.
//
// Verificăm efectul polling-ului citind DIRECT din `runsStore`, cu propriul
// handle pe ACELAȘI `dbPath` (fișier real pe disc, nu ':memory:' — WAL
// permite mai multe handle-uri simultane pe același fișier, ca la
// test/runs.test.mjs / makeSharedStores), fără să trecem prin HTTP.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createServer, startServer } = require('../server.js');
const { createRunsStore } = require('../runs.js');

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-'));
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function writeSession(dir, filename, data) {
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readRuns(dbPath) {
  const store = createRunsStore({ dbPath });
  try {
    return store.listRuns();
  } finally {
    store.close();
  }
}

function closeServer(s) {
  return new Promise((resolve) => s.close(resolve));
}

const POLL_MS = 25;
const WAIT_MS = 200; // câteva intervale întregi, generos pentru un CI lent

// =========================================================================
// createServer(...) singur, fără startPolling() -> nicio sondare
// =========================================================================

test('createServer(...) singur, fără startPolling() -> runs rămâne gol, chiar cu sesiuni reale în sessionsDir, chiar după > pollIntervalMs', async () => {
  const dir = tmpDir('rf03a-poll-none');
  const sessionsDir = tmpDir('rf03a-poll-none-sessions');
  const dataDir = tmpDir('rf03a-poll-none-data');
  const dbPath = path.join(dir, 'rpgfactory.db');
  writeSession(sessionsDir, 'a.json', { sessionId: 'no-poll', cwd: '/x', pid: 1 });

  const s = createServer({
    sessionsDir,
    dataDir,
    dbPath,
    pollIntervalMs: POLL_MS,
    opener: () => {},
    isAlive: () => true,
  });
  try {
    await sleep(WAIT_MS);
    assert.deepEqual(readRuns(dbPath), [], 'fără startPolling(), nicio sondare nu trebuie să aibă loc');
  } finally {
    await closeServer(s);
    rmrf(dir);
    rmrf(sessionsDir);
    rmrf(dataDir);
  }
});

// =========================================================================
// server.startPolling() -> după pollIntervalMs, sesiunile apar în runs
// =========================================================================

test('server.startPolling() -> după pollIntervalMs, sesiunile din sessionsDir apar în runs', async () => {
  const dir = tmpDir('rf03a-poll-on');
  const sessionsDir = tmpDir('rf03a-poll-on-sessions');
  const dataDir = tmpDir('rf03a-poll-on-data');
  const dbPath = path.join(dir, 'rpgfactory.db');
  writeSession(sessionsDir, 'a.json', { sessionId: 'polled-live', cwd: '/proiect', pid: 1 });
  writeSession(sessionsDir, 'b.json', { sessionId: 'polled-dead', cwd: '/proiect2', pid: 2 });

  const s = createServer({
    sessionsDir,
    dataDir,
    dbPath,
    pollIntervalMs: POLL_MS,
    opener: () => {},
    isAlive: (pid) => pid === 1,
  });
  try {
    s.startPolling();
    await sleep(WAIT_MS);
    const runs = readRuns(dbPath);
    const live = runs.find((r) => r.native_id === 'polled-live');
    const dead = runs.find((r) => r.native_id === 'polled-dead');
    assert.ok(live, 'sesiunea vie trebuie observată după startPolling()');
    assert.equal(live.lifecycle, 'running');
    assert.ok(dead, 'sesiunea moartă trebuie observată după startPolling() (nu filtrată)');
    assert.equal(dead.lifecycle, 'stopped');
  } finally {
    s.stopPolling();
    await closeServer(s);
    rmrf(dir);
    rmrf(sessionsDir);
    rmrf(dataDir);
  }
});

// =========================================================================
// startPolling() de două ori -> un singur timer
// =========================================================================

test('server.startPolling() chemat de două ori -> un singur setInterval creat (idempotent)', () => {
  const dir = tmpDir('rf03a-poll-idem');
  const sessionsDir = tmpDir('rf03a-poll-idem-sessions');
  const dataDir = tmpDir('rf03a-poll-idem-data');

  const s = createServer({
    sessionsDir,
    dataDir,
    dbPath: ':memory:',
    pollIntervalMs: POLL_MS,
    opener: () => {},
    isAlive: () => true,
  });

  const originalSetInterval = global.setInterval;
  let calls = 0;
  global.setInterval = (...args) => {
    calls += 1;
    return originalSetInterval(...args);
  };
  try {
    s.startPolling();
    s.startPolling();
    assert.equal(calls, 1, 'a doua chemare a startPolling() nu trebuie să creeze un al doilea timer');
  } finally {
    global.setInterval = originalSetInterval;
    s.stopPolling();
    rmrf(sessionsDir);
    rmrf(dataDir);
  }
});

// =========================================================================
// stopPolling() -> sondarea încetează
// =========================================================================

test('server.stopPolling() -> sesiune nouă adăugată DUPĂ oprire nu apare în runs, chiar după > pollIntervalMs', async () => {
  const dir = tmpDir('rf03a-poll-stop');
  const sessionsDir = tmpDir('rf03a-poll-stop-sessions');
  const dataDir = tmpDir('rf03a-poll-stop-data');
  const dbPath = path.join(dir, 'rpgfactory.db');

  const s = createServer({
    sessionsDir,
    dataDir,
    dbPath,
    pollIntervalMs: POLL_MS,
    opener: () => {},
    isAlive: () => true,
  });
  try {
    s.startPolling();
    await sleep(WAIT_MS); // lăsăm sondarea să ruleze cel puțin un ciclu (director gol, fără efect vizibil)
    s.stopPolling();

    writeSession(sessionsDir, 'after-stop.json', { sessionId: 'after-stop', cwd: '/x', pid: 99 });
    await sleep(WAIT_MS);

    const runs = readRuns(dbPath);
    assert.ok(
      !runs.some((r) => r.native_id === 'after-stop'),
      'o sesiune apărută după stopPolling() nu trebuie observată'
    );
  } finally {
    await closeServer(s);
    rmrf(dir);
    rmrf(sessionsDir);
    rmrf(dataDir);
  }
});

test('server.stopPolling() chemat fără ca startPolling() să fi fost chemat vreodată -> nu aruncă', () => {
  const sessionsDir = tmpDir('rf03a-poll-stop-noop-sessions');
  const dataDir = tmpDir('rf03a-poll-stop-noop-data');
  const s = createServer({
    sessionsDir,
    dataDir,
    dbPath: ':memory:',
    pollIntervalMs: POLL_MS,
    opener: () => {},
    isAlive: () => true,
  });
  try {
    assert.doesNotThrow(() => s.stopPolling());
  } finally {
    rmrf(sessionsDir);
    rmrf(dataDir);
  }
});

// =========================================================================
// startServer(...) pornește sondarea automat
// =========================================================================

test('startServer(...) pornește sondarea automat, fără apel explicit de startPolling()', async () => {
  const dir = tmpDir('rf03a-poll-auto');
  const sessionsDir = tmpDir('rf03a-poll-auto-sessions');
  const dataDir = tmpDir('rf03a-poll-auto-data');
  const dbPath = path.join(dir, 'rpgfactory.db');
  writeSession(sessionsDir, 'a.json', { sessionId: 'auto-started', cwd: '/x', pid: 1 });

  const srv = await startServer({
    port: 0,
    host: '127.0.0.1',
    sessionsDir,
    dataDir,
    dbPath,
    pollIntervalMs: POLL_MS,
    opener: () => {},
    isAlive: () => true,
  });
  try {
    await sleep(WAIT_MS);
    const runs = readRuns(dbPath);
    assert.ok(
      runs.some((r) => r.native_id === 'auto-started'),
      'startServer() trebuie să pornească sondarea automat, fără apel explicit'
    );
  } finally {
    await srv.close();
    rmrf(dir);
    rmrf(sessionsDir);
    rmrf(dataDir);
  }
});

// =========================================================================
// close() oprește sondarea — ambele căi (RF-02b-b: prima reparație a
// acoperit doar una dintre ele)
// =========================================================================

test('close() oprește sondarea — calea startServer()', async () => {
  const dir = tmpDir('rf03a-poll-close-start');
  const sessionsDir = tmpDir('rf03a-poll-close-start-sessions');
  const dataDir = tmpDir('rf03a-poll-close-start-data');
  const dbPath = path.join(dir, 'rpgfactory.db');

  const srv = await startServer({
    port: 0,
    host: '127.0.0.1',
    sessionsDir,
    dataDir,
    dbPath,
    pollIntervalMs: POLL_MS,
    opener: () => {},
    isAlive: () => true,
  });
  await srv.close();

  writeSession(sessionsDir, 'after-close.json', { sessionId: 'after-close-start', cwd: '/x', pid: 1 });
  await sleep(WAIT_MS);

  try {
    const runs = readRuns(dbPath);
    assert.ok(
      !runs.some((r) => r.native_id === 'after-close-start'),
      'după close() (calea startServer), sondarea nu trebuie să mai ruleze'
    );
  } finally {
    rmrf(dir);
    rmrf(sessionsDir);
    rmrf(dataDir);
  }
});

test('close() oprește sondarea — calea createServer()+listen()/close() manual', async () => {
  const dir = tmpDir('rf03a-poll-close-manual');
  const sessionsDir = tmpDir('rf03a-poll-close-manual-sessions');
  const dataDir = tmpDir('rf03a-poll-close-manual-data');
  const dbPath = path.join(dir, 'rpgfactory.db');

  const s = createServer({
    sessionsDir,
    dataDir,
    dbPath,
    pollIntervalMs: POLL_MS,
    opener: () => {},
    isAlive: () => true,
  });
  await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
  s.startPolling();
  await closeServer(s);

  writeSession(sessionsDir, 'after-close.json', { sessionId: 'after-close-manual', cwd: '/x', pid: 1 });
  await sleep(WAIT_MS);

  try {
    const runs = readRuns(dbPath);
    assert.ok(
      !runs.some((r) => r.native_id === 'after-close-manual'),
      'după close() (calea manuală listen()/close()), sondarea nu trebuie să mai ruleze'
    );
  } finally {
    rmrf(dir);
    rmrf(sessionsDir);
    rmrf(dataDir);
  }
});
