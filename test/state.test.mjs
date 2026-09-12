// Teste pentru GET/PUT /api/state din state.js + server.js (T-06).
//
// Pornim serverul REAL pe un port dedicat (5392, diferit de 5311 și de 5391
// folosit deja de test/api-open.test.mjs), la fel ca în test/api-open.test.mjs:
// interceptăm temporar `http.createServer` doar cât durează `require('../server.js')`
// ca să obținem un handle către instanța reală, apoi restaurăm imediat originalul.
//
// Izolarea lui data/state.json:
// state.js calculează STATE_FILE cu o cale FIXĂ (`path.join(__dirname, 'data',
// 'state.json')`), fără nicio variabilă de mediu sau parametru de configurare
// a folderului de date — verificat prin citirea codului, nu presupus. Conform
// brief-ului, nu modificăm state.js ca să adăugăm o asemenea opțiune. În loc
// de asta: în `before`, facem backup în memorie al fișierului real (dacă
// există) și îl ștergem, ca testele să pornească de la stare goală garantată;
// în `after`, ștergem orice a scris suita de teste și restaurăm exact bytes-
// cu-bytes backup-ul original (sau lăsăm fișierul șters dacă nu exista
// inițial). Testele din acest fișier rulează secvențial (comportamentul
// implicit al node:test într-un singur fișier, fără `concurrency: true`) și
// depind unele de starea lăsată de precedentele (updatedAt-ul scrierii #1
// devine baseUpdatedAt pentru scrierea #2) — ordinea din fișier contează.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_PORT = 5392; // dedicat acestui fișier de teste, diferit de 5311 și 5391
const BASE_URL = `http://localhost:${TEST_PORT}`;

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

let capturedServer = null;
let backupExisted = false;
let backupBuffer = null;

before(async () => {
  // backup + curățare, ca să pornim de la stare garantat goală
  try {
    backupBuffer = fs.readFileSync(STATE_FILE);
    backupExisted = true;
  } catch (e) {
    backupExisted = false;
  }
  try {
    fs.rmSync(STATE_FILE);
  } catch (e) {
    // fișierul nu exista - ok
  }

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
    const restore = () => {
      try {
        fs.rmSync(STATE_FILE);
      } catch (e) {
        // ok, poate n-a fost scris nimic
      }
      if (backupExisted) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(STATE_FILE, backupBuffer);
      }
      resolve();
    };
    if (capturedServer) capturedServer.close(restore);
    else restore();
  });
});

async function getState() {
  const res = await fetch(`${BASE_URL}/api/state`);
  const json = await res.json();
  return { status: res.status, json };
}

