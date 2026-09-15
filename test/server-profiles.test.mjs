// Teste HTTP pentru rutele /api/profiles* (RF-02b), server real pe port
// efemer — tipar ca test/server.test.mjs. Nu retestăm exhaustiv
// readJsonBody/checkOrigin/containment static (deja acoperite în alte
// fișiere); doar integrare minimă pe rutele noi.

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
  sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf02b-sessions-'));
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf02b-data-'));
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf02b-db-'));
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

// =========================================================================
// POST /api/profiles
// =========================================================================

test('POST /api/profiles: 201 + profil complet', async () => {
  const { status, json } = await req('POST', '/api/profiles', { name: 'Profil HTTP' });
  assert.equal(status, 201);
  assert.equal(json.name, 'Profil HTTP');
  assert.ok(json.id);
  assert.equal(json.revision, 1);
  assert.equal(json.approval_state, 'proposed');
});

test('POST /api/profiles: 400 pe name lipsă', async () => {
  const { status, json } = await req('POST', '/api/profiles', {});
  assert.equal(status, 400);
  assert.equal(json.ok, false);
});

// =========================================================================
// GET /api/profiles
// =========================================================================

test('GET /api/profiles: 200 + listă conținând toate profilurile create', async () => {
  const p1 = await createProfileViaApi('Lista 1');
  const p2 = await createProfileViaApi('Lista 2');
  const p3 = await createProfileViaApi('Lista 3');

  const { status, json } = await req('GET', '/api/profiles');
  assert.equal(status, 200);
  assert.ok(Array.isArray(json));
  const ids = json.map((p) => p.id);
  assert.ok(ids.includes(p1.id) && ids.includes(p2.id) && ids.includes(p3.id));
});

// =========================================================================
// GET /api/profiles/{id}
// =========================================================================

test('GET /api/profiles/{id}: 200 + profil pentru id existent', async () => {
  const created = await createProfileViaApi('Citire directă');
  const { status, json } = await req('GET', `/api/profiles/${created.id}`);
  assert.equal(status, 200);
  assert.equal(json.id, created.id);
  assert.equal(json.name, 'Citire directă');
});

test('GET /api/profiles/{id}: 404 pe id inexistent', async () => {
  const { status, json } = await req('GET', '/api/profiles/nu-exista-deloc');
  assert.equal(status, 404);
  assert.equal(json.ok, false);
});

// =========================================================================
// PATCH /api/profiles/{id}
// =========================================================================

test('PATCH /api/profiles/{id}: 200 pe succes', async () => {
  const created = await createProfileViaApi('De actualizat');
  const { status, json } = await req('PATCH', `/api/profiles/${created.id}`, {
    expectedRevision: 1,
    changes: { name: 'Actualizat' },
  });
  assert.equal(status, 200);
  assert.equal(json.name, 'Actualizat');
  assert.equal(json.revision, 2);
});

test('PATCH /api/profiles/{id}: 400 pe expectedRevision lipsă', async () => {
  const created = await createProfileViaApi('X1');
  const { status, json } = await req('PATCH', `/api/profiles/${created.id}`, {
    changes: { name: 'nu contează' },
  });
  assert.equal(status, 400);
  assert.equal(json.ok, false);
});

test('PATCH /api/profiles/{id}: 400 pe changes invalid (gol)', async () => {
  const created = await createProfileViaApi('X2');
  const { status, json } = await req('PATCH', `/api/profiles/${created.id}`, {
    expectedRevision: 1,
    changes: {},
  });
  assert.equal(status, 400);
  assert.equal(json.ok, false);
});

test('PATCH /api/profiles/{id}: 409 pe conflict de revizie, cu current în body', async () => {
  const created = await createProfileViaApi('X3');
  // revizia curentă e 1; trimitem 2, ca să nu se potrivească.
  const { status, json } = await req('PATCH', `/api/profiles/${created.id}`, {
    expectedRevision: 2,
    changes: { name: 'nu va intra' },
  });
  assert.equal(status, 409);
  assert.equal(json.ok, false);
  assert.ok(json.current, 'body-ul trebuie să conțină profilul curent real');
  assert.equal(json.current.id, created.id);
  assert.equal(json.current.revision, 1);
});

test('PATCH /api/profiles/{id}: 404 pe id inexistent', async () => {
  const { status, json } = await req('PATCH', '/api/profiles/nu-exista-deloc', {
    expectedRevision: 1,
    changes: { name: 'x' },
  });
  assert.equal(status, 404);
  assert.equal(json.ok, false);
});

// =========================================================================
// GET /api/profiles/{id}/history
// =========================================================================

test('GET /api/profiles/{id}/history: 200 + listă (cel puțin rândul de creație)', async () => {
  const created = await createProfileViaApi('Cu istorie');
  const { status, json } = await req('GET', `/api/profiles/${created.id}/history`);
  assert.equal(status, 200);
  assert.ok(Array.isArray(json));
  assert.ok(json.length >= 1);
  assert.equal(json[0].field, 'created');
});

