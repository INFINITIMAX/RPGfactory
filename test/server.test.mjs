// Teste pentru server.js: D1 (import fără efecte secundare), D2 (bind
// loopback), D4 (containment static, la nivel HTTP capăt-la-capăt), D9
// (query string), D10 (metodă per rută -> 405 + Allow), rutele
// /api/reveal /api/new-session, contractele §2.4 despre Origin, ruta
// necunoscută sub /api/, și pinuirea §3.4 (createServer() singur).
//
// ÎNAINTE (T-03/T-18/T-19): acest fișier interconecta `http.createServer`
// temporar și pornea serverul REAL pe portul fix 5393, citind efectiv
// `require('../server.js')` cu efect de bord. RF-01 elimină exact acel
// efect de bord (D1) — deci acel truc nu mai are sens și nici nu mai
// funcționează (createServer nu mai ascultă la import). Folosim
// `startServer({ port: 0, ... })` din contractul nou.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createServer, startServer } = require('../server.js');

const __filename_self = fileURLToPath(import.meta.url);
const __dirname_self = path.dirname(__filename_self);

let srv;
let sessionsDir;
let dataDir;

before(async () => {
  sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf01-server-sessions-'));
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf01-server-data-'));
  srv = await startServer({
    port: 0,
    host: '127.0.0.1',
    sessionsDir,
    dataDir,
    opener: () => {},
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

async function post(routePath, body, extraHeaders = {}) {
  const isRaw = typeof body === 'string';
  const res = await fetch(`${baseUrl()}${routePath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl(), ...extraHeaders },
    body: isRaw ? body : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    // ok pentru cazurile de eroare
  }
  return { status: res.status, json };
}

// =============================================================================
// D1 — import fără efecte secundare: `require('../server.js')` (deja
// executat mai sus, la nivel de modul) nu a deschis niciun port și nu a
// citit `sessionsDir` — dovedim asta observabil.
// =============================================================================

test('D1: createServer() singur (fără listen) nu ascultă niciun port', () => {
  const s = createServer({ sessionsDir, dataDir, opener: () => {}, isAlive: () => true });
  assert.equal(s.listening, false);
  assert.equal(s.address(), null);
  s.close();
});

test('D1: sessionsDir nu e citit la createServer() — abia la o cerere efectivă pe /api/agents', () => {
  const originalReaddirSync = fs.readdirSync;
  const calls = [];
  fs.readdirSync = (...args) => {
    calls.push(args[0]);
    return originalReaddirSync(...args);
  };
  let s;
  try {
    s = createServer({ sessionsDir, dataDir, opener: () => {}, isAlive: () => true });
    assert.deepEqual(calls, [], 'createServer() nu ar trebui să citească deloc sessionsDir înainte de vreo cerere');
  } finally {
    fs.readdirSync = originalReaddirSync;
    if (s) s.close();
  }
});

test('D1: la o cerere GET /api/agents, sessionsDir CHIAR e citit (dovadă că citirea e legată de cerere, nu absentă din alt motiv)', async () => {
  const res = await fetch(`${baseUrl()}/api/agents`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
});

// =============================================================================
// D2 — bind pe loopback, nu pe toate interfețele
// =============================================================================

test('D2: srv.address.address e loopback (127.0.0.1), nu 0.0.0.0/:: (wildcard)', () => {
  assert.equal(srv.address.address, '127.0.0.1');
  assert.notEqual(srv.address.address, '::');
  assert.notEqual(srv.address.address, '0.0.0.0');
});

// =============================================================================
// D9 — query string nu mai ajunge în calea de fișier / rutare
// =============================================================================

test('D9: GET /app.js?v=1 -> 200, același conținut ca GET /app.js', async () => {
  const [withQuery, plain] = await Promise.all([
    fetch(`${baseUrl()}/app.js?v=1`),
    fetch(`${baseUrl()}/app.js`),
  ]);
  assert.equal(plain.status, 200);
  assert.equal(withQuery.status, 200, 'query string-ul nu trebuie să rupă rezolvarea fișierului static (D9)');
  const [bodyQuery, bodyPlain] = await Promise.all([withQuery.text(), plain.text()]);
  assert.equal(bodyQuery, bodyPlain);
});

test('D9: GET /api/agents?x=1 e tratat ca rută API (200, array), nu ca fișier static (404)', async () => {
  const res = await fetch(`${baseUrl()}/api/agents?x=1`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
});

// =============================================================================
// D10 — metodă greșită pe fiecare rută -> 405 cu header Allow
// =============================================================================

const routeMethodTable = [
  { path: '/api/agents', wrongMethod: 'DELETE', allow: 'GET, HEAD' },
  { path: '/api/open', wrongMethod: 'GET', allow: 'POST' },
  { path: '/api/reveal', wrongMethod: 'GET', allow: 'POST' },
  { path: '/api/new-session', wrongMethod: 'GET', allow: 'POST' },
  { path: '/api/state', wrongMethod: 'DELETE', allow: 'GET, PUT' },
];

for (const { path: routePath, wrongMethod, allow } of routeMethodTable) {
  test(`D10: ${wrongMethod} ${routePath} -> 405 cu header Allow: "${allow}"`, async () => {
    const res = await fetch(`${baseUrl()}${routePath}`, {
      method: wrongMethod,
      headers: { Origin: baseUrl() },
    });
    assert.equal(res.status, 405, `${wrongMethod} ${routePath} ar fi trebuit să dea 405, nu ${res.status}`);
    assert.equal(res.headers.get('allow'), allow);
  });
}

test('D10: POST / (fișier static, nu API) -> 405 cu Allow: "GET, HEAD"', async () => {
  const res = await fetch(`${baseUrl()}/`, { method: 'POST', headers: { Origin: baseUrl() } });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET, HEAD');
});

// =============================================================================
// Contract §2.4 — rută necunoscută sub /api/ -> 404, NU căutare de fișier
// =============================================================================

test('contract: GET /api/nu-exista -> 404 JSON, nu 200/403 din căutare de fișier static', async () => {
  const res = await fetch(`${baseUrl()}/api/nu-exista`, { headers: { Origin: baseUrl() } });
  assert.equal(res.status, 404);
  const json = await res.json();
  assert.equal(json.ok, false);
});

// =============================================================================
// /api/reveal, /api/new-session — folder valid/invalid (migrat din T-18)
// =============================================================================

const VALID_ABS_FOLDER = __dirname_self;
const A_FILE_NOT_A_DIR = __filename_self;
const NONEXISTENT_ABS_FOLDER = path.join(__dirname_self, 'folder-care-sigur-nu-exista-rf01');
const RELATIVE_FOLDER = 'relative/path';

for (const routePath of ['/api/reveal', '/api/new-session']) {
  test(`POST ${routePath} cu folder absolut existent -> 200 {ok:true}, opener injectat primește ținta`, async () => {
    const opened = [];
    const s = await startServer({
      port: 0,
      host: '127.0.0.1',
      sessionsDir,
      dataDir,
      opener: (target) => opened.push(target),
      isAlive: () => true,
    });
    const url = `http://127.0.0.1:${s.port}`;
    try {
      const res = await fetch(`${url}${routePath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: url },
        body: JSON.stringify({ folder: VALID_ABS_FOLDER }),
      });
      const json = await res.json();
      assert.equal(res.status, 200);
      assert.deepEqual(json, { ok: true });
      assert.equal(opened.length, 1, 'opener-ul injectat trebuie apelat exact o dată (D12 — niciun proces real)');
    } finally {
      await s.close();
    }
  });

  test(`POST ${routePath} cu cale relativă -> 400`, async () => {
    const { status, json } = await post(routePath, { folder: RELATIVE_FOLDER });
    assert.equal(status, 400);
    assert.equal(json.ok, false);
  });

  test(`POST ${routePath} cu folder absolut inexistent -> 400`, async () => {
    const { status, json } = await post(routePath, { folder: NONEXISTENT_ABS_FOLDER });
    assert.equal(status, 400);
    assert.equal(json.ok, false);
  });

  test(`POST ${routePath} cu cale absolută existentă dar FIȘIER, nu director -> 400`, async () => {
    const { status, json } = await post(routePath, { folder: A_FILE_NOT_A_DIR });
    assert.equal(status, 400);
    assert.equal(json.ok, false);
  });

  test(`POST ${routePath} cu body invalid JSON -> 400`, async () => {
    const { status, json } = await post(routePath, 'nu e json {{{');
    assert.equal(status, 400);
    assert.deepEqual(json, { ok: false, error: 'invalid JSON' });
  });
}

// =============================================================================
// Contract §2.4 — Origin: regula diferă pe METODĂ, nu pe rută (integrare)
// =============================================================================

test('contract: GET /api/agents fără Origin -> 200 (navigare normală)', async () => {
  const res = await fetch(`${baseUrl()}/api/agents`);
  assert.equal(res.status, 200);
});

test('contract: PUT /api/state fără Origin -> 403', async () => {
  const res = await fetch(`${baseUrl()}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }, // fără Origin, intenționat
    body: JSON.stringify({ baseUpdatedAt: 0, archived: [] }),
  });
  assert.equal(res.status, 403);
});

test('D3: PUT /api/state cu Origin la alt port (Host corect) -> 403', async () => {
  const res = await fetch(`${baseUrl()}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Origin: `http://localhost:${srv.port + 1}` },
    body: JSON.stringify({ baseUpdatedAt: 0, archived: [] }),
  });
  assert.equal(res.status, 403);
});

test('D3: PUT /api/state cu Origin corect (127.0.0.1:<port real>) -> nu e blocat de gate-ul de origine', async () => {
  const res = await fetch(`${baseUrl()}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${srv.port}` },
    body: JSON.stringify({ baseUpdatedAt: 0, archived: [] }),
  });
  assert.notEqual(res.status, 403);
});

