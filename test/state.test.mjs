// Teste pentru GET/PUT /api/state (server.js + state.js), migrate la noul
// contract RF-01.
//
// ÎNAINTE (T-06): acest fișier pornea serverul REAL prin monkey-patch pe
// `http.createServer`, pe portul fix 5392, și ștergea/restaura
// `data/state.json` REAL din proiect. Amândouă sunt interzise explicit de
// brief-ul RF-01 (periculos pentru datele reale ale utilizatorului).
//
// ACUM: `startServer({ port: 0, dataDir: <temp> })` — port efemer, director
// de date temporar, curățat la final. `data/` real din proiect nu e atins
// niciodată de acest fișier.
//
// Testele directe pe `state.js` (fără HTTP) pentru §3.1/§3.2 din brief sunt
// în test/state-store.test.mjs, ca să nu aglomerăm acest fișier.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { startServer } = require('../server.js');

let srv;
let dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf01-state-http-'));
  srv = await startServer({
    port: 0,
    host: '127.0.0.1',
    dataDir,
    sessionsDir: fs.mkdtempSync(path.join(os.tmpdir(), 'rf01-state-sessions-')),
    opener: () => {},
    isAlive: () => true,
    now: () => 1700000000000, // ceas înghețat — necesar pentru proba D7
  });
});

