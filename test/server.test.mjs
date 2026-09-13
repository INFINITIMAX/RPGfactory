// Teste pentru POST /api/reveal și POST /api/new-session din server.js (T-18).
//
// Urmează EXACT tiparul din test/api-open.test.mjs / test/state.test.mjs:
// pornim serverul REAL, pe un port dedicat (5393, diferit de 5311, 5391,
// 5392), interceptând temporar `http.createServer` doar cât durează
// `require('../server.js')` ca să obținem un handle către instanța reală,
// apoi restaurăm imediat originalul.
//
// Nu testăm dacă `rundll32 url.dll,FileProtocolHandler` chiar deschide ceva
// (nu e determinist/portabil într-un `node --test`, depinde de mediul
// curent) — testăm DOAR contractul HTTP (status + body), exact ca în
// api-open.test.mjs. `launchTarget()` e fire-and-forget (`child.on('error',
// () => {})`), deci răspunsul HTTP nu depinde de succesul real al `rundll32`.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename_self = fileURLToPath(import.meta.url);
const __dirname_self = path.dirname(__filename_self);

const TEST_PORT = 5393; // dedicat acestui fișier, diferit de 5311/5391/5392
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

  http.createServer = originalCreateServer; // restaurăm imediat

  await readyPromise;
});

after(() => {
  return new Promise((resolve) => {
    if (capturedServer) capturedServer.close(resolve);
    else resolve();
  });
});

async function post(routePath, body) {
  const isRaw = typeof body === 'string';
  const res = await fetch(`${BASE_URL}${routePath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE_URL },
    body: isRaw ? body : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    // unele răspunsuri de eroare ar putea, teoretic, să nu fie JSON valid —
    // testele de mai jos vor eșua oricum la assert.deepEqual/assert.equal.
  }
  return { status: res.status, json };
}

// Folder garantat să existe la orice rulare (folderul test/ însuși, cale
// absolută — vine din import.meta.url, nu presupus).
const VALID_ABS_FOLDER = __dirname_self;
// Cale care există pe disc, dar E FIȘIER, nu director.
const A_FILE_NOT_A_DIR = __filename_self;
// Cale absolută plauzibilă, dar care nu există.
const NONEXISTENT_ABS_FOLDER = path.join(__dirname_self, 'folder-care-sigur-nu-exista-t18');
const RELATIVE_FOLDER = 'relative/path';

for (const routePath of ['/api/reveal', '/api/new-session']) {
  test(`POST ${routePath} cu folder absolut existent (director) -> 200 {ok:true}`, async () => {
    const { status, json } = await post(routePath, { folder: VALID_ABS_FOLDER });
    assert.equal(status, 200);
    assert.deepEqual(json, { ok: true });
  });

  test(`POST ${routePath} cu cale relativă -> 400 {ok:false, error:...}`, async () => {
    const { status, json } = await post(routePath, { folder: RELATIVE_FOLDER });
    assert.equal(status, 400);
    assert.equal(json.ok, false);
    assert.equal(typeof json.error, 'string');
    assert.notEqual(json.error, '');
  });

  test(`POST ${routePath} cu folder absolut inexistent -> 400 {ok:false, error:...}`, async () => {
    const { status, json } = await post(routePath, { folder: NONEXISTENT_ABS_FOLDER });
    assert.equal(status, 400);
    assert.equal(json.ok, false);
    assert.equal(typeof json.error, 'string');
    assert.notEqual(json.error, '');
  });

  test(`POST ${routePath} cu cale absolută existentă dar care e FIȘIER, nu director -> 400`, async () => {
    const { status, json } = await post(routePath, { folder: A_FILE_NOT_A_DIR });
    assert.equal(status, 400);
    assert.equal(json.ok, false);
  });

  test(`POST ${routePath} cu body care nu e JSON valid -> 400 {ok:false, error:'invalid JSON'}`, async () => {
    const { status, json } = await post(routePath, 'nu e deloc JSON valid {{{');
    assert.equal(status, 400);
    assert.deepEqual(json, { ok: false, error: 'invalid JSON' });
  });

  test(`POST ${routePath} cu {} (fără câmpul folder) -> 400`, async () => {
    const { status, json } = await post(routePath, {});
    assert.equal(status, 400);
    assert.equal(json.ok, false);
  });
}

// --- Serverul rămâne funcțional după cereri invalide pe rutele noi ----------

test('serverul rămâne funcțional (GET /api/agents răspunde 200 JSON) după POST-uri invalide pe /api/reveal și /api/new-session', async () => {
  await post('/api/reveal', 'body stricat, nu e json {{{{');
  await post('/api/new-session', 'body stricat, nu e json {{{{');

  const res = await fetch(`${BASE_URL}/api/agents`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body), '/api/agents ar fi trebuit să răspundă tot cu un array JSON, ca înainte');
});

// --- Limitare documentată explicit ------------------------------------------
//
// NU testăm dacă `rundll32 url.dll,FileProtocolHandler` chiar deschide
// Explorer/URL-ul claude://code/new — nu e determinist/portabil într-un
// `node --test` (depinde de mediul Windows curent), și e fire-and-forget în
// cod (`child.on('error', () => {})`). Testele de mai sus confirmă doar
// contractul HTTP: status + body, exact ce spune codul, indiferent dacă
// `rundll32` reușește sau nu.

// =============================================================================
// T-19 — Teste pentru validarea Host/Origin (isLocalRequest din server.js)
// =============================================================================
//
// Folosim tot serverul pornit în `before()` de mai sus (port TEST_PORT/5393).
// `fetch` trimite automat `Host: localhost:5393` (dedus din URL-ul cerut),
// deci partea de `Host` din `isLocalRequest` trece implicit în toate cazurile
// de mai jos în care nu o suprascriem explicit.

// --- H1. GET fără Origin -> trece (comportament neschimbat) -----------------

test('GET /api/agents fără header Origin -> 200 (GET nu necesită Origin)', async () => {
  const res = await fetch(`${BASE_URL}/api/agents`); // fără Content-Type, fără Origin
  assert.equal(res.status, 200);
});

// --- H2. POST cu Origin local valid -> trece gate-ul, ajunge la business logic

test('POST /api/reveal cu Origin local (http://localhost:<port>) -> nu e blocat de 403, ajunge la validarea de business', async () => {
  const { status, json } = await post('/api/reveal', { folder: VALID_ABS_FOLDER });
  assert.equal(status, 200, 'un Origin local valid nu trebuie respins de gate-ul Host/Origin');
  assert.deepEqual(json, { ok: true });
});

// --- H3. POST cu Origin extern -> 403, indiferent de body -------------------

test('POST /api/reveal cu Origin: http://evil.com -> 403 {ok:false,error:"forbidden"}, indiferent de body', async () => {
  const res = await fetch(`${BASE_URL}/api/reveal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://evil.com' },
    body: JSON.stringify({ folder: VALID_ABS_FOLDER }),
  });
  const json = await res.json();
  assert.equal(res.status, 403);
  assert.deepEqual(json, { ok: false, error: 'forbidden' });
});