// D3, varianta "Host cu port greșit" — necesită control direct al
// header-ului Host, imposibil prin `fetch`; folosim `http.request` nativ,
// care nu filtrează `Host` din `headers`.
function requestWithRawHost({ host, origin, port = srv.port }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/api/state',
        method: 'PUT',
        headers: { Host: host, 'Content-Type': 'application/json', Origin: origin },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode, raw }));
      }
    );
    req.on('error', reject);
    req.end(JSON.stringify({ baseUpdatedAt: 0, archived: [] }));
  });
}

test('D3: PUT /api/state cu Host la port greșit (Origin altfel local) -> 403', async () => {
  const { status } = await requestWithRawHost({ host: `127.0.0.1:${srv.port + 1}`, origin: `http://127.0.0.1:${srv.port}` });
  assert.equal(status, 403);
});

// =============================================================================
// D4 — containment static, capăt-la-capăt prin HTTP, cu director frate real
// =============================================================================

let d4Fixture;
let d4Server;
let d4Base;

before(async () => {
  d4Fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'rf01-server-d4-'));
  const publicDir = path.join(d4Fixture, 'public');
  fs.mkdirSync(path.join(publicDir, 'sprites'), { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<html>index</html>');
  fs.writeFileSync(path.join(publicDir, 'sprites', 'pawn.png'), 'fake-binary-content');
  const siblingDir = path.join(d4Fixture, 'public-secret');
  fs.mkdirSync(siblingDir, { recursive: true });
  fs.writeFileSync(path.join(siblingDir, 'leak.txt'), 'SECRET-NU-TREBUIE-SA-APARA-IN-RASPUNS');

  d4Server = await startServer({
    port: 0,
    host: '127.0.0.1',
    publicDir,
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'rf01-server-d4-data-')),
    sessionsDir: fs.mkdtempSync(path.join(os.tmpdir(), 'rf01-server-d4-sessions-')),
    opener: () => {},
    isAlive: () => true,
  });
  d4Base = `http://127.0.0.1:${d4Server.port}`;
});

