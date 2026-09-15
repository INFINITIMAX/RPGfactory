// Teste pentru layout.js (RF-05b): createLayoutStore, direct, fără HTTP.
//
// Tipar ca test/profiles.test.mjs/test/runs.test.mjs — fiecare test își face
// propriul fișier temporar (schema reală din migrations/003-layout.sql,
// doar citită, niciodată modificată), `now` injectat pentru determinism.
// Zero stare împărtășită între teste.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createLayoutStore } = require('../layout.js');
const { openDatabase } = require('../db.js');

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-'));
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function makeStore(now) {
  return createLayoutStore({ dbPath: ':memory:', now: now || (() => 1000) });
}

// =========================================================================
// §2.1 — layout.js
// =========================================================================

// (1) getLayout() pe bază proaspătă -> Map goală, fără excepție.
test('getLayout(): bază proaspătă, fără migrații rulate încă -> Map goală, nu aruncă', () => {
  const store = makeStore();
  try {
    let layout;
    assert.doesNotThrow(() => {
      layout = store.getLayout();
    });
    assert.ok(layout instanceof Map, 'trebuie să fie un Map');
    assert.equal(layout.size, 0);
  } finally {
    store.close();
  }
});

// (2) saveLayout(map) cu proiecte noi -> getLayout() întoarce EXACT aceleași
// chei/celule, inclusiv ordinea celulelor din array (index 0 = rădăcina).
test('saveLayout() apoi getLayout(): round-trip complet, chei și ordinea celulelor păstrate exact', () => {
  const store = makeStore();
  try {
    const map = new Map([
      ['proiect-a', [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: -1, r: 0 }]],
      ['proiect-b', [{ q: 0, r: 0 }]],
    ]);
    store.saveLayout(map);

    const after = store.getLayout();
    assert.equal(after.size, 2);
    assert.deepEqual(after.get('proiect-a'), [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: -1, r: 0 }],
      'ordinea celulelor contează — index 0 e rădăcina, nu trebuie amestecată');
    assert.deepEqual(after.get('proiect-b'), [{ q: 0, r: 0 }]);
  } finally {
    store.close();
  }
});

// (3) saveLayout() a doua oară fără un proiect -> proiectul dispărut e ȘTERS
// din tabelă, nu doar ignorat la citire.
test('saveLayout(): proiect dispărut din map -> rândul e șters, nu mai apare la getLayout()', () => {
  const store = makeStore();
  try {
    store.saveLayout(new Map([
      ['ramas', [{ q: 0, r: 0 }]],
      ['dispare', [{ q: 0, r: 0 }]],
    ]));
    assert.equal(store.getLayout().size, 2);

    store.saveLayout(new Map([
      ['ramas', [{ q: 0, r: 0 }]],
    ]));

    const after = store.getLayout();
    assert.equal(after.size, 1, 'trebuie să rămână un singur proiect');
    assert.ok(after.has('ramas'));
    assert.ok(!after.has('dispare'), 'proiectul dispărut nu mai trebuie să apară deloc');
  } finally {
    store.close();
  }
});

// (4) saveLayout() de două ori pe același proiect -> revision crește
// (verificat direct din tabelă cu o interogare SQL, getLayout() nu expune
// revision). Pe fișier real, nu :memory: — :memory: e izolat per conexiune,
// iar verificarea trebuie să vadă aceleași date dintr-un handle separat.
test('saveLayout(): revision crește la a doua scriere pe același proiect (verificare SQL directă, fișier real)', () => {
  const dir = tmpDir('rf05b-layout-revision');
  const dbPath = path.join(dir, 'rpgfactory.db');
  const store = createLayoutStore({ dbPath, now: () => 1000 });
  try {
    store.saveLayout(new Map([['p', [{ q: 0, r: 0 }]]]));
    store.saveLayout(new Map([['p', [{ q: 0, r: 0 }, { q: 1, r: 0 }]]]));
  } finally {
    store.close();
  }

  const handle = openDatabase({ path: dbPath });
  try {
    const row = handle.db.prepare('SELECT revision FROM hex_layout WHERE project = ?').get('p');
    assert.ok(row, 'rândul trebuie să existe');
    assert.equal(row.revision, 2, 'a doua scriere pe același proiect trebuie să crească revizia la 2');
  } finally {
    handle.close();
    rmrf(dir);
  }
});

// (5) createLayoutStore(options) singur, fără nicio metodă apelată -> NU
// creează fișierul bazei pe disc (lazy).
test('createLayoutStore(...) singur, fără niciun apel, NU creează fișierul bazei pe disc', () => {
  const dir = tmpDir('rf05b-layout-lazy');
  const dbPath = path.join(dir, 'nu-exista-inca', 'rpgfactory.db');
  const store = createLayoutStore({ dbPath, migrationsDir: undefined });
  try {
    assert.ok(!fs.existsSync(dbPath), 'construcția store-ului nu trebuie să atingă discul');
    assert.ok(!fs.existsSync(path.dirname(dbPath)), 'nici directorul părinte nu trebuie creat înainte de prima operație reală');

    // Prima operație reală chiar deschide baza.
    store.getLayout();
    assert.ok(fs.existsSync(dbPath), 'după prima operație reală, fișierul bazei trebuie să existe');
  } finally {
    store.close();
    rmrf(dir);
  }
});

// (6) close() sigur de apelat chiar dacă nicio metodă n-a fost chemată încă.
test('close(): sigur de apelat pe un store neatins (nicio metodă chemată încă), nu aruncă', () => {
  const store = createLayoutStore({ dbPath: ':memory:' });
  assert.doesNotThrow(() => store.close());
  // și un al doilea close() (idempotent) nu trebuie să arunce
  assert.doesNotThrow(() => store.close());
});