async function putState(body) {
  const isRaw = typeof body === 'string';
  const res = await fetch(`${BASE_URL}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: isRaw ? body : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    // ok pentru cazurile de eroare testate mai jos
  }
  return { status: res.status, json };
}

function readDiskStateRaw() {
  return fs.readFileSync(STATE_FILE, 'utf8');
}

function listTmpFilesOnDisk() {
  let files = [];
  try {
    files = fs.readdirSync(DATA_DIR);
  } catch (e) {
    return [];
  }
  return files.filter((f) => f.endsWith('.tmp'));
}

// --- 1. GET pe stare inexistentă -----------------------------------------------

test('GET /api/state pe stare inexistentă -> 200 stare goală implicită', async () => {
  const { status, json } = await getState();
  assert.equal(status, 200);
  assert.deepEqual(json, { version: 1, archived: [], archivedAt: {}, plots: {}, updatedAt: 0 });
});

// --- 2. Prima scriere, fără baseUpdatedAt --------------------------------------

let firstUpdatedAt = null;

test('PUT /api/state fără baseUpdatedAt -> 200, scrie necondiționat, updatedAt > 0', async () => {
  const { status, json } = await putState({ archived: ['s1'], archivedAt: { s1: 1234567890 } });
  assert.equal(status, 200);
  assert.deepEqual(json.archived, ['s1']);
  assert.deepEqual(json.archivedAt, { s1: 1234567890 });
  assert.ok(json.updatedAt > 0, 'updatedAt ar trebui ștampilat de server, nu 0');
  firstUpdatedAt = json.updatedAt;
});

// --- 3. Fișierul de pe disc e JSON valid, indentat, cu exact câmpurile așteptate --

test('fișierul scris pe disc e JSON valid, indentat cu 2 spații, cu exact câmpurile version/archived/archivedAt/plots/updatedAt', () => {
  const raw = readDiskStateRaw();
  const parsed = JSON.parse(raw); // aruncă dacă nu e JSON valid
  // T-09 a adăugat `plots` (layout de zone) la schema de stare.
  assert.deepEqual(Object.keys(parsed).sort(), ['archived', 'archivedAt', 'plots', 'updatedAt', 'version'].sort());
  assert.equal(parsed.version, 1);
  assert.deepEqual(parsed.archived, ['s1']);
  assert.deepEqual(parsed.archivedAt, { s1: 1234567890 });
  assert.equal(parsed.updatedAt, firstUpdatedAt);
  // verificare indentare reală (nu doar conținut) - JSON.stringify(state, null, 2)
  assert.ok(raw.startsWith('{\n  "version": 1,'), `fișierul nu pare indentat cu 2 spații: ${raw.slice(0, 40)}`);
});

// --- 4. A doua scriere, cu baseUpdatedAt corect --------------------------------

let secondUpdatedAt = null;

test('PUT /api/state cu baseUpdatedAt corect (valoarea din scrierea anterioară) -> 200, se aplică', async () => {
  const { status, json } = await putState({
    archived: ['s1', 's2'],
    archivedAt: { s1: 1234567890, s2: 1111111111 },
    baseUpdatedAt: firstUpdatedAt,
  });
  assert.equal(status, 200);
  assert.deepEqual(json.archived, ['s1', 's2']);
  // `>=`, nu `>` strict: două scrieri succesive pot cădea teoretic în aceeași
  // milisecundă (Date.now()); ce contează cu adevărat e că nu regresează.
  assert.ok(json.updatedAt >= firstUpdatedAt, 'updatedAt nu ar trebui să regreseze între scrieri');
  secondUpdatedAt = json.updatedAt;
});

// --- 5. baseUpdatedAt greșit -> 409, disk neschimbat ----------------------------

test('PUT /api/state cu baseUpdatedAt greșit -> 409, body = starea curentă de pe disc, disk-ul rămâne neschimbat', async () => {
  const beforeRaw = readDiskStateRaw();

  const { status, json } = await putState({
    archived: ['payload-respins-nu-trebuie-sa-ajunga-pe-disc'],
    archivedAt: {},
    baseUpdatedAt: 1, // valoare veche/inventată, sigur diferită de secondUpdatedAt
  });

  assert.equal(status, 409);
  assert.deepEqual(json.archived, ['s1', 's2'], 'corpul răspunsului 409 trebuie să fie starea curentă de pe disc, nu payload-ul respins');
  assert.equal(json.updatedAt, secondUpdatedAt);

  const afterRaw = readDiskStateRaw();
  assert.equal(afterRaw, beforeRaw, 'fișierul de pe disc nu trebuie modificat de o scriere respinsă cu 409');
  assert.ok(
    !afterRaw.includes('payload-respins-nu-trebuie-sa-ajunga-pe-disc'),
    'payload-ul respins nu trebuie să ajungă niciodată pe disc'
  );
});

// --- 6. baseUpdatedAt = 0 tratat ca "lipsă" (scriere necondiționată) ------------
// Comportament observabil al implementării curente (`if (base && ...)`, unde
// `base` fiind 0 e falsy) - documentat explicit ca să nu se schimbe pe tăcute.

test('PUT /api/state cu baseUpdatedAt=0 explicit -> tratat ca lipsă, scrie necondiționat (nu 409)', async () => {
  const { status, json } = await putState({
    archived: ['s1', 's2', 's3'],
    archivedAt: { s1: 1234567890, s2: 1111111111, s3: 42 },
    baseUpdatedAt: 0,
  });
  assert.equal(status, 200);
  assert.deepEqual(json.archived, ['s1', 's2', 's3']);
});

// --- 7. Fără resturi *.tmp pe disc după scrieri reușite -------------------------

test('nu rămân fișiere *.tmp pe disc după scrierile reușite de mai sus', () => {
  const tmpFiles = listTmpFilesOnDisk();
  assert.deepEqual(tmpFiles, [], `fișiere tmp rămase pe disc: ${tmpFiles.join(', ')}`);
});

// --- 8. JSON invalid la PUT -----------------------------------------------------

test('PUT /api/state cu body care nu e JSON valid -> 400, disk neschimbat', async () => {
  const beforeRaw = readDiskStateRaw();
  const { status, json } = await putState('nu e deloc JSON valid {{{');
  assert.equal(status, 400);
  assert.deepEqual(json, { ok: false, error: 'invalid JSON' });
  assert.equal(readDiskStateRaw(), beforeRaw, 'un body invalid nu trebuie să modifice fișierul de pe disc');
});

// --- 9. PUT cu `plots` populat -> GET ulterior îl întoarce identic (T-09) -------

test('PUT /api/state cu plots populat -> se salvează corect, GET ulterior îl întoarce identic', async () => {
  const { json: current } = await getState();
  const plots = { 'proiect-a': [{ x: 0, y: 0 }, { x: 1, y: 0 }], 'proiect-b': [{ x: 2, y: 3 }] };

  const putRes = await putState({
    archived: current.archived,
    archivedAt: current.archivedAt,
    plots,
    baseUpdatedAt: current.updatedAt,
  });
  assert.equal(putRes.status, 200);
  assert.deepEqual(putRes.json.plots, plots, 'răspunsul PUT trebuie să întoarcă plots-ul trimis');

  const { status, json: after } = await getState();
  assert.equal(status, 200);
  assert.deepEqual(after.plots, plots, 'GET ulterior trebuie să întoarcă exact plots-ul salvat anterior');
});

// --- 10. Defaults la citirea unei stări vechi, fără `plots` pe disc (T-09b) -----
// Simulăm un fișier scris înainte de introducerea câmpului `plots`: JSON valid,
// dar fără cheia `plots`. `GET /api/state` trebuie să completeze `plots: {}`,
// nu să-l lase lipsă/undefined, și să păstreze `archived`/`archivedAt` neatinse.

test('GET /api/state pe un fișier vechi fără `plots` pe disc -> completează plots:{} și păstrează archived/archivedAt', async () => {
  const backup = readDiskStateRaw();
  try {
    const oldShape = {
      version: 1,
      archived: ['legacy-agent'],
      archivedAt: { 'legacy-agent': 1700000000 },
      updatedAt: 555,
      // fără `plots` - simulează un state.json scris înainte de T-09
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(oldShape, null, 2));

    const { status, json } = await getState();
    assert.equal(status, 200);
    assert.deepEqual(json.plots, {}, 'plots trebuie completat cu {} când lipsește din fișierul de pe disc, nu undefined');
    assert.deepEqual(json.archived, ['legacy-agent'], 'archived trebuie păstrat neschimbat din fișierul vechi');
    assert.deepEqual(
      json.archivedAt,
      { 'legacy-agent': 1700000000 },
      'archivedAt trebuie păstrat neschimbat din fișierul vechi'
    );
    assert.equal(json.updatedAt, 555, 'updatedAt existent în fișierul vechi nu trebuie suprascris');
  } finally {
    fs.writeFileSync(STATE_FILE, backup);
  }
});

// --- 11. Defaults nu suprascriu un `plots` deja populat pe disc -----------------

test('GET /api/state pe un fișier cu plots deja populat -> îl întoarce exact, nu resetat la {}', async () => {
  const backup = readDiskStateRaw();
  try {
    const shape = {
      version: 1,
      archived: [],
      archivedAt: {},
      plots: { 'proiect-x': [{ x: 2, y: 3 }] },
      updatedAt: 777,
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(shape, null, 2));

    const { status, json } = await getState();
    assert.equal(status, 200);
    assert.deepEqual(
      json.plots,
      { 'proiect-x': [{ x: 2, y: 3 }] },
      'un plots deja populat pe disc nu trebuie resetat la {} de completarea defaults-urilor'
    );
  } finally {
    fs.writeFileSync(STATE_FILE, backup);
  }
});
