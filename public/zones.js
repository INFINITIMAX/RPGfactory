// zones.js — alocarea zonelor per proiect pe o grilă pătrată infinită,
// portată din bot-crossing (src/world/plots.js), adaptată de la coordonate
// hexagonale axiale (6 vecini) la o grilă pătrată (4 vecini, N/S/E/V) și de
// la inele hexagonale la inele romboidale (distanță Manhattan). Nicio
// celulă de tip "navă" — conectivitatea se verifică direct pe celulele
// ocupate. Script clasic, ca merge-state.js — fără module ES, fără
// module.exports. Randarea (T-10) și persistența (T-09) vin separat.

const SLOTS_PER_CELL = 7; // câți agenți încap vizual într-o celulă
const MAX_CELLS = 9; // plafon de celule per proiect

const key = (x, y) => `${x},${y}`;
const ORIGIN = { x: 0, y: 0 };
const RESERVED_CELL = { x: 0, y: 0 }; // turnul/spawn point-ul (T-15) stă exact aici — niciun proiect nu poate primi această celulă
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]; // 4 direcții, în loc de cele 6 hexagonale

function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Echivalentul lui hexRing(radius) — toate celulele la distanță Manhattan
// exactă `radius` de origine (un romb, nu un cerc hexagonal, dar același rol:
// inelul spiralei de sămânță).
function ring(radius) {
  if (radius === 0) return [{ x: 0, y: 0 }];
  const out = [];
  for (let x = -radius; x <= radius; x++) {
    const y = radius - Math.abs(x);
    out.push({ x, y });
    if (y !== 0) out.push({ x, y: -y });
  }
  return out;
}

const cellsNeeded = (agentCount) =>
  Math.max(1, Math.min(MAX_CELLS, Math.ceil(agentCount / SLOTS_PER_CELL)));

// growBlob — crește un blob de celule pornind de la cells[0] (rădăcina),
// alegând de fiecare dată vecinul liber cel mai bun: cel mai apropiat de
// rădăcină, iar la egalitate cel mai apropiat de origine.
function growBlob(cells, want, free) {
  const root = cells[0];
  while (cells.length < want) {
    let best = null;
    let bestScore = Infinity;
    for (const c of cells) {
      for (const [dx, dy] of DIRS) {
        const n = { x: c.x + dx, y: c.y + dy };
        if (!free.has(key(n.x, n.y))) continue;
        const score = manhattanDistance(n, root) * 100 + manhattanDistance(n, ORIGIN);
        if (score < bestScore) { bestScore = score; best = n; }
      }
    }
    if (!best) break; // complet încercuit
    free.delete(key(best.x, best.y));
    cells.push(best);
  }
}

// isConnected — flood-fill pe 4 direcții peste toate celulele ocupate din
// toate proiectele, cu celula rezervată a turnului tratată ca "stepping
// stone" trecător (nu un membru), ca să nu rupă artificial conectivitatea
// coloniilor care o înconjoară din ambele părți.
function isConnected(out) {
  const cells = new Map();
  for (const [, list] of out) for (const c of list) cells.set(key(c.x, c.y), c);
  if (cells.size < 2) return true;

  const reservedKey = key(RESERVED_CELL.x, RESERVED_CELL.y);
  const passable = new Set([...cells.keys(), reservedKey]);

  const [startKey] = cells.keys();
  const seen = new Set([startKey]);
  const queue = [cells.get(startKey)];
  while (queue.length) {
    const c = queue.pop();
    for (const [dx, dy] of DIRS) {
      const n = { x: c.x + dx, y: c.y + dy };
      const k = key(n.x, n.y);
      if (!passable.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  seen.delete(reservedKey);
  return seen.size === cells.size;
}

// layOut — plasează fiecare proiect: cele cu layout anterior își păstrează
// rădăcina (dacă mai e liberă) și cresc/se tund după nevoia curentă; cele
// noi (sau fără rădăcină liberă) iau prima celulă liberă din pool.
function layOut(projects, previous) {
  const wanted = projects.map((p) => ({ id: p.id, want: cellsNeeded(p.size) }));
  const total = wanted.reduce((sum, p) => sum + p.want, 0);

  let farthest = 0;
  for (const [, cells] of previous) {
    for (const c of cells) {
      farthest = Math.max(farthest, manhattanDistance(c, ORIGIN));
    }
  }

  const pool = [];
  const free = new Set();
  let r = 0;
  while ((pool.length < total + 30 || r <= farthest) && r < 12) {
    for (const c of ring(r)) {
      pool.push(c);
      free.add(key(c.x, c.y));
    }
    r++;
  }
  free.delete(key(RESERVED_CELL.x, RESERVED_CELL.y));

  const out = new Map();
  const kept = [];
  const fresh = [];

  for (const { id, want } of wanted) {
    const prevCells = previous.get(id);
    if (prevCells && prevCells.length && free.has(key(prevCells[0].x, prevCells[0].y))) {
      const root = prevCells[0];
      const cells = [root];
      free.delete(key(root.x, root.y));
      for (let i = 1; i < prevCells.length && cells.length < want; i++) {
        const c = prevCells[i];
        if (free.has(key(c.x, c.y))) {
          free.delete(key(c.x, c.y));
          cells.push(c);
        }
      }
      out.set(id, cells);
      kept.push({ id, want });
    } else {
      fresh.push({ id, want });
    }
  }

  // Zonele păstrate cresc primele, ca să nu le fure un proiect nou celula
  // în care voiau să se extindă.
  for (const { id, want } of kept) {
    growBlob(out.get(id), want, free);
  }

  for (const { id, want } of fresh) {
    let root = null;
    for (const c of pool) {
      if (free.has(key(c.x, c.y))) { root = c; break; }
    }
    if (!root) { out.set(id, []); continue; }
    free.delete(key(root.x, root.y));
    const cells = [root];
    growBlob(cells, want, free);
    out.set(id, cells);
  }

  return out;
}

function allocateCells(projects, previous) {
  const laid = layOut(projects, previous);
  return isConnected(laid) ? laid : layOut(projects, new Map()); // fallback: relayout complet de la zero
}
