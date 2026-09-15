// Teste HTTP pentru GET /api/world (RF-05b), server real pe port efemer —
// tipar ca test/server-profiles.test.mjs/test/server-runs.test.mjs.
// RF-05c extinde acest fișier cu teste pentru câmpul `pawns` (§2.4 din brief).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createServer, startServer } = require('../server.js');

let srv;
let sessionsDir;
let dataDir;
let dbDir;
let dbPath;

before(async () => {
  sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf05b-sessions-'));
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf05b-data-'));
  dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf05b-db-'));
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
  const headers = { ...extraHeaders };
  if (!('Origin' in headers)) headers.Origin = baseUrl();
  if (headers.Origin === null) delete headers.Origin;
  if (hasBody) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl()}${routePath}`, {
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    // ok pentru răspunsuri fără corp JSON (405 etc.)
  }
  return { status: res.status, json };
}

async function createProfileWithProject(name, lastProject) {
  const created = await req('POST', '/api/profiles', { name });
  assert.equal(created.status, 201, `crearea profilului "${name}" trebuia să reușească`);
  const patched = await req('PATCH', `/api/profiles/${created.json.id}`, {
    expectedRevision: 1,
    changes: { last_project: lastProject },
  });
  assert.equal(patched.status, 200, `setarea last_project pentru "${name}" trebuia să reușească`);
  return patched.json;
}

async function observeRun(nativeId, lifecycle) {
  const { status, json } = await req('POST', '/api/runs/observe', {
    sourceHarness: 'pi',
    nativeId,
    lifecycle,
  });
  assert.equal(status, 201, `observeRun ${nativeId} trebuia să reușească`);
  return json;
}

async function associateRun(run, profile) {
  const { status, json } = await req('POST', `/api/runs/${run.id}/associate`, {
    profileId: profile.id,
    expectedRevision: run.revision,
  });
  assert.equal(status, 200, `asocierea run-ului ${run.id} cu profilul ${profile.id} trebuia să reușească`);
  return json;
}

// =========================================================================
// (13) server fără niciun profil -> 200, { zones: [], pawns: [] }
// =========================================================================

test('GET /api/world: fără niciun profil în bază -> 200, { zones: [], pawns: [] }', async () => {
  const { status, json } = await req('GET', '/api/world');
  assert.equal(status, 200);
  assert.deepEqual(json, { zones: [], pawns: [] });
});

// =========================================================================
// (14) profiluri cu last_project populat -> fiecare proiect distinct apare
// o singură dată, cu project/cells/accent.
// =========================================================================

test('GET /api/world: proiecte distincte apar o singură dată fiecare, cu project/cells/accent', async () => {
  await createProfileWithProject('m1', 'zona-unu');
  await createProfileWithProject('m2', 'zona-unu');
  await createProfileWithProject('m3', 'zona-doi');

  const { status, json } = await req('GET', '/api/world');
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.zones));

  const projectIds = json.zones.map((z) => z.project);
  assert.equal(new Set(projectIds).size, projectIds.length, 'niciun proiect nu trebuie să apară de două ori');
  assert.ok(projectIds.includes('zona-unu'));
  assert.ok(projectIds.includes('zona-doi'));

  for (const zone of json.zones) {
    assert.equal(typeof zone.project, 'string');
    assert.ok(Array.isArray(zone.cells) && zone.cells.length > 0, `zona ${zone.project} trebuie să aibă cel puțin o celulă`);
    assert.equal(typeof zone.accent, 'string');
  }
});

// =========================================================================
// (15) persistență reală între cereri: a doua cerere pornește de la layout-ul
// salvat de prima, nu recalculează de la zero.
// =========================================================================

test('GET /api/world: două cereri succesive fără schimbări -> exact aceleași celule pentru fiecare proiect', async () => {
  await createProfileWithProject('persist-a', 'proiect-persistent-1');
  await createProfileWithProject('persist-b', 'proiect-persistent-2');

  const first = await req('GET', '/api/world');
  const second = await req('GET', '/api/world');

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  const cellsById = (zones) => Object.fromEntries(zones.map((z) => [z.project, z.cells]));
  const firstCells = cellsById(first.json.zones);
  const secondCells = cellsById(second.json.zones);

  for (const id of Object.keys(firstCells)) {
    assert.deepEqual(secondCells[id], firstCells[id],
      `celulele proiectului ${id} trebuie să rămână identice între cereri succesive (dovadă de persistență, nu recalculare de la zero)`);
  }
});

// =========================================================================
// (16) adăugarea unui profil nou cu proiect nou, între cereri -> zonele
// deja existente nu se schimbă (dovadă indirectă a memoriei layout-ului).
// =========================================================================

test('GET /api/world: proiect nou adăugat între cereri -> celulele proiectelor deja existente rămân identice', async () => {
  await createProfileWithProject('memorie-a', 'proiect-memorie-1');
  await createProfileWithProject('memorie-b', 'proiect-memorie-2');

  const before = await req('GET', '/api/world');
  const beforeCells = Object.fromEntries(before.json.zones.map((z) => [z.project, z.cells]));

  await createProfileWithProject('memorie-c', 'proiect-memorie-nou');

  const after = await req('GET', '/api/world');
  const afterCells = Object.fromEntries(after.json.zones.map((z) => [z.project, z.cells]));

  assert.deepEqual(afterCells['proiect-memorie-1'], beforeCells['proiect-memorie-1'],
    'proiectul deja existent nu trebuie să-și schimbe celulele din cauza unui proiect nou apărut');
  assert.deepEqual(afterCells['proiect-memorie-2'], beforeCells['proiect-memorie-2'],
    'proiectul deja existent nu trebuie să-și schimbe celulele din cauza unui proiect nou apărut');
  assert.ok(afterCells['proiect-memorie-nou'], 'noul proiect trebuie totuși să apară în zone');
});

// =========================================================================
// (17) metodă greșită -> 405, fără mutație
// =========================================================================

test('POST /api/world -> 405, fără mutație (niciun rând nou creat)', async () => {
  const before = await req('GET', '/api/world');

  const { status } = await req('POST', '/api/world', { project: 'nu-ar-trebui' });
  assert.equal(status, 405);

  const after = await req('GET', '/api/world');
  assert.deepEqual(after.json.zones.map((z) => z.project).sort(), before.json.zones.map((z) => z.project).sort(),
    'un POST respins cu 405 nu trebuie să adauge/scoată vreo zonă');
});

test('DELETE /api/world -> 405', async () => {
  const { status } = await req('DELETE', '/api/world');
  assert.equal(status, 405);
});

// =========================================================================
// (18) validare Origin, simetric cu restul rutelor /api/*
// =========================================================================

test('GET /api/world: fără Origin -> 200 (navigare normală, ca GET /api/agents)', async () => {
  const { status } = await req('GET', '/api/world', undefined, { Origin: null });
  assert.equal(status, 200);
});

test('GET /api/world: Origin prezent dar greșit (alt port) -> 403', async () => {
  const { status } = await req('GET', '/api/world', undefined, {
    Origin: `http://127.0.0.1:${srv.port + 1}`,
  });
  assert.equal(status, 403);
});

