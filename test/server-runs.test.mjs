// Teste HTTP pentru rutele /api/runs* + /api/profiles/{id}/runs (RF-02c),
// server real pe port efemer — tipar ca test/server-profiles.test.mjs. Nu
// retestăm exhaustiv readJsonBody/checkOrigin (deja acoperite); doar
// integrare minimă pe rutele noi.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createServer, startServer } = require('../server.js');
const { buildAllowedOrigins } = require('../server/http-guards.js');

let srv;
let sessionsDir;
let dataDir;
let dbDir;
let dbPath;

before(async () => {
  sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf02c-sessions-'));
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf02c-data-'));
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf02c-db-'));
  dbPath = path.join(dbDir, 'rpgfactory.db');
  srv = await startServer({
    port: 0,
    host: '127.0.0.1',
    sessionsDir,
    dataDir,
    dbPath,
    opener: () => {},
    isAlive: () => true,
  });
});

after(async () => {
  await srv.close();
  fs.rmSync(sessionsDir, { recursive: true, force: true });
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(dbDir, { recursive: true, force: true });
});

function baseUrl() {
  return `http://127.0.0.1:${srv.port}`;
}

async function req(method, routePath, body, extraHeaders = {}) {
  const hasBody = body !== undefined;
  const isRaw = typeof body === 'string';
  const headers = { ...extraHeaders };
  if (!('Origin' in headers)) headers.Origin = baseUrl();
  if (headers.Origin === null) delete headers.Origin; // sentinel explicit: cerere FĂRĂ header Origin deloc
  if (hasBody) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl()}${routePath}`, {
    method,
    headers,
    body: hasBody ? (isRaw ? body : JSON.stringify(body)) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    // ok pentru răspunsuri fără corp JSON (405 etc.)
  }
  return { status: res.status, json, headers: res.headers };
}

async function createProfileViaApi(name) {
  const { status, json } = await req('POST', '/api/profiles', { name });
  assert.equal(status, 201, `crearea profilului "${name}" trebuia să reușească`);
  return json;
}

async function observeViaApi(sourceHarness, nativeId, extra = {}) {
  const { status, json } = await req('POST', '/api/runs/observe', { sourceHarness, nativeId, ...extra });
  assert.equal(status, 201, `observeRun pentru ${sourceHarness}:${nativeId} trebuia să reușească`);
  return json;
}

// =========================================================================
// POST /api/runs/observe
// =========================================================================

test('POST /api/runs/observe: 201 + run complet', async () => {
  const { status, json } = await req('POST', '/api/runs/observe', {
    sourceHarness: 'claude-code',
    nativeId: 'sess-1',
    lifecycle: 'running',
  });
  assert.equal(status, 201);
  assert.equal(json.id, 'claude-code:sess-1');
  assert.equal(json.lifecycle, 'running');
  assert.equal(json.profile_id, null);
});

test('POST /api/runs/observe: 400 pe câmpuri lipsă (nativeId lipsă)', async () => {
  const { status, json } = await req('POST', '/api/runs/observe', { sourceHarness: 'pi' });
  assert.equal(status, 400);
  assert.equal(json.ok, false);
});

test('POST /api/runs/observe: 400 pe lifecycle invalid', async () => {
  const { status, json } = await req('POST', '/api/runs/observe', {
    sourceHarness: 'pi',
    nativeId: 'x',
    lifecycle: 'bla',
  });
  assert.equal(status, 400);
  assert.equal(json.ok, false);
});

test('GET /api/runs/observe -> 405 (nu tratat ca id literal "observe")', async () => {
  const { status, headers } = await req('GET', '/api/runs/observe');
  assert.equal(status, 405);
  assert.equal(headers.get('allow'), 'POST');
});

// =========================================================================
// GET /api/runs
// =========================================================================

test('GET /api/runs: 200 + listă conținând run-urile observate', async () => {
  const r1 = await observeViaApi('pi', 'list-1');
  const r2 = await observeViaApi('pi', 'list-2');

  const { status, json } = await req('GET', '/api/runs');
  assert.equal(status, 200);
  assert.ok(Array.isArray(json));
  const ids = json.map((r) => r.id);
  assert.ok(ids.includes(r1.id) && ids.includes(r2.id));
});

// =========================================================================
// GET /api/runs/{id}
// =========================================================================

test('GET /api/runs/{id}: 200 + run pentru id existent, cu ":" în id', async () => {
  const created = await observeViaApi('claude-code', 'abc-123');
  const { status, json } = await req('GET', `/api/runs/${created.id}`);
  assert.equal(status, 200);
  assert.equal(json.id, 'claude-code:abc-123');
  assert.ok(json.id.includes(':'), 'sanity: id-ul conține efectiv ":"');
});

test('GET /api/runs/{id}: 404 pe id inexistent', async () => {
  const { status, json } = await req('GET', '/api/runs/nu-exista:deloc');
  assert.equal(status, 404);
  assert.equal(json.ok, false);
});

// =========================================================================
// POST /api/runs/{id}/associate
// =========================================================================

test('POST /api/runs/{id}/associate: 200 pe succes', async () => {
  const profile = await createProfileViaApi('Asociabil');
  const run = await observeViaApi('pi', 'assoc-ok');
  const { status, json } = await req('POST', `/api/runs/${run.id}/associate`, {
    profileId: profile.id,
    expectedRevision: run.revision,
  });
  assert.equal(status, 200);
  assert.equal(json.profile_id, profile.id);
});

test('POST /api/runs/{id}/associate: 400 pe profileId lipsă', async () => {
  const run = await observeViaApi('pi', 'assoc-noprofile');
  const { status, json } = await req('POST', `/api/runs/${run.id}/associate`, {
    expectedRevision: run.revision,
  });
  assert.equal(status, 400);
  assert.equal(json.ok, false);
});

test('POST /api/runs/{id}/associate: 400 pe expectedRevision lipsă', async () => {
  const profile = await createProfileViaApi('Fără revizie');
  const run = await observeViaApi('pi', 'assoc-norevision');
  const { status, json } = await req('POST', `/api/runs/${run.id}/associate`, {
    profileId: profile.id,
  });
  assert.equal(status, 400);
  assert.equal(json.ok, false);
});

test('POST /api/runs/{id}/associate: 404 pe run inexistent', async () => {
  const profile = await createProfileViaApi('Run inexistent');
  const { status, json } = await req('POST', '/api/runs/nu-exista:deloc/associate', {
    profileId: profile.id,
    expectedRevision: 1,
  });
  assert.equal(status, 404);
  assert.equal(json.ok, false);
});

test('POST /api/runs/{id}/associate: 404 pe profil inexistent', async () => {
  const run = await observeViaApi('pi', 'assoc-noprofile-exist');
  const { status, json } = await req('POST', `/api/runs/${run.id}/associate`, {
    profileId: 'nu-exista-profil',
    expectedRevision: run.revision,
  });
  assert.equal(status, 404);
  assert.equal(json.ok, false);
});

test('POST /api/runs/{id}/associate: 409 pe conflict de revizie, cu "current" în body, FĂRĂ "activeRuns"', async () => {
  const profile = await createProfileViaApi('CAS conflict');
  const run = await observeViaApi('pi', 'assoc-cas-conflict');
  const { status, json } = await req('POST', `/api/runs/${run.id}/associate`, {
    profileId: profile.id,
    expectedRevision: run.revision + 5,
  });
  assert.equal(status, 409);
  assert.equal(json.ok, false);
  assert.ok(json.current, 'conflict de revizie trebuie să aducă "current"');
  assert.equal(json.current.id, run.id);
  assert.equal(json.activeRuns, null, 'conflictul de revizie nu trebuie să aibă activeRuns populat');
});

test('POST /api/runs/{id}/associate: 409 pe conflict I24, cu "activeRuns" în body, FĂRĂ "current"', async () => {
  const profile = await createProfileViaApi('I24 conflict');
  const busy = await observeViaApi('pi', 'i24-busy', { lifecycle: 'running' });
  await req('POST', `/api/runs/${busy.id}/associate`, { profileId: profile.id, expectedRevision: busy.revision });

  const newcomer = await observeViaApi('pi', 'i24-newcomer');
  const { status, json } = await req('POST', `/api/runs/${newcomer.id}/associate`, {
    profileId: profile.id,
    expectedRevision: newcomer.revision,
  });
  assert.equal(status, 409);
  assert.equal(json.ok, false);
  assert.ok(Array.isArray(json.activeRuns), 'conflictul I24 trebuie să aducă "activeRuns"');
  assert.equal(json.activeRuns.length, 1);
  assert.equal(json.activeRuns[0].id, busy.id);
  assert.equal(json.current, null, 'conflictul I24 nu trebuie să aibă current populat');
});

// =========================================================================
// POST /api/runs/{id}/dissociate
// =========================================================================

test('POST /api/runs/{id}/dissociate: 200 pe succes', async () => {
  const profile = await createProfileViaApi('De disociat');
  const run = await observeViaApi('pi', 'dissoc-ok');
  const associated = await req('POST', `/api/runs/${run.id}/associate`, {
    profileId: profile.id,
    expectedRevision: run.revision,
  });
  const { status, json } = await req('POST', `/api/runs/${run.id}/dissociate`, {
    expectedRevision: associated.json.revision,
  });
  assert.equal(status, 200);
  assert.equal(json.profile_id, null);
});

test('POST /api/runs/{id}/dissociate: 400 pe expectedRevision lipsă', async () => {
  const run = await observeViaApi('pi', 'dissoc-norevision');
  const { status, json } = await req('POST', `/api/runs/${run.id}/dissociate`, {});
  assert.equal(status, 400);
  assert.equal(json.ok, false);
});

test('POST /api/runs/{id}/dissociate: 404 pe id inexistent', async () => {
  const { status, json } = await req('POST', '/api/runs/nu-exista:deloc/dissociate', { expectedRevision: 1 });
  assert.equal(status, 404);
  assert.equal(json.ok, false);
});

test('POST /api/runs/{id}/dissociate: 409 pe conflict de revizie', async () => {
  const run = await observeViaApi('pi', 'dissoc-cas-conflict');
  const { status, json } = await req('POST', `/api/runs/${run.id}/dissociate`, {
    expectedRevision: run.revision + 9,
  });
  assert.equal(status, 409);
  assert.equal(json.ok, false);
});

// =========================================================================
// GET /api/profiles/{id}/runs
// =========================================================================

test('GET /api/profiles/{id}/runs: 200 + listă (goală pentru profil fără run-uri)', async () => {
  const profile = await createProfileViaApi('Fără run-uri');
  const { status, json } = await req('GET', `/api/profiles/${profile.id}/runs`);
  assert.equal(status, 200);
  assert.deepEqual(json, []);
});

test('GET /api/profiles/{id}/runs: 200 + listă conținând run-ul asociat', async () => {
  const profile = await createProfileViaApi('Cu run-uri');
  const run = await observeViaApi('pi', 'profile-runs-1');
  await req('POST', `/api/runs/${run.id}/associate`, { profileId: profile.id, expectedRevision: run.revision });

  const { status, json } = await req('GET', `/api/profiles/${profile.id}/runs`);
  assert.equal(status, 200);
  assert.equal(json.length, 1);
  assert.equal(json[0].id, run.id);
});

// regresie minimă: /api/profiles/{id}/history și /configurations tot funcționează
test('regresie: GET /api/profiles/{id}/history tot funcționează după adăugarea sub-rutei "runs"', async () => {
  const profile = await createProfileViaApi('Regresie history');
  const { status, json } = await req('GET', `/api/profiles/${profile.id}/history`);
  assert.equal(status, 200);
  assert.ok(Array.isArray(json));
  assert.ok(json.length >= 1);
});

test('regresie: GET /api/profiles/{id}/configurations tot funcționează după adăugarea sub-rutei "runs"', async () => {
  const profile = await createProfileViaApi('Regresie configurations');
  const { status, json } = await req('GET', `/api/profiles/${profile.id}/configurations`);
  assert.equal(status, 200);
  assert.deepEqual(json, []);
});

// =========================================================================
// Metodă neacceptată -> 405 cu Allow corect
// =========================================================================

test('DELETE /api/runs -> 405 cu Allow: "GET"', async () => {
  const { status, headers } = await req('DELETE', '/api/runs');
  assert.equal(status, 405);
  assert.equal(headers.get('allow'), 'GET');
});

test('POST /api/runs/{id} -> 405 cu Allow: "GET"', async () => {
  const run = await observeViaApi('pi', 'method-not-allowed');
  const { status, headers } = await req('POST', `/api/runs/${run.id}`, { x: 1 });
  assert.equal(status, 405);
  assert.equal(headers.get('allow'), 'GET');
});

test('GET /api/runs/{id}/associate -> 405 cu Allow: "POST"', async () => {
  const run = await observeViaApi('pi', 'method-associate');
  const { status, headers } = await req('GET', `/api/runs/${run.id}/associate`);
  assert.equal(status, 405);
  assert.equal(headers.get('allow'), 'POST');
});

test('GET /api/runs/{id}/dissociate -> 405 cu Allow: "POST"', async () => {
  const run = await observeViaApi('pi', 'method-dissociate');
  const { status, headers } = await req('GET', `/api/runs/${run.id}/dissociate`);
  assert.equal(status, 405);
  assert.equal(headers.get('allow'), 'POST');
});

test('POST /api/profiles/{id}/runs -> 405 cu Allow: "GET"', async () => {
  const profile = await createProfileViaApi('Runs greșit');
  const { status, headers } = await req('POST', `/api/profiles/${profile.id}/runs`, { x: 1 });
  assert.equal(status, 405);
  assert.equal(headers.get('allow'), 'GET');
});

// =========================================================================
// Cale necunoscută sub /api/runs/ -> 404
// =========================================================================

test('GET /api/runs/{id}/altceva -> 404 (sub necunoscut)', async () => {
  const run = await observeViaApi('pi', 'unknown-sub');
  const { status, json } = await req('GET', `/api/runs/${run.id}/altceva`);
  assert.equal(status, 404);
  assert.equal(json.ok, false);
});

test('GET /api/runs/{id}/associate/extra -> 404 (prea multe segmente)', async () => {
  const run = await observeViaApi('pi', 'too-many-segments');
  const { status, json } = await req('GET', `/api/runs/${run.id}/associate/extra`);
  assert.equal(status, 404);
  assert.equal(json.ok, false);
});

// =========================================================================
// Body JSON invalid -> 400 (readJsonBody, confirmare minimă)
// =========================================================================

test('POST /api/runs/observe cu body JSON invalid -> 400', async () => {
  const { status, json } = await req('POST', '/api/runs/observe', 'nu e json {{{');
  assert.equal(status, 400);
  assert.equal(json.ok, false);
});

// =========================================================================
// Origine greșită/lipsă pe mutații -> 403 (gate RF-01, confirmare minimă)
// =========================================================================

test('POST /api/runs/observe fără Origin -> 403', async () => {
  const { status } = await req('POST', '/api/runs/observe', { sourceHarness: 'pi', nativeId: 'no-origin' }, { Origin: null });
  assert.equal(status, 403);
});

test('POST /api/runs/{id}/associate cu Origin greșit -> 403', async () => {
  const run = await observeViaApi('pi', 'wrong-origin');
  const { status } = await req(
    'POST',
    `/api/runs/${run.id}/associate`,
    { profileId: 'x', expectedRevision: 1 },
    { Origin: `http://127.0.0.1:${srv.port + 1}` }
  );
  assert.equal(status, 403);
});

