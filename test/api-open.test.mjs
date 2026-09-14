// Teste pentru POST /api/open (server.js) — migrate la noul contract RF-01.
//
// ÎNAINTE (T-03): pornea serverul REAL pe portul fix 5391, prin monkey-patch
// pe `http.createServer`, și lăsa `defaultOpener` (spawn de `rundll32`) să
// se declanșeze efectiv pentru orice sessionId valid — un program real,
// pe mașina utilizatorului. Brief-ul RF-01 interzice explicit asta.
//
// ACUM: `startServer({ port: 0, opener: <funcție injectată> })`. Niciun
// `rundll32` nu mai pornește din acest fișier — testăm DOAR că serverul
// cheamă opener-ul cu ținta așteptată (D12), fără să atingă vreun proces
// real.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { startServer } = require('../server.js');

let srv;
let opened;
let sessionsDir;
let dataDir;

before(async () => {
  sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf01-open-sessions-'));
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf01-open-data-'));
  opened = [];
  srv = await startServer({
    port: 0,
    host: '127.0.0.1',
    sessionsDir,
    dataDir,
    opener: (target) => opened.push(target), // D12 — niciun rundll32 real
    isAlive: () => true,
  });
});

after(async () => {
  await srv.close();
  fs.rmSync(sessionsDir, { recursive: true, force: true });
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function baseUrl() {
  return `http://127.0.0.1:${srv.port}`;
}

async function postOpen(body) {
  const isRaw = typeof body === 'string';
  const res = await fetch(`${baseUrl()}/api/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl() },
    body: isRaw ? body : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    // unele răspunsuri de eroare pot, teoretic, să nu fie JSON valid —
    // testele de mai jos ar eșua oricum la assert.
  }
  return { status: res.status, json };
}

// --- 1. Cazul fericit, cu opener injectat ------------------------------------

test('POST /api/open cu sessionId valid -> 200 {ok:true}, opener-ul injectat primește ținta claude://resume?session=...', async () => {
  opened.length = 0;
  const { status, json } = await postOpen({ sessionId: 'abc-123' });
  assert.equal(status, 200);
  assert.deepEqual(json, { ok: true });
  assert.equal(opened.length, 1, 'opener-ul injectat trebuie apelat exact o dată');
  assert.equal(opened[0], 'claude://resume?session=abc-123');
});

// --- 2. JSON invalid ----------------------------------------------------------

test('POST /api/open cu body invalid JSON -> 400, opener NECHEMAT', async () => {
  opened.length = 0;
  const { status, json } = await postOpen('nu e deloc JSON valid {{{');
  assert.equal(status, 400);
  assert.deepEqual(json, { ok: false, error: 'invalid JSON' });
  assert.equal(opened.length, 0);
});

// --- 3. sessionId lipsă --------------------------------------------------------

test('POST /api/open cu {} (fără sessionId) -> 400, opener NECHEMAT', async () => {
  opened.length = 0;
  const { status, json } = await postOpen({});
  assert.equal(status, 400);
  assert.deepEqual(json, { ok: false, error: 'missing sessionId' });
  assert.equal(opened.length, 0);
});

// --- 4. sessionId string gol ---------------------------------------------------

test('POST /api/open cu sessionId string gol -> 400, opener NECHEMAT', async () => {
  opened.length = 0;
  const { status, json } = await postOpen({ sessionId: '' });
  assert.equal(status, 400);
  assert.deepEqual(json, { ok: false, error: 'missing sessionId' });
  assert.equal(opened.length, 0);
});

// --- 5. sessionId de alt tip decât string ---------------------------------------

test('POST /api/open cu sessionId numeric -> 400, opener NECHEMAT', async () => {
  opened.length = 0;
  const { status, json } = await postOpen({ sessionId: 123 });
  assert.equal(status, 400);
  assert.deepEqual(json, { ok: false, error: 'missing sessionId' });
  assert.equal(opened.length, 0);
});

// =============================================================================
// D12 — sessionId cu byte de control (\r, \n, \x00) -> 400, opener NECHEMAT
// =============================================================================

for (const [label, sessionId] of [
  ['\\r', 'abc\rdef'],
  ['\\n', 'abc\ndef'],
  ['\\x00', 'abc\x00def'],
]) {
  test(`D12: POST /api/open cu sessionId conținând ${label} -> 400, opener NECHEMAT`, async () => {
    opened.length = 0;
    const { status, json } = await postOpen({ sessionId });
    assert.equal(status, 400);
    assert.equal(json.ok, false);
    assert.equal(opened.length, 0, `un sessionId cu caracter de control (${label}) nu trebuie să ajungă niciodată la opener`);
  });
}

// --- 6. Serverul rămâne funcțional după o cerere invalidă -----------------------

test('serverul rămâne funcțional (GET /api/agents răspunde 200 JSON) după un POST /api/open cu body stricat', async () => {
  await postOpen('body complet stricat, nu e json {{{{');
  const res = await fetch(`${baseUrl()}/api/agents`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
});
