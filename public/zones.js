// zones.js — per-project zone allocation on an infinite square grid, ported
// from bot-crossing (src/world/plots.js). Adapted from axial hex coordinates
// (6 neighbors) to a square grid (4 neighbors, N/S/E/W) and from hex rings to
// diamond-shaped rings (Manhattan distance). There is no "ship" cell;
// connectivity is checked directly across occupied cells. This is a classic
// script like merge-state.js, with no ES modules or module.exports. Rendering
// (T-10) and persistence (T-09) are handled separately.

const SLOTS_PER_CELL = 7; // number of agents that visually fit in one cell
const MAX_CELLS = 9; // maximum cells per project

const key = (x, y) => `${x},${y}`;
const ORIGIN = { x: 0, y: 0 };
const RESERVED_CELL = { x: 0, y: 0 }; // the tower/spawn point (T-15) is here; no project may receive this cell
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]; // 4 directions instead of the 6 hex directions

function manhattanDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Equivalent to hexRing(radius): all cells at exactly `radius` Manhattan
// distance from the origin (a diamond rather than a hex circle, but serving
// the same purpose as the seed spiral ring).
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

// growBlob — grows a cell blob from cells[0] (the root), choosing the best
// free neighbor each time: closest to the root, then closest to the origin.
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
    if (!best) break; // completely surrounded
    free.delete(key(best.x, best.y));
    cells.push(best);
  }
}

// isConnected — four-direction flood fill across all occupied cells in all
// projects. The reserved tower cell is treated as a traversable stepping stone
// (not a member) so it does not artificially disconnect colonies surrounding
// it on both sides.
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

// layOut — places each project: projects with a previous layout retain their
// root (when still free) and grow/shrink for current needs; new projects (or
// projects without a free root) take the first free cell from the pool.
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

  // Retained zones grow first so a new project cannot take the cell into
  // which they intended to expand.
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
  return isConnected(laid) ? laid : layOut(projects, new Map()); // fallback: complete layout from scratch
}
