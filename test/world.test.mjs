// Teste pentru world.js (RF-05b): groupProjects/pickAccent, funcții PURE,
// fără bază de date — teste directe pe date sintetice, ca test/hex-layout.test.mjs.
// RF-05c adaugă: profilesByProject/assignSlots (tot funcții pure).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { groupProjects, pickAccent, profilesByProject, assignSlots } = require('../world.js');

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

// =========================================================================
// profilesByProject (RF-05c) — §2.1 din brief
// =========================================================================

function profileWithId(id, last_project) {
  return { id, last_project };
}

// (§2.1.1) profiluri cu last_project null/gol -> excluse.
test('profilesByProject: profiluri cu last_project null sau gol -> excluse din rezultat', () => {
  const result = profilesByProject([
    profileWithId('a', null),
    profileWithId('b', ''),
    profileWithId('c', 'proiect-x'),
  ]);
  assert.equal(result.size, 1);
  assert.deepEqual(result.get('proiect-x'), ['c']);
  assert.ok(!result.has(null));
  assert.ok(!result.has(''));
});

// (§2.1.2) două profiluri din același proiect -> ambele apar, ÎN ORDINEA de intrare (nu resortate).
test('profilesByProject: două profiluri din același proiect -> apar amândouă, în ordinea din profiles', () => {
  const result = profilesByProject([
    profileWithId('zebra', 'proiect-comun'),
    profileWithId('alfa', 'proiect-comun'),
  ]);
  assert.deepEqual(result.get('proiect-comun'), ['zebra', 'alfa'],
    'ordinea trebuie păstrată identică cu profiles de intrare, nu resortată alfabetic');
});

// (§2.1.3) profiluri din proiecte diferite -> grupuri separate, fiecare cu doar id-urile lui.
test('profilesByProject: proiecte diferite -> grupuri separate, fiecare cu propriile id-uri', () => {
  const result = profilesByProject([
    profileWithId('p1', 'proiect-a'),
    profileWithId('p2', 'proiect-b'),
    profileWithId('p3', 'proiect-a'),
  ]);
  assert.equal(result.size, 2);
  assert.deepEqual(result.get('proiect-a'), ['p1', 'p3']);
  assert.deepEqual(result.get('proiect-b'), ['p2']);
});

test('profilesByProject: listă goală -> Map goală, nu aruncă', () => {
  const result = profilesByProject([]);
  assert.ok(result instanceof Map);
  assert.equal(result.size, 0);
});

// =========================================================================
// assignSlots (RF-05c) — §2.2 din brief
// =========================================================================

function distinctSlots(map) {
  const values = Array.from(map.values());
  return new Set(values).size === values.length;
}

// (4) profil nou, fără previous -> primește slotul 0 (cel mai mic liber).
test('assignSlots: profil nou fără previous -> primește slotul 0 dacă capacitatea permite', () => {
  const result = assignSlots(['p1'], new Map(), 10);
  assert.equal(result.get('p1'), 0);
  assert.ok(distinctSlots(result));
});

// (5) mai multe profiluri noi -> sloturi consecutive, în ordinea din profileIds.
test('assignSlots: mai multe profiluri noi -> sloturi consecutive, în ordinea din profileIds', () => {
  const result = assignSlots(['p1', 'p2', 'p3'], new Map(), 10);
  assert.equal(result.get('p1'), 0);
  assert.equal(result.get('p2'), 1);
  assert.equal(result.get('p3'), 2);
  assert.ok(distinctSlots(result));
});

// (6) memorie: profil cu post anterior valid -> îl păstrează EXACT, indiferent
// de restul.
test('assignSlots: profil cu post anterior valid (slotIndex < capacity) -> păstrează EXACT acel slot', () => {
  const previous = new Map([['veteran', 5]]);
  const result = assignSlots(['nou-1', 'veteran', 'nou-2'], previous, 10);
  assert.equal(result.get('veteran'), 5, 'postul vechi trebuie păstrat exact, chiar dacă alte profiluri apar în jur');
  assert.ok(distinctSlots(result));
});

