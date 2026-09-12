// Teste pentru public/zones.js (T-08) — alocarea zonelor per proiect pe
// grila pătrată.
//
// zones.js e script clasic (fără `export`/`module.exports`), la fel ca
// public/merge-state.js. Îl încărcăm cu `node:vm` (același tipar ca
// test/merge-state.test.mjs).
//
// Notă despre expunere: `allocateCells`, `layOut`, `isConnected`,
// `growBlob`, `ring`, `manhattanDistance` sunt `function` declarate la
// nivelul scriptului -> devin proprietăți ale obiectului contextificat.
// `cellsNeeded`, `key`, `ORIGIN`, `DIRS`, `SLOTS_PER_CELL`, `MAX_CELLS`
// sunt declarate cu `const` -> NU devin proprietăți ale contextului (legare
// lexicală, nu globală). Le luăm separat cu un al doilea
// `vm.runInContext('cellsNeeded', ctx)`, care funcționează pentru că
// legăturile lexicale de nivel de script persistă în același obiect
// contextificat între apeluri succesive de `runInContext`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZONES_JS_PATH = path.join(__dirname, '..', 'public', 'zones.js');
const ZONES_SOURCE = fs.readFileSync(ZONES_JS_PATH, 'utf8');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(ZONES_SOURCE, ctx);

const cellsNeeded = vm.runInContext('cellsNeeded', ctx);
const { allocateCells, layOut, isConnected } = ctx;

// Aducem rezultatele (Map cu obiecte din realm-ul vm) înapoi ca date simple
// din realm-ul gazdă, pentru assert.deepEqual (același motiv ca în
// merge-state.test.mjs: deepEqual nestrict poate respinge obiecte cu
// prototip diferit).
function mapToObj(map) {
  const obj = {};
  for (const [id, cells] of map) obj[id] = JSON.parse(JSON.stringify(cells));
  return obj;
}

function keysOf(cells) {
  return new Set(cells.map((c) => `${c.x},${c.y}`));
}

// --- cellsNeeded ---------------------------------------------------------

test('cellsNeeded: 0 agenți -> minim 1 celulă (Math.max(1, ...))', () => {
  assert.equal(cellsNeeded(0), 1);
});

test('cellsNeeded: 1..7 agenți -> 1 celulă, 8 agenți -> 2 celule (prag SLOTS_PER_CELL=7)', () => {
  for (let n = 1; n <= 7; n++) assert.equal(cellsNeeded(n), 1, `n=${n}`);
  assert.equal(cellsNeeded(8), 2);
});

test('cellsNeeded: pragurile de la 2 la 9 celule cresc din 7 în 7', () => {
  // 9..14 -> 2, 15..21 -> 3, ..., 57..63 -> 9
  assert.equal(cellsNeeded(9), 2);
  assert.equal(cellsNeeded(14), 2);
  assert.equal(cellsNeeded(15), 3);
  assert.equal(cellsNeeded(56), 8);
  assert.equal(cellsNeeded(57), 9);
});

test('cellsNeeded: plafon MAX_CELLS=9, un număr foarte mare de agenți tot dă 9', () => {
  assert.equal(cellsNeeded(63), 9);
  assert.equal(cellsNeeded(1000), 9);
  assert.equal(cellsNeeded(1_000_000), 9);
});

// --- Proiect nou, singur ---------------------------------------------------

test('proiect nou, singur, fără previous: primește exact cellsNeeded(size) celule, toate conectate', () => {
  const projects = [{ id: 'solo', size: 50 }]; // cellsNeeded(50) = 8
  const result = allocateCells(projects, new Map());
  const cells = result.get('solo');
  assert.equal(cells.length, cellsNeeded(50));
  assert.equal(cells.length, 8);
  assert.equal(isConnected(result), true);
});

// --- Două proiecte noi ------------------------------------------------------

test('două proiecte noi: primul din listă (cel mai mare) ia celula cea mai apropiată de origine (0,0)', () => {
  const projects = [
    { id: 'big', size: 50 }, // 8 celule
    { id: 'small', size: 5 }, // 1 celulă
  ];
  const result = allocateCells(projects, new Map());
  const big = mapToObj(result).big;
  assert.deepEqual(big[0], { x: 0, y: 0 });
});

