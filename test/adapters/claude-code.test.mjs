// Teste pentru adapters/claude-code.js (RF-03a): `pollClaudeCodeSessions`,
// direct, fără HTTP, fără timer. Tipar ca test/runs.test.mjs (runsStore real
// pe ':memory:', `now` injectat) + fixture-uri de fișiere de sesiune scrise
// manual într-un director temporar, ca la test/server.test.mjs
// (`sessionsDir`/`isAlive` injectate, D1/D12 — nicio sesiune reală de pe
// disc, niciun proces real sondat).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { pollClaudeCodeSessions } = require('../../adapters/claude-code.js');
const { createRunsStore } = require('../../runs.js');

function tmpSessionsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rf03a-sessions-'));
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function makeStore(now) {
  return createRunsStore({ dbPath: ':memory:', now: now || (() => 1000) });
}

function writeSession(dir, filename, data) {
  fs.writeFileSync(path.join(dir, filename), JSON.stringify(data));
}

function aliveMap(map) {
  // `isAlive` injectat, ca `defaultIsAlive` din server.js, dar controlat de
  // test — nicio sondă reală de proces (D12).
  return (pid) => Boolean(map[pid]);
}

// =========================================================================
// Sesiune vie / moartă — cazul cel mai important al lotului (§2.1 brief):
// adaptorul NU filtrează sesiunile moarte, spre deosebire de readAgents().
// =========================================================================

test('sesiune vie (isAlive=true) -> apare în runs cu lifecycle running, source_harness claude-code, native_id/project corecte', () => {
  const dir = tmpSessionsDir();
  const store = makeStore();
  try {
    writeSession(dir, 'a.json', { sessionId: 'sess-live', cwd: '/proiect/x', pid: 111 });
    const result = pollClaudeCodeSessions({
      sessionsDir: dir,
      isAlive: aliveMap({ 111: true }),
      runsStore: store,
    });
    assert.deepEqual(result, { observed: 1, errors: 0 });

    const run = store.getRun('claude-code:sess-live');
    assert.ok(run, 'sesiunea vie trebuie să ajungă în runs');
    assert.equal(run.lifecycle, 'running');
    assert.equal(run.source_harness, 'claude-code');
    assert.equal(run.native_id, 'sess-live');
    assert.equal(run.project, '/proiect/x');
  } finally {
    store.close();
    rmrf(dir);
  }
});

test('sesiune moartă (isAlive=false) -> NU e omisă, apare în runs cu lifecycle stopped (diferență deliberată față de readAgents)', () => {
  const dir = tmpSessionsDir();
  const store = makeStore();
  try {
    writeSession(dir, 'b.json', { sessionId: 'sess-dead', cwd: '/proiect/y', pid: 222 });
    const result = pollClaudeCodeSessions({
      sessionsDir: dir,
      isAlive: aliveMap({ 222: false }),
      runsStore: store,
    });
    assert.deepEqual(result, { observed: 1, errors: 0 });

    const run = store.getRun('claude-code:sess-dead');
    assert.ok(run, 'sesiunea moartă NU trebuie omisă din runs — trebuie observată explicit ca stopped');
    assert.equal(run.lifecycle, 'stopped');
  } finally {
    store.close();
    rmrf(dir);
  }
});

test('mai multe sesiuni deodată (mix vii/moarte) -> toate ajung în runs, fiecare cu lifecycle-ul corect', () => {
  const dir = tmpSessionsDir();
  const store = makeStore();
  try {
    writeSession(dir, 'a.json', { sessionId: 'mix-live', cwd: '/x', pid: 1 });
    writeSession(dir, 'b.json', { sessionId: 'mix-dead', cwd: '/y', pid: 2 });
    const result = pollClaudeCodeSessions({
      sessionsDir: dir,
      isAlive: aliveMap({ 1: true, 2: false }),
      runsStore: store,
    });
    assert.deepEqual(result, { observed: 2, errors: 0 });

    assert.equal(store.getRun('claude-code:mix-live').lifecycle, 'running');
    assert.equal(store.getRun('claude-code:mix-dead').lifecycle, 'stopped');
    assert.equal(store.listRuns().length, 2);
  } finally {
    store.close();
    rmrf(dir);
  }
});

// =========================================================================
// Aceeași sesiune, două cicluri de sondare
// =========================================================================