// --- H4. POST fără header Origin deloc -> 403 -------------------------------

test('POST /api/reveal fără header Origin deloc -> 403 (folosind un body altfel valid)', async () => {
  const res = await fetch(`${BASE_URL}/api/reveal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }, // fără Origin, intenționat
    body: JSON.stringify({ folder: VALID_ABS_FOLDER }),
  });
  const json = await res.json();
  assert.equal(res.status, 403);
  assert.deepEqual(json, { ok: false, error: 'forbidden' });
});

// --- H5. POST cu Origin: "null" (string literal) -> tratat ca fără origin valid -> 403

test(`POST /api/reveal cu Origin: 'null' (string literal, ex. context file://) -> 403`, async () => {
  const res = await fetch(`${BASE_URL}/api/reveal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'null' },
    body: JSON.stringify({ folder: VALID_ABS_FOLDER }),
  });
  const json = await res.json();
  assert.equal(res.status, 403);
  assert.deepEqual(json, { ok: false, error: 'forbidden' });
});

// --- H6. Host neconform (controlat direct cu node:http, nu cu fetch) -------
//
// `fetch`/undici tratează `Host` ca header "forbidden" și îl ignoră/aruncă
// dacă încerci să-l suprascrii din opțiuni — nu pune la dispoziție un mod
// documentat de a-l falsifica. Modulul nativ `http.request`, în schimb,
// permite suprascrierea explicită a header-ului `Host` în obiectul
// `headers`, independent de `host`/`port` folosite pentru conexiunea TCP
// efectivă (verificat prin citirea documentației Node: `http.request` nu
// filtrează `Host` din `headers`). Folosim asta ca să simulăm exact
// scenariul de DNS rebinding descris în brief: conexiune TCP reală către
// 127.0.0.1:<port>, dar header `Host` extern.

function requestWithRawHost({ host, origin }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: TEST_PORT,
        path: '/api/reveal',
        method: 'POST',
        headers: {
          Host: host,
          'Content-Type': 'application/json',
          Origin: origin,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (e) {
            // ok, testul de mai jos verifică oricum statusul
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on('error', reject);
    req.end(JSON.stringify({ folder: VALID_ABS_FOLDER }));
  });
}

test('POST /api/reveal cu Host: evil.com (Origin altfel local) -> 403 (Host neconform blochează, indiferent de Origin)', async () => {
  const { status, json } = await requestWithRawHost({ host: 'evil.com', origin: BASE_URL });
  assert.equal(status, 403);
  assert.deepEqual(json, { ok: false, error: 'forbidden' });
});

test('POST /api/reveal cu Host: 127.0.0.1:<port> corect și Origin local -> nu e blocat de 403 (control: setup-ul cu http.request funcționează și pentru cazul valid)', async () => {
  const { status } = await requestWithRawHost({ host: `127.0.0.1:${TEST_PORT}`, origin: `http://127.0.0.1:${TEST_PORT}` });
  assert.notEqual(status, 403, 'un Host și Origin ambele locale nu trebuie respinse de gate-ul Host/Origin');
});

// --- H7. Servirea fișierelor statice NU trece prin verificarea Host/Origin --

test('GET / (index.html) fără niciun header special -> 200, neafectat de gate-ul Host/Origin (nu începe cu /api/)', async () => {
  const res = await fetch(`${BASE_URL}/`, { headers: { Origin: 'http://evil.com' } });
  assert.equal(res.status, 200, 'servirea fișierelor statice nu trebuie blocată de verificarea Host/Origin, chiar cu un Origin extern');
});

test('GET /style.css fără header Origin -> 200, neafectat de gate-ul Host/Origin', async () => {
  const res = await fetch(`${BASE_URL}/style.css`); // fără Origin deloc
  assert.equal(res.status, 200);
});