test('două proiecte noi: zonele nu se suprapun (nicio celulă {x,y} comună)', () => {
  const projects = [
    { id: 'big', size: 50 },
    { id: 'small', size: 20 },
  ];
  const result = allocateCells(projects, new Map());
  const obj = mapToObj(result);
  const a = keysOf(obj.big);
  const b = keysOf(obj.small);
  const overlap = [...a].filter((k) => b.has(k));
  assert.deepEqual(overlap, []);
});

// --- Stabilitate: cazul critic ---------------------------------------------

test('stabilitate: reordonarea proiectelor de intrare NU schimbă layout-ul rezultat, dat fiind același `previous`', () => {
  const round1 = [
    { id: 'a', size: 50 },
    { id: 'b', size: 20 },
    { id: 'c', size: 5 },
  ];
  const first = allocateCells(round1, new Map());
  const firstObj = mapToObj(first);

  // Al doilea apel: aceleași proiecte, ordine complet diferită în array,
  // dar `previous` = rezultatul primului apel.
  const previous = new Map(Object.entries(firstObj));
  const round2 = [
    { id: 'c', size: 5 },
    { id: 'a', size: 50 },
    { id: 'b', size: 20 },
  ];
  const second = allocateCells(round2, previous);
  const secondObj = mapToObj(second);

  assert.deepEqual(secondObj, firstObj);
});

// --- Creștere ---------------------------------------------------------------

test('creștere: un proiect cu 1 celulă care acum are nevoie de 3 păstrează rădăcina veche și adaugă 2 vecine', () => {
  const root = { x: 3, y: 0 };
  const previous = new Map([['a', [root]]]);
  const projects = [{ id: 'a', size: 20 }]; // cellsNeeded(20) = 3
  const result = layOut(projects, previous);
  const cells = result.get('a');
  assert.equal(cells.length, 3);
  assert.deepEqual(cells[0], root, 'rădăcina veche (cells[0]) trebuie păstrată exact');
  assert.equal(isConnected(result), true, 'blobul crescut trebuie să fie conex');
});

// --- Micșorare ----------------------------------------------------------------

test('micșorare: un proiect cu 3 celule care acum are nevoie de 1 păstrează DOAR rădăcina', () => {
  const root = { x: 0, y: 0 };
  const oldCells = [root, { x: 1, y: 0 }, { x: 0, y: 1 }];
  const previous = new Map([['a', oldCells]]);
  const projects = [{ id: 'a', size: 5 }]; // cellsNeeded(5) = 1
  const result = layOut(projects, previous);
  const cells = result.get('a');
  assert.equal(cells.length, 1);
  assert.deepEqual(cells[0], root);
});

// --- Rădăcina veche ocupată de altcineva ------------------------------------

test('rădăcina veche ocupată de altcineva: proiectul e re-sămânțat ca nou, fără eroare', () => {
  const sharedRoot = { x: 0, y: 0 };
  // Conflict artificial: două proiecte "previous" cu aceeași rădăcină.
  // 'a' e primul în `projects`, deci o revendică el; 'b' trebuie tratat
  // ca proiect nou.
  const previous = new Map([
    ['a', [sharedRoot]],
    ['b', [sharedRoot]],
  ]);
  const projects = [
    { id: 'a', size: 5 },
    { id: 'b', size: 5 },
  ];
  assert.doesNotThrow(() => layOut(projects, previous));
  const result = layOut(projects, previous);
  const obj = mapToObj(result);
  assert.equal(obj.a.length, 1);
  assert.deepEqual(obj.a[0], sharedRoot);
  assert.equal(obj.b.length, 1);
  // 'b' nu a putut păstra rădăcina revendicată deja de 'a'.
  assert.notDeepEqual(obj.b[0], sharedRoot);
});

// --- Proiect dispărut ---------------------------------------------------------

test('proiect dispărut din `projects` nu apare în rezultat și nu aruncă', () => {
  const previous = new Map([
    ['ghost', [{ x: 5, y: 5 }]],
    ['a', [{ x: 0, y: 0 }]],
  ]);
  const projects = [{ id: 'a', size: 5 }]; // 'ghost' nu mai există
  let result;
  assert.doesNotThrow(() => { result = layOut(projects, previous); });
  assert.equal(result.has('ghost'), false);
  assert.equal(result.has('a'), true);
});