// =========================================================================
// RF-05c — câmpul `pawns` (§2.4 din brief)
// =========================================================================

// (19) profil cu last_project populat, fără nicio sesiune -> apare în pawns,
// working: false.
test('GET /api/world: profil cu proiect dar fără run asociat -> apare în pawns cu working: false', async () => {
  const profile = await createProfileWithProject('fara-run', 'proiect-pawns-1');
  const { status, json } = await req('GET', '/api/world');
  assert.equal(status, 200);
  const pawn = json.pawns.find((p) => p.profileId === profile.id);
  assert.ok(pawn, 'profilul trebuia să apară în pawns');
  assert.equal(pawn.working, false);
});

// (20) profil cu run 'running' -> working: true.
test('GET /api/world: profil cu run lifecycle running -> pawn.working === true', async () => {
  const profile = await createProfileWithProject('lucreaza', 'proiect-pawns-2');
  const run = await observeRun('pawn-running', 'running');
  await associateRun(run, profile);

  const { status, json } = await req('GET', '/api/world');
  assert.equal(status, 200);
  const pawn = json.pawns.find((p) => p.profileId === profile.id);
  assert.ok(pawn, 'profilul trebuia să apară în pawns');
  assert.equal(pawn.working, true);
});

// (21) profil cu run 'queued' sau 'paused' -> working: false (NU running).
test('GET /api/world: profil cu run lifecycle queued -> pawn.working === false (nu running)', async () => {
  const profile = await createProfileWithProject('asteapta', 'proiect-pawns-3');
  const run = await observeRun('pawn-queued', 'queued');
  await associateRun(run, profile);

  const { json } = await req('GET', '/api/world');
  const pawn = json.pawns.find((p) => p.profileId === profile.id);
  assert.ok(pawn);
  assert.equal(pawn.working, false, 'lifecycle queued nu trebuie tratat ca working');
});

