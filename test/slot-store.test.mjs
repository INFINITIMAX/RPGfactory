// Teste pentru slot-store.js (RF-05c): createSlotStore, direct, fără HTTP.
//
// Tipar identic cu test/layout.test.mjs — fiecare test își face propriul
// fișier temporar (schema reală din migrations/004-sloturi.sql, doar citită,
// niciodată modificată), `now` injectat pentru determinism. Zero stare
// împărtășită între teste.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createSlotStore } = require('../slot-store.js');
const { createProfilesStore } = require('../profiles.js');
const { openDatabase } = require('../db.js');

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-'));
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function makeStore(now) {
  return createSlotStore({ dbPath: ':memory:', now: now || (() => 1000) });
}

// `profile_slots.profile_id` are FK REALĂ către `agent_profiles`
// (migrations/004-sloturi.sql), spre deosebire de `hex_layout.project`
// (fără constrângere) — `PRAGMA foreign_keys = ON` din db.js chiar o aplică.
// Ca la `makeSharedStores` din test/runs.test.mjs: profilesStore și
// slotStore trebuie să partajeze ACELAȘI fișier pe disc (nu ':memory:' —
// fiecare ':memory:' e o bază separată, FK-ul nu ar găsi profilul creat de
// celălalt store).
function makeSharedStores(dir, now) {
  const dbPath = path.join(dir, 'shared.db');
  const profiles = createProfilesStore({ dbPath, now: now || (() => 1000) });
  const slots = createSlotStore({ dbPath, now: now || (() => 1000) });
  return { profiles, slots };
}

// =========================================================================
// §2.3 — slot-store.js
// =========================================================================

// (13) getSlots() pe bază proaspătă -> Map goală, fără excepție.
test('getSlots(): bază proaspătă -> Map goală, nu aruncă', () => {
  const store = makeStore();
  try {
    let slots;
    assert.doesNotThrow(() => {
      slots = store.getSlots();
    });
    assert.ok(slots instanceof Map, 'trebuie să fie un Map');
    assert.equal(slots.size, 0);
  } finally {
    store.close();
  }
});

// (14) saveSlots(project, assignment) apoi getSlots() -> round-trip complet
// pentru acel proiect (chei/valori exacte).
test('saveSlots() apoi getSlots(): round-trip complet, chei și valori exacte pentru proiect', () => {
  const dir = tmpDir('rf05c-slots-14');
  const { profiles, slots: store } = makeSharedStores(dir);
  try {
    const profilA = profiles.createProfile({ name: 'Profil A' }).id;
    const profilB = profiles.createProfile({ name: 'Profil B' }).id;

    const assignment = new Map([
      [profilA, 0],
      [profilB, 3],
    ]);
    store.saveSlots('proiect-x', assignment);

    const after = store.getSlots();
    assert.equal(after.size, 1);
    assert.ok(after.has('proiect-x'));
    assert.deepEqual(
      Object.fromEntries(after.get('proiect-x')),
      { [profilA]: 0, [profilB]: 3 }
    );
  } finally {
    store.close();
    profiles.close();
    rmrf(dir);
  }
});

// (15) saveSlots pentru un proiect cu profiluri dispărute din assignment ->
// rândurile lor sunt șterse, nu doar ignorate.
test('saveSlots(): profil dispărut din assignment (comparativ cu scrierea anterioară) -> rândul e șters', () => {
  const dir = tmpDir('rf05c-slots-15');
  const { profiles, slots: store } = makeSharedStores(dir);
  try {
    const ramas = profiles.createProfile({ name: 'Rămas' }).id;
    const dispare = profiles.createProfile({ name: 'Dispare' }).id;

    store.saveSlots('proiect-y', new Map([
      [ramas, 0],
      [dispare, 1],
    ]));
    assert.equal(store.getSlots().get('proiect-y').size, 2);

    store.saveSlots('proiect-y', new Map([
      [ramas, 0],
    ]));

    const after = store.getSlots().get('proiect-y');
    assert.equal(after.size, 1, 'trebuie să rămână un singur profil');
    assert.ok(after.has(ramas));
    assert.ok(!after.has(dispare), 'profilul dispărut nu mai trebuie să apară deloc');
  } finally {
    store.close();
    profiles.close();
    rmrf(dir);
  }
});