// =========================================================================
// Deschiderea lazy și închiderea la close()
// =========================================================================

test('createServer(...) singur, fără nicio cerere HTTP, NU creează fișierul bazei', async () => {
  const lazyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf02c-lazy-db-'));
  const lazyDbPath = path.join(lazyDir, 'inca-nu-exista', 'rpgfactory.db');
  const lazySessions = fs.mkdtempSync(path.join(os.tmpdir(), 'rf02c-lazy-sessions-'));
  const lazyData = fs.mkdtempSync(path.join(os.tmpdir(), 'rf02c-lazy-data-'));

  const s = createServer({
    sessionsDir: lazySessions,
    dataDir: lazyData,
    dbPath: lazyDbPath,
    opener: () => {},
    isAlive: () => true,
  });
  try {
    assert.ok(!fs.existsSync(lazyDbPath), 'construcția serverului nu trebuie să atingă discul bazei');

    await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
    const port = s.address().port;
    s.setAllowedOrigins(buildAllowedOrigins(port));

    const res = await fetch(`http://127.0.0.1:${port}/api/runs/observe`, {
      method: 'POST',
      headers: { Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceHarness: 'pi', nativeId: 'lazy-touch' }),
    });
    assert.equal(res.status, 201);
    assert.ok(fs.existsSync(lazyDbPath), 'după prima cerere reală pe /api/runs, fișierul bazei trebuie să existe');
  } finally {
    await new Promise((resolve) => s.close(resolve));
    fs.rmSync(lazyDir, { recursive: true, force: true });
    fs.rmSync(lazySessions, { recursive: true, force: true });
    fs.rmSync(lazyData, { recursive: true, force: true });
  }
});