test('aceeași sesiune sondată de două ori -> nu creează rând nou, lifecycle se actualizează dacă s-a schimbat', () => {
  const dir = tmpSessionsDir();
  const store = makeStore();
  try {
    writeSession(dir, 'a.json', { sessionId: 'repeat', cwd: '/x', pid: 42 });

    const first = pollClaudeCodeSessions({
      sessionsDir: dir,
      isAlive: aliveMap({ 42: true }),
      runsStore: store,
    });
    assert.deepEqual(first, { observed: 1, errors: 0 });
    assert.equal(store.getRun('claude-code:repeat').lifecycle, 'running');

    // al doilea ciclu: procesul a murit între cele două sondări
    const second = pollClaudeCodeSessions({
      sessionsDir: dir,
      isAlive: aliveMap({ 42: false }),
      runsStore: store,
    });
    assert.deepEqual(second, { observed: 1, errors: 0 });

    assert.equal(store.listRuns().length, 1, 'nu trebuie creat un al doilea rând pentru aceeași sesiune');
    assert.equal(store.getRun('claude-code:repeat').lifecycle, 'stopped', 'lifecycle-ul trebuie actualizat la stopped');
  } finally {
    store.close();
    rmrf(dir);
  }
});

// =========================================================================
// sessionsDir inexistent / gol
// =========================================================================

test('sessionsDir inexistent -> {observed:0, errors:0}, fără excepție, runs rămâne gol', () => {
  const store = makeStore();
  try {
    const nonexistent = path.join(os.tmpdir(), 'rf03a-nu-exista-' + Date.now());
    let result;
    assert.doesNotThrow(() => {
      result = pollClaudeCodeSessions({
        sessionsDir: nonexistent,
        isAlive: aliveMap({}),
        runsStore: store,
      });
    });
    assert.deepEqual(result, { observed: 0, errors: 0 });
    assert.deepEqual(store.listRuns(), []);
  } finally {
    store.close();
  }
});

test('director gol (fără fișiere .json) -> {observed:0, errors:0}', () => {
  const dir = tmpSessionsDir();
  const store = makeStore();
  try {
    const result = pollClaudeCodeSessions({
      sessionsDir: dir,
      isAlive: aliveMap({}),
      runsStore: store,
    });
    assert.deepEqual(result, { observed: 0, errors: 0 });
  } finally {
    store.close();
    rmrf(dir);
  }
});

// =========================================================================
// Fișier corupt — nu oprește tot ciclul
// =========================================================================

test('fișier JSON corupt + fișier valid în același director -> corupt contorizat la errors, cel valid tot ajunge în runs', () => {
  const dir = tmpSessionsDir();
  const store = makeStore();
  try {
    fs.writeFileSync(path.join(dir, 'corrupt.json'), '{ nu e json valid {{{');
    writeSession(dir, 'valid.json', { sessionId: 'ok-one', cwd: '/z', pid: 7 });

    const result = pollClaudeCodeSessions({
      sessionsDir: dir,
      isAlive: aliveMap({ 7: true }),
      runsStore: store,
    });
    assert.deepEqual(result, { observed: 1, errors: 1 });
    assert.ok(store.getRun('claude-code:ok-one'), 'fișierul valid trebuie procesat, chiar dacă altul din același ciclu e corupt');
  } finally {
    store.close();
    rmrf(dir);
  }
});

// =========================================================================
// Câmpuri obligatorii lipsă
// =========================================================================

test('sessionId lipsă -> observeRun aruncă VALIDATION, prins ca eroare, contorizat la errors, nu ajunge în runs', () => {
  const dir = tmpSessionsDir();
  const store = makeStore();
  try {
    writeSession(dir, 'no-id.json', { cwd: '/x', pid: 9 });
    const result = pollClaudeCodeSessions({
      sessionsDir: dir,
      isAlive: aliveMap({ 9: true }),
      runsStore: store,
    });
    assert.deepEqual(result, { observed: 0, errors: 1 });
    assert.deepEqual(store.listRuns(), []);
  } finally {
    store.close();
    rmrf(dir);
  }
});

test('cwd lipsă -> nu aruncă (project e opțional pentru observeRun), sesiunea ajunge totuși în runs cu project null', () => {
  const dir = tmpSessionsDir();
  const store = makeStore();
  try {
    writeSession(dir, 'no-cwd.json', { sessionId: 'sess-no-cwd', pid: 10 });
    const result = pollClaudeCodeSessions({
      sessionsDir: dir,
      isAlive: aliveMap({ 10: true }),
      runsStore: store,
    });
    assert.deepEqual(result, { observed: 1, errors: 0 });
    const run = store.getRun('claude-code:sess-no-cwd');
    assert.ok(run);
    assert.equal(run.project, null);
  } finally {
    store.close();
    rmrf(dir);
  }
});