after(async () => {
  await d4Server.close();
  fs.rmSync(d4Fixture, { recursive: true, force: true });
});

// -----------------------------------------------------------------------------
// D4 (HTTP), proprietatea care contează: secretul NU trebuie să ajungă
// niciodată în client, indiferent de mecanismul care îl oprește. Codul de
// status exact depinde de UNDE e oprită traversarea și diferă legitim între
// variante — de aceea aserțiunea comună e "nu 200" + "conținutul lipsește",
// nu un status fix. Mecanismul fiecărei variante e pinuit separat mai jos.
// -----------------------------------------------------------------------------
for (const [label, urlPath] of [
  ['/../public-secret/leak.txt', '/../public-secret/leak.txt'],
  ['/..%2Fpublic-secret%2Fleak.txt', '/..%2Fpublic-secret%2Fleak.txt'],
  ['/..\\public-secret\\leak.txt (backslash Windows)', '/..\\public-secret\\leak.txt'],
  ['/..%5Cpublic-secret%5Cleak.txt (backslash codat procentual)', '/..%5Cpublic-secret%5Cleak.txt'],
]) {
  test(`D4 (HTTP): GET ${label} -> nu 200, secretul nu apare în răspuns`, async () => {
    const res = await fetch(`${d4Base}${urlPath}`);
    assert.notEqual(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes('SECRET-NU-TREBUIE-SA-APARA-IN-RASPUNS'));
  });
}

// -----------------------------------------------------------------------------
// D4 (HTTP), mecanismele pinuite individual, cu explicația. Dacă vreunul din
// aceste coduri de status se schimbă, mecanismul de dedesubt s-a schimbat —
// merită reexaminat, nu doar actualizat orbește.
// -----------------------------------------------------------------------------

test('D4 (HTTP) mecanism: GET /../public-secret/leak.txt -> 404 (normalizat de new URL, nu ajunge la containment)', async () => {
  // req.url = "/../public-secret/leak.txt" e neîncodat. `new URL(req.url, base)`
  // din server.js normalizează singur segmentele ".." înainte ca pathname-ul
  // să ajungă la resolveStaticPath — rezultă "/public-secret/leak.txt", o
  // cale perfect normală care se rezolvă la public/public-secret/leak.txt.
  // Fișierul acela nu există sub public/, deci 404 e răspunsul onest, nu 403:
  // cererea nu a trecut niciodată prin verificarea de containment.
  const res = await fetch(`${d4Base}/../public-secret/leak.txt`);
  assert.equal(res.status, 404);
  const text = await res.text();
  assert.ok(!text.includes('SECRET-NU-TREBUIE-SA-APARA-IN-RASPUNS'));
});

