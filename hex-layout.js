// hex-layout.js — project placement on a hexagonal grid with memory between
// calls. Ported from bot-crossing (src/world/plots.js: allocateCells, layOut,
// growBlob, isConnected, hexRing, cellsNeeded, hexDistance, and key), adapted
// to use the source's flat-top axial coordinates but WITHOUT any reserved
// "ship" cell (SHIP_CELL). RPG Factory has no such fixed object in this batch.
// This is a pure function with no require-time side effects: it reads no files
// and opens no database. Canvas 2D rendering and database wiring belong to
// RF-05b; this file contains only cell-allocation logic.

// Number of specialist slots that visually fit in one cell and maximum cells
// one project may occupy. These match bot-crossing; the planner may adjust
// them for the actual RPG Factory agent count per project.
const SLOTS_PER_CELL = 7;
const MAX_CELLS = 9;

const ORIGIN = { q: 0, r: 0 };

// Six flat-top axial directions, matching the source.
const HEX_DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const key = (q, r) => `${q},${r}`;

// All cells exactly `radius` hex distance from the origin: the ring from which
// a new project's seed is selected in spiral order.
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

// Number of cells a project needs based on its agent count.
const cellsNeeded = (size) =>
  Math.max(1, Math.min(MAX_CELLS, Math.ceil(size / SLOTS_PER_CELL)));

/** Hexagonal (axial) distance between two cells. */
function hexDistance(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

// Is the map one connected territory? Flood-fill all cells occupied by all
// projects in the six hex directions. Unlike the source, no "stepping stone"
// cell is ignored because no cell is reserved here.
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

/** Claim free neighbors until the blob reaches the desired size, anchored to its root. */
function growBlob(cells, want, free) {
  const root = cells[0];
  while (cells.length < want) {
    let best = null;
    let bestScore = Infinity;
    for (const c of cells) {
      for (const [dq, dr] of HEX_DIRS) {
        const n = { q: c.q + dq, r: c.r + dr };
        if (!free.has(key(n.q, n.r))) continue;
        // Prefer proximity to the root, then map center, to keep blobs compact.
        const score = hexDistance(n, root) * 100 + hexDistance(n, ORIGIN);
        if (score < bestScore) {
          bestScore = score;
          best = n;
        }
      }
    }
    if (!best) break; // completely surrounded by neighbors
    free.delete(key(best.q, best.r));
    cells.push(best);
  }
}

function layOut(projects, previous) {
  const wanted = projects.map((p) => ({ id: p.id, want: cellsNeeded(p.size) }));
  const total = wanted.reduce((n, w) => n + w.want, 0);

  // Pool of free cells in a center-out spiral. It must cover the most distant
  // cell remembered for an inactive project, not only today's needs. Otherwise
  // a project long placed at the edge loses its cell from `free` when the map
  // shrinks and cannot reclaim it, causing the exact jump memory prevents.
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
    // The root is essential. If no longer free, lay the project out from
    // scratch rather than silently re-rooting it on another old cell.
    if (!free.has(key(before[0].q, before[0].r))) continue;
    const keep = [];
    for (const cell of before) {
      if (keep.length >= want) break; // shrank: release the cells acquired last
      const k = key(cell.q, cell.r);
      if (!free.has(k)) continue; // duplicate from a manually edited file
      free.delete(k);
      keep.push({ q: cell.q, r: cell.r });
    }
    if (keep.length) held.set(id, keep);
  }

  const out = new Map();
  // Existing projects grow first so a new project cannot steal the cell into
  // which an existing zone intended to expand.
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
 * @param projects  [{ id, size }], already ordered by the caller (largest
 *                  first; order alone decides which NEW project without
 *                  history receives the cell closest to center).
 * @param previous  Map<id, [{q, r}, ...]> — previous layout, possibly empty
 *                  or absent on the first call.
 * @returns Map<id, [{q, r}, ...]>
 */
function allocateCells(projects, previous = new Map()) {
  const laid = layOut(projects, previous);
  // Memory matters, but not more than one connected territory. If remembering
  // zones would create isolated islands, rebuild once compactly from center as
  // a last resort.
  return isConnected(laid) ? laid : layOut(projects, new Map());
}

module.exports = { allocateCells, hexDistance };
