// hex-layout.js — algoritmul de așezare a proiectelor pe o grilă hexagonală,
// cu memorie între apeluri. Portat din bot-crossing (src/world/plots.js,
// funcțiile allocateCells/layOut/growBlob/isConnected/hexRing/cellsNeeded/
// hexDistance/key), adaptat: coordonate axiale flat-top ca în sursă, dar
// FĂRĂ nicio celulă rezervată de "navă" (SHIP_CELL) — RPG Factory nu are
// un asemenea obiect fix în acest lot. Funcție pură, fără efecte
// secundare la require: nu citește fișiere, nu deschide baza de date.
// Randarea (Canvas 2D) și wiring-ul cu baza de date vin în RF-05b — aici
// nu există decât logica de alocare a celulelor.

// Câte "sloturi" (specialiști) încap vizual într-o celulă, și plafonul de
// celule pe care îl poate ocupa un singur proiect. Aceleași valori ca
// sursa bot-crossing — planner-ul poate ajusta după numărul real de
// agenți per proiect din RPG Factory.
const SLOTS_PER_CELL = 7;
const MAX_CELLS = 9;

const ORIGIN = { q: 0, r: 0 };

// Cele 6 direcții axiale flat-top, ca în sursă.
const HEX_DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const key = (q, r) => `${q},${r}`;

// Toate celulele aflate la distanță hexagonală exactă `radius` de origine
// — inelul din care se ia sămânța unui proiect nou, în ordine de spirală.
function hexRing(radius) {
  if (radius === 0) return [{ q: 0, r: 0 }];
  const out = [];
  let q = HEX_DIRS[4][0] * radius;
  let r = HEX_DIRS[4][1] * radius;
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      out.push({ q, r });
      q += HEX_DIRS[i][0];
      r += HEX_DIRS[i][1];
    }
  }
  return out;
}

// Câte celule are nevoie un proiect, în funcție de câți agenți are.
const cellsNeeded = (size) =>
  Math.max(1, Math.min(MAX_CELLS, Math.ceil(size / SLOTS_PER_CELL)));

/** Distanța hexagonală (axială) dintre două celule. */
function hexDistance(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

// Este harta un singur teritoriu conex? Flood-fill peste toate celulele
// ocupate de toate proiectele, pe cele 6 direcții hexagonale. Spre
// deosebire de sursă, nu există nicio celulă "stepping stone" de trecut
// cu vederea — aici nu există celulă rezervată de niciun fel.
function isConnected(out) {
  const cells = new Map();
  for (const [, list] of out) for (const c of list) cells.set(key(c.q, c.r), c);
  if (cells.size < 2) return true;
  const [start] = cells.keys();
  const seen = new Set([start]);
  const queue = [cells.get(start)];
  while (queue.length) {
    const c = queue.pop();
    for (const [dq, dr] of HEX_DIRS) {
      const n = { q: c.q + dq, r: c.r + dr };
      const k = key(n.q, n.r);
      if (!cells.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return seen.size === cells.size;
}

/** Claim vecini liberi până când blob-ul ajunge la mărimea dorită, lipit de rădăcină. */
function growBlob(cells, want, free) {
  const root = cells[0];
  while (cells.length < want) {
    let best = null;
    let bestScore = Infinity;
    for (const c of cells) {
      for (const [dq, dr] of HEX_DIRS) {
        const n = { q: c.q + dq, r: c.r + dr };
        if (!free.has(key(n.q, n.r))) continue;
        // Lipit de rădăcină întâi, apoi de mijlocul hărții, ca blob-urile să iasă compacte.
        const score = hexDistance(n, root) * 100 + hexDistance(n, ORIGIN);
        if (score < bestScore) {
          bestScore = score;
          best = n;
        }
      }
    }
    if (!best) break; // complet încercuit de vecini
    free.delete(key(best.q, best.r));
    cells.push(best);
  }
}

function layOut(projects, previous) {
  const wanted = projects.map((p) => ({ id: p.id, want: cellsNeeded(p.size) }));
  const total = wanted.reduce((n, w) => n + w.want, 0);

  // Pool-ul de celule libere, în ordine de spirală din centru. Trebuie să
  // acopere și cea mai îndepărtată celulă "amintită" de un proiect
  // inactiv, nu doar nevoia de azi — altfel un proiect care a stat mult la
  // margine își pierde celula din `free` quando harta se micșorează și nu
  // și-o mai poate recupera, ceea ce ar produce exact saltul pe care
  // memoria există ca să-l prevină.
  const pool = [];
  const free = new Set();
  let farthest = 0;
  for (const project of projects) {
    for (const cell of previous.get(project.id) || []) farthest = Math.max(farthest, hexDistance(cell, ORIGIN));
  }
  for (let ring = 0; (pool.length < total + 30 || ring <= farthest) && ring < 12; ring++) {
    for (const cell of hexRing(ring)) {
      const k = key(cell.q, cell.r);
      pool.push(cell);
      free.add(k);
    }
  }

  const held = new Map();
  for (const { id, want } of wanted) {
    const before = previous.get(id);
    if (!before || !before.length) continue;
    // Rădăcina e esențială — dacă nu mai e liberă, proiectul e re-așezat
    // de la zero, nu re-rădăcinat tacit pe altă celulă veche.
    if (!free.has(key(before[0].q, before[0].r))) continue;
    const keep = [];
    for (const cell of before) {
      if (keep.length >= want) break; // s-a micșorat: renunță la ce a luat ultimul
      const k = key(cell.q, cell.r);
      if (!free.has(k)) continue; // duplicat dintr-un fișier editat manual
      free.delete(k);
      keep.push({ q: cell.q, r: cell.r });
    }
    if (keep.length) held.set(id, keep);
  }

  const out = new Map();
  // Cei deja existenți cresc primii, ca un proiect nou să nu fure celula
  // în care o zonă existentă voia să se extindă.
  for (const { id, want } of wanted) {
    const cells = held.get(id);
    if (!cells) continue;
    growBlob(cells, want, free);
    out.set(id, cells);
  }

  for (const { id, want } of wanted) {
    if (out.has(id)) continue;
    const seed = pool.find((c) => free.has(key(c.q, c.r)));
    if (!seed) {
      out.set(id, []);
      continue;
    }
    free.delete(key(seed.q, seed.r));
    const cells = [{ q: seed.q, r: seed.r }];
    growBlob(cells, want, free);
    out.set(id, cells);
  }
  return out;
}

/**
 * @param projects  [{ id, size }], ordonate deja de apelant (cel mai mare primul —
 *                  doar ordinea decide cui i se dă cea mai apropiată celulă de centru
 *                  DINTRE proiectele noi, fără istoric).
 * @param previous  Map<id, [{q, r}, ...]> — layout-ul anterior (poate fi gol/lipsă
 *                  la primul apel).
 * @returns Map<id, [{q, r}, ...]>
 */
function allocateCells(projects, previous = new Map()) {
  const laid = layOut(projects, previous);
  // Memoria contează mult, dar nu mai mult decât un teritoriu întreg: dacă
  // ținerea minte a zonelor ar produce insule izolate, se reface totul
  // compact, din centru, o singură dată — ca ultimă soluție.
  return isConnected(laid) ? laid : layOut(projects, new Map());
}

module.exports = { allocateCells, hexDistance };