test('runsStore se închide la server.close() indiferent dacă serverul a fost pornit prin createServer()+listen()/close() manual', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf02c-manual-close-'));
  const manualDbPath = path.join(dir, 'rpgfactory.db');
  const manualSessions = fs.mkdtempSync(path.join(os.tmpdir(), 'rf02c-manual-sessions-'));
  const manualData = fs.mkdtempSync(path.join(os.tmpdir(), 'rf02c-manual-data-'));

  const s = createServer({
    sessionsDir: manualSessions,
    dataDir: manualData,
    dbPath: manualDbPath,
    opener: () => {},
    isAlive: () => true,
  });
  try {
    await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
    const port = s.address().port;
    s.setAllowedOrigins(buildAllowedOrigins(port));

    // atinge baza real, ca handle-ul runsStore să fie deschis efectiv
    await fetch(`http://127.0.0.1:${port}/api/runs`, { headers: { Origin: `http://127.0.0.1:${port}` } });

    await new Promise((resolve) => s.close(resolve));

    // Dacă runsStore nu s-ar fi închis, fișierul WAL/SHM ar putea rămâne
    // blocat pe Windows la ștergere — verificăm indirect: directorul poate
    // fi șters curat, fără eroare de „fișier folosit de alt proces".
    assert.doesNotThrow(() => fs.rmSync(dir, { recursive: true, force: true }));
  } finally {
    fs.rmSync(manualSessions, { recursive: true, force: true });
    fs.rmSync(manualData, { recursive: true, force: true });
  }
});