// =========================================================================
// POST/GET /api/profiles/{id}/configurations
// =========================================================================

test('POST /api/profiles/{id}/configurations: 201 + configurație completă', async () => {
  const created = await createProfileViaApi('Cu configurație');
  const { status, json } = await req('POST', `/api/profiles/${created.id}/configurations`, {
    harness: 'claude-code',
    provider: 'anthropic',
    model: 'sonnet',
  });
  assert.equal(status, 201);
  assert.equal(json.profile_id, created.id);
  assert.equal(json.harness, 'claude-code');
});

test('POST /api/profiles/{id}/configurations: 404 pe profil (id) inexistent', async () => {
  const { status, json } = await req('POST', '/api/profiles/nu-exista-deloc/configurations', {
    harness: 'claude-code',
    provider: 'anthropic',
    model: 'sonnet',
  });
  assert.equal(status, 404);
  assert.equal(json.ok, false);
});

test('POST /api/profiles/{id}/configurations: 400 pe câmpuri lipsă', async () => {
  const created = await createProfileViaApi('Configurație invalidă');
  const { status, json } = await req('POST', `/api/profiles/${created.id}/configurations`, {
    harness: 'claude-code',
  });
  assert.equal(status, 400);
  assert.equal(json.ok, false);
});

test('GET /api/profiles/{id}/configurations: 200 + listă conținând configurația creată', async () => {
  const created = await createProfileViaApi('Listă configurații');
  await req('POST', `/api/profiles/${created.id}/configurations`, {
    harness: 'claude-code',
    provider: 'anthropic',
    model: 'sonnet',
  });
  const { status, json } = await req('GET', `/api/profiles/${created.id}/configurations`);
  assert.equal(status, 200);
  assert.ok(Array.isArray(json));
  assert.equal(json.length, 1);
  assert.equal(json[0].harness, 'claude-code');
});

// =========================================================================
// Metodă neacceptată -> 405 cu Allow corect
// =========================================================================

test('DELETE /api/profiles -> 405 cu Allow: "GET, POST"', async () => {
  const { status, headers } = await req('DELETE', '/api/profiles');
  assert.equal(status, 405);
  assert.equal(headers.get('allow'), 'GET, POST');
});

test('PUT /api/profiles/{id} -> 405 cu Allow: "GET, PATCH"', async () => {
  const created = await createProfileViaApi('Metodă greșită');
  const { status, headers } = await req('PUT', `/api/profiles/${created.id}`);
  assert.equal(status, 405);
  assert.equal(headers.get('allow'), 'GET, PATCH');
});

test('POST /api/profiles/{id}/history -> 405 cu Allow: "GET"', async () => {
  const created = await createProfileViaApi('History greșit');
  const { status, headers } = await req('POST', `/api/profiles/${created.id}/history`, { x: 1 });
  assert.equal(status, 405);
  assert.equal(headers.get('allow'), 'GET');
});

test('DELETE /api/profiles/{id}/configurations -> 405 cu Allow: "GET, POST"', async () => {
  const created = await createProfileViaApi('Configurations greșit');
  const { status, headers } = await req('DELETE', `/api/profiles/${created.id}/configurations`);
  assert.equal(status, 405);
  assert.equal(headers.get('allow'), 'GET, POST');
});

// =========================================================================
// Cale necunoscută sub /api/profiles/ -> 404
// =========================================================================

test('GET /api/profiles/{id}/altceva -> 404, nu confundată cu altă rută', async () => {
  const created = await createProfileViaApi('Sub-cale necunoscută');
  const { status, json } = await req('GET', `/api/profiles/${created.id}/altceva`);
  assert.equal(status, 404);
  assert.equal(json.ok, false);
});

test('GET /api/profiles/{id}/history/extra -> 404 (prea multe segmente)', async () => {
  const created = await createProfileViaApi('Prea multe segmente');
  const { status, json } = await req('GET', `/api/profiles/${created.id}/history/extra`);
  assert.equal(status, 404);
  assert.equal(json.ok, false);
});

// =========================================================================
// id "suspect" în cale -> 404 ca orice id inexistent, NU 500
//
// `id` vine din `pathname.split('/')`, iar `pathname` (din `new URL(...)`)
// NU decodează niciodată secvențele procent-codate — exact ca la `%2F`/`%5C`
// documentat la D4 în server.test.mjs. Deci `%00` din URL ajunge la
// `CONTROL_CHARS.test(id)` ca textul literal "%00" (3 caractere printabile),
// nu ca byte-ul de control real `\x00` — regexul, corect, nu-l prinde, iar
// cererea continuă spre `getProfile('%00')`, care nu găsește nimic -> 404.
// Ce contează aici e că niciun id "suspect" nu produce o eroare de server
// (500) sau vreun comportament neașteptat — doar 404, ca orice id inexistent.
// =========================================================================