// --- isConnected + fallback ----------------------------------------------------

test('previous neconex (două zone izolate, departe una de alta) -> allocateCells produce un rezultat FINAL conex (fallback intern)', () => {
  // Rădăcinile trebuie să rămână în raza pool-ului (r<12, plafon hard),
  // altfel `free.has(root)` e fals și proiectul e re-sămânțat ca nou
  // (alt caz, deja acoperit separat) — nu neconex. La distanță Manhattan
  // exact 11 de origine, ambele rămân "libere" (incluse în ultimul inel
  // generat), dar la distanță 22 una de alta, deci izolate real.
  const previous = new Map([
    ['a', [{ x: 11, y: 0 }]],
    ['b', [{ x: -11, y: 0 }]], // izolat, nimic între ele
  ]);
  const projects = [
    { id: 'a', size: 5 }, // rămâne 1 celulă, nu crește -> nu se apropie de 'b'
    { id: 'b', size: 5 },
  ];

  // Layout-ul brut (fără fallback) e într-adevăr neconex: confirmă premisa
  // testului, nu doar comportamentul final.
  const raw = layOut(projects, previous);
  assert.equal(isConnected(raw), false, 'premisa testului: layout-ul brut trebuie să fie neconex');

  const finalResult = allocateCells(projects, previous);
  assert.equal(isConnected(finalResult), true, 'allocateCells trebuie să fi aplicat fallback-ul de relayout');
});

test('isConnected: un singur proiect cu mai multe celule construite prin creștere e mereu conex', () => {
  const projects = [{ id: 'solo', size: 60 }]; // cellsNeeded(60) = 9
  const result = allocateCells(projects, new Map());
  assert.equal(isConnected(result), true);
});

// --- Pool epuizat -------------------------------------------------------------

// Corecție planner: raționamentul inițial era greșit. Cererea AGREGATĂ de
// celule (40×9=360 > 265) nu epuizează pool-ul de SĂMÂNȚĂ — creșterea
// (growBlob) e cea care se oprește prima, dând alocări parțiale (ex. 1
// celulă în loc de 9), nu goale. Verificat manual: 40 proiecte a 57 agenți
// dau tuturor cel puțin o celulă (0 goale), pentru că pool-ul (265 celule)
// depășește cu mult numărul de proiecte (40) — sămânța nu lipsește nimănui.
// `[]` apare doar când NUMĂRUL de proiecte depășește pool-ul de sămânță,
// nu când cererea agregată de celule îl depășește — de-aia scenariul de mai
// jos folosește 280 de proiecte mici (peste cele ~265 celule), nu 40 mari.
test('pool epuizat: mai multe proiecte decât celule în pool -> unele primesc [] fără eroare', () => {
  // Pool-ul de inele se oprește hard la r<12: suma punctelor la distanță
  // Manhattan 0..11 pe grilă pătrată e 1 + 4*(1+2+...+11) = 265 celule
  // libere. 280 de proiecte, fiecare cerând o singură celulă, depășesc
  // acest total — cel puțin 15 nu mai găsesc nicio sămânță liberă.
  const projects = Array.from({ length: 280 }, (_, i) => ({ id: `p${i}`, size: 1 }));
  let result;
  assert.doesNotThrow(() => { result = layOut(projects, new Map()); });

  const obj = mapToObj(result);
  const totalAllocated = Object.values(obj).reduce((sum, cells) => sum + cells.length, 0);
  assert.ok(totalAllocated <= 265, `total alocat (${totalAllocated}) nu poate depăși pool-ul de ~265 celule`);

  const emptied = Object.values(obj).some((cells) => cells.length === 0);
  assert.ok(emptied, 'cel puțin un proiect din coadă trebuie să primească [] când pool-ul se epuizează');

  // Fără celule duplicate alocate la doi ID-uri diferiți, chiar și în
  // regim de epuizare.
  const allKeys = new Set();
  for (const cells of Object.values(obj)) {
    for (const c of cells) {
      const k = `${c.x},${c.y}`;
      assert.ok(!allKeys.has(k), `celula ${k} alocată de două ori`);
      allKeys.add(k);
    }
  }
});