// (7) profil dispărut din profileIds -> nu apare deloc, slotul devine liber
// pentru un profil nou.
test('assignSlots: profil dispărut din profileIds -> nu apare în rezultat, slotul devine disponibil', () => {
  const previous = new Map([['plecat', 0]]);
  const result = assignSlots(['nou'], previous, 10);
  assert.ok(!result.has('plecat'), 'profilul plecat nu mai trebuie să apară deloc');
  assert.equal(result.get('nou'), 0, 'slotul eliberat de cel plecat trebuie să poată fi ocupat de un profil nou');
});

// (8) post vechi peste noua capacitate -> NU păstrat, realocat sau exclus.
test('assignSlots: post anterior >= capacity (zona s-a micșorat) -> NU păstrează slotul invalid, e realocat sub capacity', () => {
  const previous = new Map([['veteran', 9]]);
  const result = assignSlots(['veteran'], previous, 3);
  assert.ok(result.has('veteran'), 'profilul rămâne în profileIds, deci trebuie realocat, nu exclus, cât timp încape sub noua capacitate');
  assert.ok(result.get('veteran') < 3, `slotul realocat trebuie să fie sub capacitatea nouă, a primit ${result.get('veteran')}`);
});

test('assignSlots: post anterior >= capacity ȘI zona nu mai are loc pentru nimeni -> exclus din rezultat, fără excepție', () => {
  const previous = new Map([['veteran', 9]]);
  assert.doesNotThrow(() => {
    const result = assignSlots(['veteran'], previous, 0);
    assert.ok(!result.has('veteran'), 'fără capacitate, profilul nu poate primi niciun slot');
  });
});

// (9) capacitate exactă -> toți primesc slot, niciunul exclus.
test('assignSlots: profileIds.length === capacity -> toți primesc câte un slot, niciunul exclus', () => {
  const ids = ['a', 'b', 'c'];
  const result = assignSlots(ids, new Map(), 3);
  assert.equal(result.size, 3);
  for (const id of ids) assert.ok(result.has(id), `${id} trebuia să primească un slot`);
  assert.ok(distinctSlots(result));
});

// (10) overflow -> exact capacity profiluri primesc slot, fără excepție.
test('assignSlots: profileIds.length > capacity -> exact capacity profiluri primesc slot, restul lipsesc, fără excepție', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  let result;
  assert.doesNotThrow(() => {
    result = assignSlots(ids, new Map(), 2);
  });
  assert.equal(result.size, 2, 'exact capacitatea trebuie ocupată, nu mai mult');
  assert.ok(distinctSlots(result));
});

// (11) capacitate zero -> niciun profil nu primește slot, fără excepție.
test('assignSlots: capacity === 0 -> niciun profil nu primește slot, fără excepție', () => {
  let result;
  assert.doesNotThrow(() => {
    result = assignSlots(['a', 'b'], new Map(), 0);
  });
  assert.equal(result.size, 0);
});

// (12) fără coliziuni — proprietate generală pe un caz mixt (memorie + noi +
// overflow parțial), nu doar cazurile fericite.
test('assignSlots: caz mixt (memorie + profiluri noi + overflow) -> fără coliziuni de slotIndex', () => {
  const previous = new Map([
    ['veteran-1', 2],
    ['veteran-2', 4],
  ]);
  const result = assignSlots(
    ['nou-1', 'veteran-1', 'nou-2', 'veteran-2', 'nou-3', 'nou-4'],
    previous,
    5
  );
  assert.ok(distinctSlots(result), 'niciun slotIndex nu trebuie dat de două ori');
  for (const slotIndex of result.values()) {
    assert.ok(slotIndex < 5, 'niciun slot alocat nu trebuie să depășească capacitatea');
  }
});

test('assignSlots: listă goală de profileIds -> Map goală, nu aruncă', () => {
  const result = assignSlots([], new Map(), 5);
  assert.ok(result instanceof Map);
  assert.equal(result.size, 0);
});