const SUSPECT_IDS = ['%00', '%0d%0a', '..%2f..%2fetc%2fpasswd', '%2e%2e', 'a%00b'];

for (const suspectId of SUSPECT_IDS) {
  test(`GET /api/profiles/${suspectId} -> 404, nu 500 (id suspect tratat ca id oarecare inexistent)`, async () => {
    const { status, json } = await req('GET', `/api/profiles/${suspectId}`);
    assert.equal(status, 404);
    assert.equal(json.ok, false);
  });
}

// `CONTROL_CHARS.test(id)` (server.js:265) rămâne verificat pe fiecare
// cerere sub /api/profiles/{id}* — testul de mai jos fixează explicit
// comportamentul de AZI (404, nu 400) ca să scoată la iveală orice
// schimbare viitoare a sursei lui `id` (ex. dacă cineva ar adăuga
// `decodeURIComponent` înainte de verificare, acest test ar începe să pice
// cu 400 în loc de 404, semnalând schimbarea).
test('GET /api/profiles/%00 -> 404, nu 400: id-ul rămâne nedecodat înaintea verificării CONTROL_CHARS', async () => {
  const { status } = await req('GET', '/api/profiles/%00');
  assert.equal(status, 404);
});

// =========================================================================
// Body JSON invalid -> 400 (readJsonBody, confirmare minimă)
// =========================================================================

test('POST /api/profiles cu body JSON invalid -> 400', async () => {
  const { status, json } = await req('POST', '/api/profiles', 'nu e json {{{');
  assert.equal(status, 400);
  assert.equal(json.ok, false);
});

// =========================================================================
// Origine greșită/lipsă pe mutații -> 403 (gate RF-01, confirmare minimă)
// =========================================================================

test('POST /api/profiles fără Origin -> 403', async () => {
  const { status } = await req('POST', '/api/profiles', { name: 'nu ar trebui să intre' }, { Origin: null });
  assert.equal(status, 403);
});

test('PATCH /api/profiles/{id} cu Origin greșit -> 403', async () => {
  const created = await createProfileViaApi('Origine greșită');
  const { status } = await req(
    'PATCH',
    `/api/profiles/${created.id}`,
    { expectedRevision: 1, changes: { name: 'nu ar trebui' } },
    { Origin: `http://127.0.0.1:${srv.port + 1}` }
  );
  assert.equal(status, 403);
});

// =========================================================================
// Deschiderea lazy — server complet, nicio cerere -> fișierul bazei nu
// există încă
// =========================================================================

test('createServer(...) singur, fără nicio cerere HTTP, NU creează fișierul bazei de profiluri', async () => {
  const lazyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf02b-lazy-db-'));
  const lazyDbPath = path.join(lazyDir, 'inca-nu-exista', 'rpgfactory.db');
  const lazySessions = fs.mkdtempSync(path.join(os.tmpdir(), 'rf02b-lazy-sessions-'));
  const lazyData = fs.mkdtempSync(path.join(os.tmpdir(), 'rf02b-lazy-data-'));

  const s = createServer({
    sessionsDir: lazySessions,
    dataDir: lazyData,
    dbPath: lazyDbPath,
    opener: () => {},
    isAlive: () => true,
  });
  try {
    assert.ok(!fs.existsSync(lazyDbPath), 'construcția serverului nu trebuie să atingă discul bazei de profiluri');

    await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
    const port = s.address().port;
    // forma exactă cerută de `checkOrigin` (`{ hosts, origins }`), construită
    // de funcția reală — la fel cum face `startServer(...)` intern; un `Set`
    // simplu face `allowed.hosts` `undefined`, și `checkOrigin` aruncă.
    s.setAllowedOrigins(buildAllowedOrigins(port));

    // tot nicio cerere pe /api/profiles* -> tot nu trebuie să existe fișierul.
    await fetch(`http://127.0.0.1:${port}/api/agents`, { headers: { Origin: `http://127.0.0.1:${port}` } });
    assert.ok(!fs.existsSync(lazyDbPath), 'o cerere pe altă rută (/api/agents) nu trebuie să deschidă baza de profiluri');

    // prima cerere reală pe /api/profiles* -> abia acum apare fișierul.
    const res = await fetch(`http://127.0.0.1:${port}/api/profiles`, { headers: { Origin: `http://127.0.0.1:${port}` } });
    assert.equal(res.status, 200);
    assert.ok(fs.existsSync(lazyDbPath), 'după prima cerere reală pe /api/profiles, fișierul bazei trebuie să existe');
  } finally {
    await new Promise((resolve) => s.close(resolve));
    fs.rmSync(lazyDir, { recursive: true, force: true });
    fs.rmSync(lazySessions, { recursive: true, force: true });
    fs.rmSync(lazyData, { recursive: true, force: true });
  }
});