test('GET /api/world: profil cu run lifecycle paused -> pawn.working === false (nu running)', async () => {
  const profile = await createProfileWithProject('pauzat', 'proiect-pawns-4');
  const run = await observeRun('pawn-paused', 'paused');
  await associateRun(run, profile);

  const { json } = await req('GET', '/api/world');
  const pawn = json.pawns.find((p) => p.profileId === profile.id);
  assert.ok(pawn);
  assert.equal(pawn.working, false, 'lifecycle paused nu trebuie tratat ca working');
});

// (22) fiecare pawn are câmpurile așteptate, cu tipurile/valorile corecte.
test('GET /api/world: fiecare pawn are profileId/name/project/slotIndex/working/sizeFactor corecte', async () => {
  const profile = await createProfileWithProject('complet', 'proiect-pawns-5');
  const { json } = await req('GET', '/api/world');
  const pawn = json.pawns.find((p) => p.profileId === profile.id);
  assert.ok(pawn);
  assert.equal(pawn.profileId, profile.id);
  assert.equal(pawn.name, 'complet');
  assert.equal(pawn.project, 'proiect-pawns-5');
  assert.equal(typeof pawn.slotIndex, 'number');
  assert.equal(typeof pawn.working, 'boolean');
  assert.equal(pawn.sizeFactor, 1, 'sizeFactor trebuie să fie exact 1 în acest lot');
});

// (23) persistență între cereri: același profil păstrează exact același
// slotIndex la a doua cerere, fără schimbări.
test('GET /api/world: două cereri succesive fără schimbări -> același profil păstrează exact același slotIndex', async () => {
  const profile = await createProfileWithProject('memorie-slot', 'proiect-pawns-6');

  const first = await req('GET', '/api/world');
  const second = await req('GET', '/api/world');

  const firstPawn = first.json.pawns.find((p) => p.profileId === profile.id);
  const secondPawn = second.json.pawns.find((p) => p.profileId === profile.id);
  assert.ok(firstPawn && secondPawn);
  assert.equal(secondPawn.slotIndex, firstPawn.slotIndex,
    'slotIndex trebuie să rămână identic între cereri succesive (memorie reală, nu recalculare de la zero)');
});

// (24) profil fără last_project -> NU apare deloc în pawns.
test('GET /api/world: profil fără last_project -> NU apare în pawns', async () => {
  const { json: created } = await req('POST', '/api/profiles', { name: 'fara-proiect' });
  const { json } = await req('GET', '/api/world');
  assert.ok(!json.pawns.some((p) => p.profileId === created.id),
    'un profil fără last_project nu trebuie să aibă niciun post pe hartă');
});

// (25) POST/DELETE pe /api/world -> tot 405, fără mutație pe sloturi.
test('POST /api/world -> 405, fără mutație pe pawns (comportament neschimbat față de RF-05b)', async () => {
  const profile = await createProfileWithProject('post-405', 'proiect-pawns-7');
  const before = await req('GET', '/api/world');
  const beforePawn = before.json.pawns.find((p) => p.profileId === profile.id);

  const { status } = await req('POST', '/api/world', { project: 'nu-ar-trebui' });
  assert.equal(status, 405);

  const after = await req('GET', '/api/world');
  const afterPawn = after.json.pawns.find((p) => p.profileId === profile.id);
  assert.deepEqual(afterPawn, beforePawn, 'un POST respins cu 405 nu trebuie să schimbe vreun pawn existent');
});