// (16) saveSlots pe un proiect NU trebuie să atingă rândurile altor proiecte.
test('saveSlots(): scrierea pe proiectul A nu modifică datele proiectului B', () => {
  const dir = tmpDir('rf05c-slots-16');
  const { profiles, slots: store } = makeSharedStores(dir);
  try {
    const x = profiles.createProfile({ name: 'X' }).id;
    const y = profiles.createProfile({ name: 'Y' }).id;
    const z = profiles.createProfile({ name: 'Z' }).id;

    store.saveSlots('proiect-a', new Map([[x, 0]]));
    store.saveSlots('proiect-b', new Map([[y, 0]]));

    // A doua scriere pe proiectul A, cu alt conținut.
    store.saveSlots('proiect-a', new Map([[x, 1], [z, 2]]));

    const after = store.getSlots();
    assert.deepEqual(
      Object.fromEntries(after.get('proiect-b')),
      { [y]: 0 },
      'proiectul B nu trebuie atins de scrierile pe proiectul A'
    );
    assert.deepEqual(
      Object.fromEntries(after.get('proiect-a')),
      { [x]: 1, [z]: 2 }
    );
  } finally {
    store.close();
    profiles.close();
    rmrf(dir);
  }
});

// (17) saveSlots(project, new Map()) -> șterge toate rândurile acelui
// proiect, fără eroare.
test('saveSlots(project, new Map()): assignment complet gol -> șterge toate rândurile proiectului, fără eroare', () => {
  const dir = tmpDir('rf05c-slots-17');
  const { profiles, slots: store } = makeSharedStores(dir);
  try {
    const a = profiles.createProfile({ name: 'A' }).id;
    const b = profiles.createProfile({ name: 'B' }).id;

    store.saveSlots('proiect-z', new Map([[a, 0], [b, 1]]));
    assert.equal(store.getSlots().get('proiect-z').size, 2);

    assert.doesNotThrow(() => {
      store.saveSlots('proiect-z', new Map());
    });

    const after = store.getSlots();
    assert.ok(!after.has('proiect-z') || after.get('proiect-z').size === 0,
      'proiectul golit nu mai trebuie să aibă rânduri');
  } finally {
    store.close();
    profiles.close();
    rmrf(dir);
  }
});

// (18) createSlotStore(options) singur, fără nicio metodă apelată -> NU
// creează fișierul bazei pe disc (lazy).
test('createSlotStore(...) singur, fără niciun apel, NU creează fișierul bazei pe disc', () => {
  const dir = tmpDir('rf05c-slots-lazy');
  const dbPath = path.join(dir, 'nu-exista-inca', 'rpgfactory.db');
  const store = createSlotStore({ dbPath, migrationsDir: undefined });
  try {
    assert.ok(!fs.existsSync(dbPath), 'construcția store-ului nu trebuie să atingă discul');
    assert.ok(!fs.existsSync(path.dirname(dbPath)), 'nici directorul părinte nu trebuie creat înainte de prima operație reală');

    // Prima operație reală chiar deschide baza.
    store.getSlots();
    assert.ok(fs.existsSync(dbPath), 'după prima operație reală, fișierul bazei trebuie să existe');
  } finally {
    store.close();
    rmrf(dir);
  }
});

// close() sigur de apelat chiar dacă nicio metodă n-a fost chemată încă
// (aceeași regulă ca layout.js).
test('close(): sigur de apelat pe un store neatins, nu aruncă, idempotent', () => {
  const store = createSlotStore({ dbPath: ':memory:' });
  assert.doesNotThrow(() => store.close());
  assert.doesNotThrow(() => store.close());
});

// Verificare suplimentară: revision crește la a doua scriere pe același
// profil (pe fișier real, ca la layout.js — :memory: e izolat per conexiune).
test('saveSlots(): revision crește la a doua scriere pe același profil (verificare SQL directă, fișier real)', () => {
  const dir = tmpDir('rf05c-slots-revision');
  const dbPath = path.join(dir, 'rpgfactory.db');
  const profiles = createProfilesStore({ dbPath, now: () => 1000 });
  const store = createSlotStore({ dbPath, now: () => 1000 });
  let profilId;
  try {
    profilId = profiles.createProfile({ name: 'P' }).id;
    store.saveSlots('proiect-rev', new Map([[profilId, 0]]));
    store.saveSlots('proiect-rev', new Map([[profilId, 1]]));
  } finally {
    store.close();
    profiles.close();
  }

  const handle = openDatabase({ path: dbPath });
  try {
    const row = handle.db.prepare('SELECT revision, slot_index FROM profile_slots WHERE profile_id = ?').get(profilId);
    assert.ok(row, 'rândul trebuie să existe');
    assert.equal(row.revision, 2, 'a doua scriere pe același profil trebuie să crească revizia la 2');
    assert.equal(row.slot_index, 1, 'valoarea nouă trebuie salvată efectiv');
  } finally {
    handle.close();
    rmrf(dir);
  }
});