test('D4 (HTTP) mecanism: GET /..%2Fpublic-secret%2Fleak.txt -> 403 (.. supraviețuiește normalizării, prins de containment)', async () => {
  // %2F nu e normalizat de `new URL()` (rămâne segment de path codat), deci
  // ".." intact ajunge la resolveStaticPath, e decodat acolo, iar
  // verificarea de containment (path.resolve în afara publicDir) îl prinde
  // explicit -> 403.
  const res = await fetch(`${d4Base}/..%2Fpublic-secret%2Fleak.txt`);
  assert.equal(res.status, 403);
  const text = await res.text();
  assert.ok(!text.includes('SECRET-NU-TREBUIE-SA-APARA-IN-RASPUNS'));
});

test('D4 (HTTP) mecanism: GET /..\\public-secret\\leak.txt -> 404 (backslash normalizat la "/" de new URL înainte de ..)', async () => {
  // Pentru scheme "speciale" (http/https/ws/wss/ftp/file), parser-ul WHATWG
  // URL tratează "\" ca separator de cale identic cu "/", ÎNAINTE de a
  // colapsa segmentele "..". Deci "/..\public-secret\leak.txt" ajunge la
  // aceeași normalizare ca varianta cu "/": pathname-ul iese
  // "/public-secret/leak.txt", cerere pentru un fișier inexistent sub
  // public/ -> 404, nu 403 (nu ajunge la containment).
  // Verificat de planner, 15-09-2026: deducția de mai sus s-a confirmat prin
  // rulare (nu doar teorie de spec).
  const res = await fetch(`${d4Base}/..\\public-secret\\leak.txt`);
  assert.equal(res.status, 404);
  const text = await res.text();
  assert.ok(!text.includes('SECRET-NU-TREBUIE-SA-APARA-IN-RASPUNS'));
});

test('D4 (HTTP) mecanism: GET /..%5Cpublic-secret%5Cleak.txt -> 403 (backslash codat procentual, simetric cu %2F, specific Windows)', async () => {
  // Simetric cu %2F: normalizarea WHATWG a lui `new URL()` convertește un
  // backslash BRUT în "/" înainte de a colapsa "..", dar nu atinge "%5C" —
  // acela rămâne un segment de path codat, netrecut prin regula de
  // "backslash = separator", exact ca %2F pentru "/". "..%5C..." ajunge deci
  // intact la resolveStaticPath, unde e decodat -> devine "\" literal.
  // Pe Windows, path.resolve/path.join tratează "\" ca separator de cale
  // (spre deosebire de POSIX, unde "\" e doar un caracter obișnuit de nume
  // de fișier) — deci calea decodată CHIAR iese din publicDir la rezolvare,
  // iar verificarea explicită de containment o prinde -> 403.
  // E vectorul specific Windows: pe un server rulat pe Linux/macOS, aceeași
  // cerere probabil nu ar traversa nimic (backslash-ul decodat ar rămâne
  // parte din numele de fișier, fișier inexistent -> 404). Nu am verificat
  // asta separat, fiindcă mediul de test e Windows (mașina lui Lucian).
  const res = await fetch(`${d4Base}/..%5Cpublic-secret%5Cleak.txt`);
  assert.equal(res.status, 403);
  const text = await res.text();
  assert.ok(!text.includes('SECRET-NU-TREBUIE-SA-APARA-IN-RASPUNS'));
});

test('D4 (HTTP): cale legitimă adâncă din public/ (/sprites/pawn.png) -> 200', async () => {
  const res = await fetch(`${d4Base}/sprites/pawn.png`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.equal(text, 'fake-binary-content');
});

// =============================================================================
// §3.4 — createServer() singur (fără startServer) respinge TOT ce e sub
// /api/, chiar cu Origin/Host corecte, până la listen(). Comportament
// intenționat, pinuit explicit aici (nu e un test "surpriză").
// =============================================================================

test('§3.4 (pinuit): createServer() + listen() manual, FĂRĂ startServer -> /api/agents rămâne 403 (origini neinițializate)', async () => {
  const s = createServer({ sessionsDir, dataDir, opener: () => {}, isAlive: () => true });
  await new Promise((resolve) => s.listen(0, '127.0.0.1', resolve));
  const port = s.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/agents`, {
      headers: { Origin: `http://127.0.0.1:${port}` },
    });
    assert.equal(res.status, 403, 'fără startServer, setul de origini rămâne gol/restrictiv — comportament intenționat, nu bug');
  } finally {
    await new Promise((resolve) => s.close(resolve));
  }
});
