// Teste pentru world.js (RF-05b): groupProjects/pickAccent, funcții PURE,
// fără bază de date — teste directe pe date sintetice, ca test/hex-layout.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { groupProjects, pickAccent } = require('../world.js');

function profile(last_project) {
  return { last_project };
}

// =========================================================================
// groupProjects
// =========================================================================

// (7) profiluri cu last_project = null -> excluse.
test('groupProjects: profiluri cu last_project null -> excluse din rezultat', () => {
  const result = groupProjects([profile(null), profile('proiect-x'), profile(null)]);
  assert.deepEqual(result, [{ id: 'proiect-x', size: 1 }]);
});

// (8) profiluri cu last_project = '' (string gol) -> excluse la fel ca null.
test('groupProjects: profiluri cu last_project string gol (\'\') -> excluse la fel ca null', () => {
  const result = groupProjects([profile(''), profile('proiect-y')]);
  assert.deepEqual(result, [{ id: 'proiect-y', size: 1 }],
    'un last_project gol nu trebuie să producă un proiect fantomă cu id gol în zone');
});

// (9) două proiecte cu același număr de profiluri -> ordonate alfabetic după id.
test('groupProjects: egalitate de mărime -> ordonate alfabetic după id (determinist)', () => {
  const result = groupProjects([profile('zebra'), profile('alfa')]);
  assert.deepEqual(result, [
    { id: 'alfa', size: 1 },
    { id: 'zebra', size: 1 },
  ]);
});

// (10) proiect cu mai multe profiluri decât altul -> apare primul.
test('groupProjects: proiect cu mai multe profiluri -> apare primul (mărime descrescătoare)', () => {
  const result = groupProjects([
    profile('mic'),
    profile('mare'), profile('mare'), profile('mare'),
  ]);
  assert.deepEqual(result, [
    { id: 'mare', size: 3 },
    { id: 'mic', size: 1 },
  ]);
});

test('groupProjects: listă goală de profiluri -> array gol, nu aruncă', () => {
  assert.deepEqual(groupProjects([]), []);
});

// =========================================================================
// pickAccent
// =========================================================================

// (11) același project -> aceeași culoare, la apeluri repetate.
test('pickAccent: același project la apeluri repetate -> aceeași culoare de fiecare dată', () => {
  const first = pickAccent('proiect-stabil');
  for (let i = 0; i < 20; i++) {
    assert.equal(pickAccent('proiect-stabil'), first, `apelul ${i} trebuia să întoarcă aceeași culoare`);
  }
});

// (12) valoarea întoarsă e mereu un șir hex CSS valid din paleta internă.
test('pickAccent: valoarea întoarsă respectă mereu formatul unei culori CSS hex (#rrggbb)', () => {
  const ids = Array.from({ length: 50 }, (_, i) => `proiect-${i}`);
  for (const id of ids) {
    const accent = pickAccent(id);
    assert.match(accent, /^#[0-9a-f]{6}$/i, `culoarea pentru ${id} trebuie să fie hex CSS valid, a primit ${accent}`);
  }
});

test('pickAccent: proiecte diferite pot primi culori diferite (nu întoarce mereu aceeași valoare constantă)', () => {
  const ids = Array.from({ length: 30 }, (_, i) => `distinct-${i}`);
  const distinctColors = new Set(ids.map(pickAccent));
  assert.ok(distinctColors.size > 1, 'paleta trebuie să aibă mai mult de o culoare distinctă folosită pe un eșantion mare');
});
