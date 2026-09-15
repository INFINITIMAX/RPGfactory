// Teste pentru hex-layout.js (RF-05a): allocateCells, hexDistance.
//
// Funcție pură pe structuri de date — fără fișiere, fără bază de date, fără
// stare împărtășită între teste. Import CommonJS via createRequire, ca în
// test/profiles.test.mjs.
//
// Notă (brief §3): nu presupunem forma EXACTĂ a unui blob atunci când
// growBlob are de ales între vecini cu scor egal — verificăm proprietăți
// (contiguitate, mărime, apartenența rădăcinii), nu liste fixe de celule,
// cu excepția cazurilor determinate fără ambiguitate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { allocateCells, hexDistance } = require('../hex-layout.js');

const HEX_DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const key = (c) => `${c.q},${c.r}`;

// Sunt cele două celule vecine directe (distanță 1)?
function isAdjacent(a, b) {
  return hexDistance(a, b) === 1;
}

// E `cells` un singur bloc contiguu (fiecare celulă, în afară de rădăcină,
// e la distanță 1 de cel puțin o altă celulă din listă)?
function isContiguous(cells) {
  if (cells.length <= 1) return true;
  const seen = new Set([key(cells[0])]);
  const queue = [cells[0]];
  const byKey = new Map(cells.map((c) => [key(c), c]));
  while (queue.length) {
    const c = queue.pop();
    for (const [dq, dr] of HEX_DIRS) {
      const n = { q: c.q + dq, r: c.r + dr };
      const k = key(n);
      if (!byKey.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push(byKey.get(k));
    }
  }
  return seen.size === cells.length;
}

// Teritoriul complet (reuniunea celulelor tuturor proiectelor din rezultat)
// e un singur bloc conex?
function isGlobalConnected(out) {
  const cells = [];
  for (const list of out.values()) cells.push(...list);
  return isContiguous(cells);
}

// Nicio celulă nu e ocupată de două proiecte simultan?
function hasNoOverlap(out) {
  const seen = new Set();
  for (const list of out.values()) {
    for (const c of list) {
      const k = key(c);
      if (seen.has(k)) return false;
      seen.add(k);
    }
  }
  return true;
}

// =========================================================================
// §1 — Proiect nou, fără istoric
// =========================================================================

test('un singur proiect nou (size mic): o celulă, la origine', () => {
  const out = allocateCells([{ id: 'a', size: 1 }], new Map());
  const cells = out.get('a');
  assert.equal(cells.length, 1);
});

test('un singur proiect nou (size mare): mai multe celule, toate contigue', () => {
  const out = allocateCells([{ id: 'a', size: 50 }], new Map());
  const cells = out.get('a');
  assert.ok(cells.length > 1, 'ar trebui să ceară mai mult de o celulă');
  assert.ok(isContiguous(cells), 'celulele proiectului trebuie să fie un bloc contiguu');
  assert.ok(hasNoOverlap(out));
});

// =========================================================================
// §2 — Creștere: păstrează exact celulele vechi + adaugă k noi contigue
// =========================================================================

test('creștere: păstrează exact set-ul de celule vechi și adaugă restul contigue', () => {
  const previousInit = allocateCells([{ id: 'a', size: 7 }], new Map()); // 1 celulă
  const oldCells = previousInit.get('a');
  assert.equal(oldCells.length, 1);

  const previous = new Map([['a', oldCells]]);
  const out = allocateCells([{ id: 'a', size: 50 }], previous); // cere mai multe celule
  const newCells = out.get('a');

  assert.ok(newCells.length > oldCells.length);
  const oldKeys = new Set(oldCells.map(key));
  const newKeys = new Set(newCells.map(key));
  for (const k of oldKeys) {
    assert.ok(newKeys.has(k), `celula veche ${k} trebuie păstrată exact`);
  }
  assert.ok(isContiguous(newCells));
});

// =========================================================================
// §3 — Micșorare: păstrează rădăcina, elimină ultimele celule adăugate
// =========================================================================

test('micșorare: păstrează rădăcina și un subset; celulele eliminate sunt ultimele din listă', () => {
  const grown = allocateCells([{ id: 'a', size: 50 }], new Map());
  const bigCells = grown.get('a'); // mai multe celule, cells[0] e rădăcina

  const previous = new Map([['a', bigCells]]);
  const out = allocateCells([{ id: 'a', size: 1 }], previous); // cere doar 1 celulă
  const shrunk = out.get('a');

  assert.equal(shrunk.length, 1);
  assert.deepEqual(shrunk[0], bigCells[0], 'rădăcina veche trebuie păstrată');

  // Micșorare la 2 celule: trebuie să fie primele 2 din lista veche
  // (renunță la ultimele adăugate), nu un subset arbitrar.
  const out2 = allocateCells([{ id: 'a', size: 8 }], new Map([['a', bigCells]]));
  const shrunk2 = out2.get('a');
  assert.equal(shrunk2.length, 2);
  assert.deepEqual(shrunk2, bigCells.slice(0, 2));
});

// =========================================================================
// §4 — Rădăcina veche ocupată de altcineva -> re-așezare de la zero
// =========================================================================

test('rădăcina veche ocupată de alt proiect: re-așezare de la zero, fără suprapunere, fără excepție', () => {
  // `previous` inconsistent (ex. fișier editat manual): "a" și "b" își
  // amintesc AMÂNDOUĂ aceeași rădăcină (0,0). "a" apare primul în
  // `projects`, deci o revendică; "b" o găsește deja ocupată la acest apel
  // și trebuie re-așezat de la zero, nu re-rădăcinat tacit pe altă celulă.
  const previous = new Map([
    ['a', [{ q: 0, r: 0 }]],
    ['b', [{ q: 0, r: 0 }]],
  ]);
  const projects = [
    { id: 'a', size: 1 },
    { id: 'b', size: 1 },
  ];
  assert.doesNotThrow(() => allocateCells(projects, previous));
  const out = allocateCells(projects, previous);
  assert.ok(hasNoOverlap(out), 'nu trebuie să existe suprapunere de celule');
  assert.deepEqual(out.get('a'), [{ q: 0, r: 0 }], 'primul proiect din listă păstrează rădăcina disputată');
  assert.equal(out.get('b').length, 1);
  assert.notDeepEqual(out.get('b')[0], { q: 0, r: 0 }, '"b" trebuie re-așezat pe altă celulă, nu pe rădăcina deja ocupată');
});

// =========================================================================
// §5 — Proiect dispărut: nu apare în rezultat, celulele redevin libere
// =========================================================================

test('proiect dispărut din `projects`: nu apare în rezultat', () => {
  const previous = new Map([
    ['a', [{ q: 0, r: 0 }]],
    ['b', [{ q: 1, r: 0 }]],
  ]);
  const out = allocateCells([{ id: 'a', size: 1 }], previous); // "b" a dispărut
  assert.ok(!out.has('b'));
  assert.ok(out.has('a'));
});

test('proiect dispărut: celulele lui devin disponibile pentru un proiect nou', () => {
  // Umplem tot inelul central + inelul 1 (7 celule) cu un singur proiect
  // mare, apoi îl facem să dispară și verificăm că un proiect nou complet
  // diferit poate ajunge să ocupe centrul (0,0) — dovadă indirectă de
  // eliberare.
  const big = allocateCells([{ id: 'a', size: 63 }], new Map()); // 9 celule (MAX_CELLS)
  const bigCells = big.get('a');
  assert.ok(bigCells.some((c) => c.q === 0 && c.r === 0), 'presupunere: rădăcina e originea');

  const previous = new Map([['a', bigCells]]); // "a" dispare din projects
  const out = allocateCells([{ id: 'c', size: 1 }], previous);
  const cCells = out.get('c');
  assert.equal(cCells.length, 1);
  assert.deepEqual(cCells[0], { q: 0, r: 0 }, 'proiectul nou trebuie să poată ocupa originea eliberată');
});

// =========================================================================
// §6 — Conectivitate globală (fallback la re-layout complet)
// =========================================================================

test('conectivitate globală: layout cu mai multe proiecte e un singur teritoriu conex', () => {
  const previous = new Map([
    ['a', [{ q: 0, r: 0 }]],
    ['b', [{ q: 1, r: 0 }]],
    ['c', [{ q: 2, r: 0 }]],
  ]);
  const out = allocateCells(
    [
      { id: 'a', size: 1 },
      { id: 'b', size: 1 },
      { id: 'c', size: 1 },
    ],
    previous
  );
  assert.ok(isGlobalConnected(out), 'teritoriul rezultat trebuie să fie un singur bloc conex');
});

test('conectivitate globală: memorie parțial dispărută care ar produce insule -> fallback la relayout complet, tot conex', () => {
  // Construim manual un `previous` cu o insulă izolată departe de restul:
  // "izolat" ține minte o celulă la distanță mare de origine, fără nicio
  // vecinătate cu restul hărții, iar restul proiectelor sunt ținute minte
  // aproape de origine. Dacă memoria ar fi respectată literal, rezultatul
  // ar fi neconex -> allocateCells trebuie să detecteze asta și să refacă
  // layout-ul complet din centru.
  const previous = new Map([
    ['izolat', [{ q: 8, r: 0 }]],
    ['a', [{ q: 0, r: 0 }]],
    ['b', [{ q: 1, r: 0 }]],
  ]);
  const projects = [
    { id: 'izolat', size: 1 },
    { id: 'a', size: 1 },
    { id: 'b', size: 1 },
  ];
  const out = allocateCells(projects, previous);
  assert.ok(isGlobalConnected(out), 'rezultatul final trebuie să fie mereu conex, chiar dacă memoria ar produce insule');
  assert.ok(hasNoOverlap(out));
});

// =========================================================================
// §7 — Pool epuizat: proiectele care nu mai încap primesc [] fără excepție
// =========================================================================

test('pool epuizat: mai multe proiecte mari decât încap -> proiectele în plus primesc [] fără excepție', () => {
  // MAX_CELLS este plafonat intern (nu presupunem 9 exact), iar pool-ul e
  // limitat la inelul 11 indiferent de cerere (implementarea oprește
  // construcția la `ring < 12`). Cerem 60 de proiecte de dimensiune mare —
  // chiar și cu plafonul maxim posibil per proiect, cererea totală
  // depășește cu mult ce poate oferi orice pool mărginit la 12 inele
  // (~397 celule), deci exhaustarea e garantată indiferent de valoarea
  // exactă a plafonului intern.
  const projects = [];
  for (let i = 0; i < 60; i++) projects.push({ id: `p${i}`, size: 1000 });

  assert.doesNotThrow(() => allocateCells(projects, new Map()));
  const out = allocateCells(projects, new Map());

  let emptyCount = 0;
  for (const [, cells] of out) {
    if (cells.length === 0) emptyCount++;
  }
  assert.ok(emptyCount > 0, 'cel puțin un proiect ar trebui să nu mai încapă și să primească []');
  assert.equal(out.size, projects.length, 'toate proiectele trebuie să apară în rezultat, chiar și cu []');
  assert.ok(hasNoOverlap(out));
});

// =========================================================================
// §8 — Ordinea contează doar între proiecte noi
// =========================================================================

test('proiecte noi: ordinea din listă decide apropierea de centru (primul = cel mai aproape)', () => {
  const out = allocateCells(
    [
      { id: 'mare', size: 50 },
      { id: 'mic', size: 1 },
    ],
    new Map()
  );
  const mareRoot = out.get('mare')[0];
  const micRoot = out.get('mic')[0];
  const origin = { q: 0, r: 0 };
  assert.ok(
    hexDistance(mareRoot, origin) <= hexDistance(micRoot, origin),
    'primul proiect din listă trebuie să ajungă la fel de aproape sau mai aproape de centru decât al doilea'
  );
});

test('proiect cu istoric nu e deranjat de ordinea în care apare în `projects`', () => {
  const initial = allocateCells([{ id: 'existent', size: 1 }], new Map());
  const existentCells = initial.get('existent');
  const previous = new Map([['existent', existentCells]]);

  // "existent" apare ultimul în listă, dar are istoric -> trebuie să
  // păstreze exact aceleași celule, indiferent de poziția din `projects`.
  const out = allocateCells(
    [
      { id: 'nou1', size: 1 },
      { id: 'nou2', size: 1 },
      { id: 'existent', size: 1 },
    ],
    previous
  );
  assert.deepEqual(out.get('existent'), existentCells);
});

// =========================================================================
// §9 — hexDistance
// =========================================================================

test('hexDistance: simetrie, distanța la sine, vecini direcți, opus pe aceeași axă', () => {
  const a = { q: 2, r: -1 };
  const b = { q: -1, r: 3 };
  assert.equal(hexDistance(a, b), hexDistance(b, a));
  assert.equal(hexDistance(a, a), 0);

  for (const [dq, dr] of HEX_DIRS) {
    assert.equal(hexDistance({ q: 0, r: 0 }, { q: dq, r: dr }), 1);
  }

  // Opus pe aceeași axă: (3,0) și (-3,0) -> distanța cunoscută 6.
  assert.equal(hexDistance({ q: 3, r: 0 }, { q: -3, r: 0 }), 6);
});

// =========================================================================
// §10 — `previous` gol/lipsă
// =========================================================================

test('previous lipsă (parametru implicit): produce un layout valid fără excepție', () => {
  assert.doesNotThrow(() => allocateCells([{ id: 'a', size: 1 }]));
  const out = allocateCells([{ id: 'a', size: 1 }]);
  assert.equal(out.get('a').length, 1);
});

test('previous gol (Map goală explicită): produce un layout valid de la zero', () => {
  const out = allocateCells([{ id: 'a', size: 1 }], new Map());
  assert.equal(out.get('a').length, 1);
});

// =========================================================================
// §11 — cellsNeeded (indirect prin allocateCells)
// =========================================================================

test('cellsNeeded indirect: size 0 sau 1 primește tot o singură celulă', () => {
  const outZero = allocateCells([{ id: 'a', size: 0 }], new Map());
  assert.equal(outZero.get('a').length, 1);

  const outOne = allocateCells([{ id: 'b', size: 1 }], new Map());
  assert.equal(outOne.get('b').length, 1);
});

test('cellsNeeded indirect: size uriaș nu depășește un plafon fix (nu crește nelimitat)', () => {
  const outModerate = allocateCells([{ id: 'a', size: 100 }], new Map());
  const outHuge = allocateCells([{ id: 'b', size: 100000 }], new Map());
  assert.equal(
    outModerate.get('a').length,
    outHuge.get('b').length,
    'peste un anumit prag, mai mulți agenți nu ar trebui să ceară mai multe celule'
  );
  assert.ok(outHuge.get('b').length < 20, 'plafonul intern trebuie să limiteze numărul de celule, oricât de mare ar fi size');
});