after(async () => {
  await srv.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function baseUrl() {
  return `http://127.0.0.1:${srv.port}`;
}

async function getState() {
  const res = await fetch(`${baseUrl()}/api/state`);
  const json = await res.json();
  return { status: res.status, json };
}

async function putState(body) {
  const isRaw = typeof body === 'string';
  const res = await fetch(`${baseUrl()}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl() },
    body: isRaw ? body : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    // ok pentru cazurile de eroare de mai jos
  }
  return { status: res.status, json };
}

function stateFilePath() {
  return path.join(dataDir, 'state.json');
}

function readDiskStateRaw() {
  return fs.readFileSync(stateFilePath(), 'utf8');
}

// =============================================================================
// D5 — baseUpdatedAt=0 nu mai ocolește CAS pentru o stare EXISTENTĂ
// =============================================================================

test('GET /api/state pe stare inexistentă -> 200, stare goală implicită', async () => {
  const { status, json } = await getState();
  assert.equal(status, 200);
  assert.deepEqual(json, { version: 1, archived: [], archivedAt: {}, plots: {}, updatedAt: 0 });
});

test('D5a: stare inexistentă (updatedAt=0) + baseUpdatedAt:0 -> 200 (prima scriere legitimă)', async () => {
  const { status, json } = await putState({ baseUpdatedAt: 0, archived: ['prima'], archivedAt: {} });
  assert.equal(status, 200);
  assert.deepEqual(json.archived, ['prima']);
  assert.ok(json.updatedAt > 0);
});

test('D5b: stare EXISTENTĂ cu revizie >0 + baseUpdatedAt:0 -> 409, disk NESCHIMBAT', async () => {
  // continuăm de la starea scrisă de testul anterior (updatedAt > 0 acum)
  const before1 = await getState();
  assert.ok(before1.json.updatedAt > 0, 'testul anterior ar fi trebuit să lase o revizie > 0');

  const beforeRaw = readDiskStateRaw();
  const { status, json } = await putState({
    baseUpdatedAt: 0, // pretinde că nu știe de nicio scriere anterioară
    archived: ['am-sters-tot'],
    archivedAt: {},
  });

  assert.equal(status, 409, 'D5 — baseUpdatedAt:0 pe o stare existentă NU mai trebuie tratat ca "sări peste verificare"');
  assert.deepEqual(json.archived, before1.json.archived, 'body-ul 409 trebuie să fie starea curentă, neschimbată');

  const afterRaw = readDiskStateRaw();
  assert.equal(afterRaw, beforeRaw, 'un 409 nu trebuie să modifice fișierul de pe disc');
  assert.ok(!afterRaw.includes('am-sters-tot'), 'payload-ul respins nu trebuie să ajungă niciodată pe disc');
});

// =============================================================================
// Contract §2.4: baseUpdatedAt e acum OBLIGATORIU (nu mai există "fără
// baseUpdatedAt -> scrie necondiționat", cum era pe cod vechi) — validarea
// D6 respinge orice câmp în afara celor cunoscute / de tip greșit.
// =============================================================================

test('PUT /api/state FĂRĂ baseUpdatedAt -> 400 (respins de validare, nu mai e "scriere necondiționată")', async () => {
  const { json: current } = await getState();
  const beforeRaw = readDiskStateRaw();
  const { status } = await putState({ archived: ['x'] });
  assert.equal(status, 400);
  assert.equal(readDiskStateRaw(), beforeRaw, 'un PUT respins la validare nu trebuie să atingă discul');
});

// =============================================================================
// D6 — schema e validată explicit înainte de orice scriere
// =============================================================================

test('D6: PUT cu `archived` ca obiect (nu array) -> 400, disk neschimbat', async () => {
  const { json: current } = await getState();
  const beforeRaw = readDiskStateRaw();
  const { status } = await putState({ baseUpdatedAt: current.updatedAt, archived: { not: 'an array' } });
  assert.equal(status, 400);
  assert.equal(readDiskStateRaw(), beforeRaw);
});

test('D6: PUT cu `archivedAt` ca string (nu obiect) -> 400, disk neschimbat', async () => {
  const { json: current } = await getState();
  const beforeRaw = readDiskStateRaw();
  const { status } = await putState({ baseUpdatedAt: current.updatedAt, archivedAt: 'nu e obiect' });
  assert.equal(status, 400);
  assert.equal(readDiskStateRaw(), beforeRaw);
});

test('D6: PUT cu câmp necunoscut -> 400, disk neschimbat', async () => {
  const { json: current } = await getState();
  const beforeRaw = readDiskStateRaw();
  const { status } = await putState({ baseUpdatedAt: current.updatedAt, campNecunoscut: 123 });
  assert.equal(status, 400);
  assert.equal(readDiskStateRaw(), beforeRaw);
});

test('D6: PUT cu version:2 -> 400, disk neschimbat', async () => {
  const { json: current } = await getState();
  const beforeRaw = readDiskStateRaw();
  const { status } = await putState({ baseUpdatedAt: current.updatedAt, version: 2 });
  assert.equal(status, 400);
  assert.equal(readDiskStateRaw(), beforeRaw);
});

test('D6: PUT cu version:1 (corect) -> nu e respins la acest pas de validare', async () => {
  const { json: current } = await getState();
  const { status } = await putState({ baseUpdatedAt: current.updatedAt, version: 1, archived: current.archived, archivedAt: current.archivedAt });
  assert.equal(status, 200);
});

test('D6: __proto__ ca cheie DIRECTĂ în archivedAt -> 400, disk neschimbat', async () => {
  const { json: current } = await getState();
  const beforeRaw = readDiskStateRaw();
  // trimitem body-ul brut, ca "__proto__" să ajungă ca proprietate de date
  // reală (JSON.parse pe server nu declanșează comportamentul special de
  // prototip — doar literalul de obiect din JS l-ar declanșa).
  const raw = `{"baseUpdatedAt":${current.updatedAt},"archivedAt":{"__proto__":{"x":1}}}`;
  const { status } = await putState(raw);
  assert.equal(status, 400);
  assert.equal(readDiskStateRaw(), beforeRaw);
});

test('D6: __proto__ IMBRICAT ADÂNC în plots (nu la nivelul 1) -> 400, disk neschimbat', async () => {
  const { json: current } = await getState();
  const beforeRaw = readDiskStateRaw();
  const raw = `{"baseUpdatedAt":${current.updatedAt},"plots":{"a":{"b":{"c":{"__proto__":{"evil":true}}}}}}`;
  const { status } = await putState(raw);
  assert.equal(status, 400, '__proto__ ascuns la adâncime 4 trebuie respins la fel ca la nivelul 1');
  assert.equal(readDiskStateRaw(), beforeRaw);
});

function makeNested(depth) {
  if (depth <= 1) return {};
  return { a: makeNested(depth - 1) };
}

test('D6: plots la adâncime EXACT 8 -> acceptat (200)', async () => {
  const { json: current } = await getState();
  const plots = makeNested(8);
  const { status, json } = await putState({ baseUpdatedAt: current.updatedAt, plots });
  assert.equal(status, 200, `plots la adâncime 8 ar trebui acceptat; eroare: ${json && json.error}`);
});

test('D6: plots la adâncime 9 -> respins (400), disk neschimbat', async () => {
  const { json: current } = await getState();
  const beforeRaw = readDiskStateRaw();
  const plots = makeNested(9);
  const { status } = await putState({ baseUpdatedAt: current.updatedAt, plots });
  assert.equal(status, 400, 'plots la adâncime 9 depășește limita de 8 și trebuie respins');
  assert.equal(readDiskStateRaw(), beforeRaw);
});

test('D6: plots peste 512 KiB serializat -> 400, disk neschimbat', async () => {
  const { json: current } = await getState();
  const beforeRaw = readDiskStateRaw();
  // un singur câmp cu un șir uriaș, sub adâncime/format valide altfel
  const plots = { blob: 'x'.repeat(520 * 1024) };
  const { status } = await putState({ baseUpdatedAt: current.updatedAt, plots });
  assert.equal(status, 400);
  assert.equal(readDiskStateRaw(), beforeRaw);
});

test('D6: plots sub 512 KiB -> acceptat (control pozitiv pentru testul de mai sus)', async () => {
  const { json: current } = await getState();
  const plots = { blob: 'x'.repeat(1024) };
  const { status } = await putState({ baseUpdatedAt: current.updatedAt, plots });
  assert.equal(status, 200);
});

// =============================================================================
// Contract §2.4 — PUT face "full replace", nu merge (pinuit intenționat)
// =============================================================================

test('contract: PUT care omite `archived` îl resetează la [] (full replace, nu merge)', async () => {
  // Precondiție auto-suficientă: nu ne bazăm pe ce a lăsat un test anterior
  // (D6 poate să fi lăsat `archived` deja gol) — populăm explicit noi înșine.
  const { json: seedBase } = await getState();
  const { status: seedStatus, json: seeded } = await putState({
    baseUpdatedAt: seedBase.updatedAt,
    archived: ['va-fi-sters'],
    archivedAt: { 'va-fi-sters': 1 },
  });
  assert.equal(seedStatus, 200);
  assert.ok(seeded.archived.length > 0, 'setup-ul propriu al testului trebuie să lase archived populat');

  const { status, json } = await putState({ baseUpdatedAt: seeded.updatedAt, archivedAt: {} }); // fără `archived`
  assert.equal(status, 200);
  assert.deepEqual(json.archived, [], 'omiterea lui `archived` la PUT trebuie să-l reseteze la [], nu să-l păstreze');

  const { json: afterGet } = await getState();
  assert.deepEqual(afterGet.archived, []);
});

// =============================================================================
// Contract §2.4 — `savedAt` există pe disc, dar NU e folosit la CAS; un PUT
// care îl trimite în body trebuie respins ca „câmp necunoscut”.
// =============================================================================

test('contract: `savedAt` apare în starea salvată, e ISO string', async () => {
  const { json } = await getState();
  assert.equal(typeof json.savedAt, 'string');
  assert.ok(!Number.isNaN(Date.parse(json.savedAt)), 'savedAt trebuie să fie un ISO string valid');
});

test('contract: PUT cu `savedAt` în body -> 400, respins ca "câmp necunoscut"', async () => {
  const { json: current } = await getState();
  const beforeRaw = readDiskStateRaw();
  const { status } = await putState({ baseUpdatedAt: current.updatedAt, savedAt: new Date().toISOString() });
  assert.equal(status, 400);
  assert.equal(readDiskStateRaw(), beforeRaw);
});

// =============================================================================
// Fără resturi *.tmp pe disc după rulare
// =============================================================================

test('nu rămân fișiere *.tmp în dataDir după toate scrierile de mai sus', () => {
  const files = fs.readdirSync(dataDir).filter((f) => f.endsWith('.tmp'));
  assert.deepEqual(files, [], `fișiere tmp rămase pe disc: ${files.join(', ')}`);
});

// =============================================================================
// D11 — o eroare de I/O la scriere produce 500, cererea NU rămâne agățată,
// și scrierile ulterioare, valide, încă funcționează (lanțul cozii intact).
// =============================================================================
//
// Folosim un al doilea server, dedicat acestui scenariu, cu propriul
// dataDir temporar — ca să nu perturbăm starea folosită de testele de mai
// sus. Forțăm eroarea prin monkey-patch TEMPORAR pe `fs.writeFileSync`
// (aceeași instanță de modul `fs` folosită și de state.js, deci vizibilă și
// acolo), restaurat imediat după primul apel eșuat — nu atingem codul de
// producție, doar interceptăm apelul așa cum fac deja celelalte teste din
// proiect cu `http.createServer`.

test('D11: eroare de scriere -> 500 o singură dată, cererea nu atârnă, iar o scriere ulterioară validă tot funcționează', async () => {
  const d11DataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf01-state-d11-'));
  const srv2 = await startServer({
    port: 0,
    host: '127.0.0.1',
    dataDir: d11DataDir,
    sessionsDir: fs.mkdtempSync(path.join(os.tmpdir(), 'rf01-state-d11-sessions-')),
    opener: () => {},
    isAlive: () => true,
    now: () => 42,
  });

  try {
    const url2 = `http://127.0.0.1:${srv2.port}`;
    const realWriteFileSync = fs.writeFileSync;
    let patched = true;
    fs.writeFileSync = (...args) => {
      if (patched) {
        patched = false; // eșuăm o singură dată
        throw Object.assign(new Error('ENOSPC simulat'), { code: 'ENOSPC' });
      }
      return realWriteFileSync(...args);
    };

    let put1;
    try {
      // cursă cu timeout: dacă cererea ar rămâne agățată (promisiunea
      // cozii ruptă), acest test ar expira, nu doar ar eșua pe assert.
      put1 = await Promise.race([
        fetch(`${url2}/api/state`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Origin: url2 },
          body: JSON.stringify({ baseUpdatedAt: 0, archived: ['va-esua'] }),
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT: cererea nu a răspuns în 3s')), 3000)),
      ]);
    } finally {
      fs.writeFileSync = realWriteFileSync; // restaurăm indiferent de rezultat
    }

    assert.equal(put1.status, 500, 'o eroare de scriere pe disc trebuie să producă 500, nu un 200/409 fals');

    // Scriere ulterioară, validă: baseUpdatedAt rămâne 0 pentru că
    // scrierea eșuată nu a modificat nimic pe disc.
    const put2 = await fetch(`${url2}/api/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Origin: url2 },
      body: JSON.stringify({ baseUpdatedAt: 0, archived: ['acum-merge'] }),
    });
    const json2 = await put2.json();
    assert.equal(put2.status, 200, 'lanțul cozii de scriere nu trebuie să rămână rupt după un eșec anterior');
    assert.deepEqual(json2.archived, ['acum-merge']);
  } finally {
    await srv2.close();
    fs.rmSync(d11DataDir, { recursive: true, force: true });
  }
});
