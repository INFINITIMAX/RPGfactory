// Teste pentru POST /api/open din server.js (T-03).
//
// server.js e un script cu efect de bord la încărcare: creează un
// http.Server și îl pune imediat pe ascultare cu `server.listen(PORT, ...)`,
// unde PORT vine din `process.env.PORT || 5311`. Nu exportă nimic
// (`module.exports` lipsește) și nu separă logica de rutare într-o funcție
// testabilă izolat — deci alegem varianta 1 recomandată în brief: pornim
// serverul REAL, pe un port dedicat testelor (diferit de 5311, ca să nu
// intre în conflict cu instanța lui Lucian), și vorbim cu el prin `fetch`.
//
// Cum obținem un handle către server ca să-l putem închide la final:
// server.js nu exportă `server`, dar apelează `http.createServer(...)`
// exact o dată. Interceptăm temporar `http.createServer` (îl înfășurăm,
// nu îl înlocuim cu o logică falsă) DOAR cât durează `require('../server.js')`,
// ca să capturăm instanța reală întoarsă, apoi restaurăm imediat originalul.
// Nu testăm propriul mock — server.js tot rulează codul lui real; noi doar
// ținem o referință la rezultat, la fel cum test/rank.test.mjs monkey-patch-uiește
// temporar `fs` și restaurează originalul în finally.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const TEST_PORT = 5391; // diferit de 5311 (instanța reală a lui Lucian)
const BASE_URL = `http://localhost:${TEST_PORT}`;

let capturedServer = null;

before(async () => {
  const originalCreateServer = http.createServer.bind(http);
  http.createServer = (...args) => {
    capturedServer = originalCreateServer(...args);
    return capturedServer;
  };

  process.env.PORT = String(TEST_PORT);

  const readyPromise = new Promise((resolve, reject) => {
    require('../server.js');
    assert.ok(capturedServer, 'server.js ar fi trebuit să apeleze http.createServer');
    capturedServer.once('listening', resolve);
    capturedServer.once('error', reject);
  });

  http.createServer = originalCreateServer; // restaurăm imediat, nu mai avem nevoie de interceptare

  await readyPromise;
});

after(() => {
  return new Promise((resolve) => {
    if (capturedServer) capturedServer.close(resolve);
    else resolve();
  });
});

async function postOpen(body) {
  const isRaw = typeof body === 'string';
  const res = await fetch(`${BASE_URL}/api/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: isRaw ? body : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    // unele răspunsuri de eroare ar putea, teoretic, să nu fie JSON valid —
    // dacă se întâmplă asta, testele de mai jos vor eșua oricum la assert.deepEqual.
  }
  return { status: res.status, json };
}

// --- 1. Cazul fericit --------------------------------------------------------

test('POST /api/open cu sessionId valid (string nevid) -> 200 {ok:true}', async () => {
  const { status, json } = await postOpen({ sessionId: 'abc-123' });
  assert.equal(status, 200);
  assert.deepEqual(json, { ok: true });
});

// --- 2. JSON invalid ----------------------------------------------------------

test('POST /api/open cu body care nu e JSON valid -> 400 {ok:false,error:"invalid JSON"}', async () => {
  const { status, json } = await postOpen('nu e deloc JSON valid {{{');
  assert.equal(status, 400);
  assert.deepEqual(json, { ok: false, error: 'invalid JSON' });
});

// --- 3. sessionId lipsă --------------------------------------------------------

test('POST /api/open cu {} (fără sessionId) -> 400 {ok:false,error:"missing sessionId"}', async () => {
  const { status, json } = await postOpen({});
  assert.equal(status, 400);
  assert.deepEqual(json, { ok: false, error: 'missing sessionId' });
});

// --- 4. sessionId string gol ---------------------------------------------------

test('POST /api/open cu sessionId string gol -> 400 (tratat ca lipsă, nu doar undefined)', async () => {
  const { status, json } = await postOpen({ sessionId: '' });
  assert.equal(status, 400);
  assert.deepEqual(json, { ok: false, error: 'missing sessionId' });
});

// --- 5. sessionId de alt tip decât string ---------------------------------------

test('POST /api/open cu sessionId numeric (nu string) -> 400', async () => {
  const { status, json } = await postOpen({ sessionId: 123 });
  assert.equal(status, 400);
  assert.deepEqual(json, { ok: false, error: 'missing sessionId' });
});

// --- 6. Serverul rămâne funcțional după o cerere invalidă -----------------------

test('serverul rămâne funcțional (GET /api/agents răspunde 200 JSON) după un POST /api/open cu body stricat', async () => {
  // reproduce regresia de la T-01 (ERR_HTTP_HEADERS_SENT) - dacă handler-ul de
  // /api/open ar crăpa procesul sau ar trimite headere duble la JSON invalid,
  // fie acest test, fie cel de mai jos ar eșua / ar bloca suite-ul.
  await postOpen('body complet stricat, nu e json {{{{');

  const res = await fetch(`${BASE_URL}/api/agents`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body), '/api/agents ar fi trebuit să răspundă tot cu un array JSON, ca înainte');
});

// --- 7. Limitare documentată explicit ---------------------------------------
//
// NU testăm dacă `rundll32 url.dll,FileProtocolHandler` chiar rulează sau
// dacă declanșează handler-ul `claude://` — nu e determinist/portabil într-un
// `node --test`, depinde de instalarea Claude Code desktop pe mașina curentă,
// și brief-ul interzice explicit un mock fals pentru asta. Testul de mai sus
// (cazul 1) confirmă doar contractul HTTP: server-ul răspunde 200 {ok:true}
// pentru un sessionId valid, indiferent dacă `rundll32` reușește sau nu -
// exact ce spune codul (`child.on('error', () => {})`, fire-and-forget).
