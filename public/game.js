// agent-map — Canvas rendering with the worker sprite (Tiny Swords, idle loop)

const POLL_INTERVAL_MS = 3000;

const GRID_COLS = 8;
const GRID_ROWS = 8;
const CELL_SIZE = 80;
const GRID_OFFSET = 40; // distance from the Canvas edge to the first cell

const CIRCLE_RADIUS = 28; // radius used for click hit testing
const COLOR_WORKING = '#2A5FAE';
const COLOR_WAITING = '#B4801E';
const COLOR_SLEEPING = '#888';
const COLOR_DEFAULT = '#888';
const FALLBACK_GRASS_COLOR = '#4a7c3f';

// T-10 — one zone per project, with a color selected from a small fixed palette
// (the same hues as the status indicators, plus a few neutrals) by hashing the
// project ID (cwd). This remains stable regardless of project order in a tick.
const ZONE_PALETTE = [
  { fill: 'rgba(42, 95, 174, 0.18)', stroke: '#2A5FAE' },
  { fill: 'rgba(180, 128, 30, 0.18)', stroke: '#B4801E' },
  { fill: 'rgba(76, 159, 76, 0.18)', stroke: '#4C9F4C' },
  { fill: 'rgba(155, 77, 202, 0.18)', stroke: '#9B4DCA' },
  { fill: 'rgba(201, 76, 76, 0.18)', stroke: '#C94C4C' },
  { fill: 'rgba(76, 184, 201, 0.18)', stroke: '#4CB8C9' },
];
const ZONE_JITTER_RADIUS = 12; // displacement when multiple agents in one project land in the same cell

const SPRITE_FRAME_SIZE = 192; // each sheet frame is 192x192px
const SPRITE_FRAME_COUNT = 8; // 8 horizontal idle frames
const RUN_SPRITE_FRAME_COUNT = 6; // 6 horizontal running frames
const SPRITE_ANIMATION_INTERVAL_MS = 125; // 8 frames/second
const SPRITE_DEST_SIZE = 56; // rendered Canvas size
const STATUS_DOT_RADIUS = 6;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const detailsEl = document.getElementById('details');
const hiddenPanelEl = document.getElementById('hidden-panel');

// T-12 — 2D camera: WORLD coordinate system, separate from screen pixels.
// camera.x/y is the WORLD point currently at the center of the screen.
// Cursor-anchored zoom (a principle ported from bot-crossing, src/core/camera.js:
// "The wheel zooms at the cursor... the ground point under the pointer is held
// still while the camera dollies"), using simple 2D math rather than their code.
const camera = { x: 0, y: 0, zoom: 2 };
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;

function worldToScreen(wx, wy) {
  return {
    x: canvas.width / 2 + (wx - camera.x) * camera.zoom,
    y: canvas.height / 2 + (wy - camera.y) * camera.zoom,
  };
}
function screenToWorld(sx, sy) {
  return {
    x: camera.x + (sx - canvas.width / 2) / camera.zoom,
    y: camera.y + (sy - canvas.height / 2) / camera.zoom,
  };
}

// T-11 — real movement: agents appear at SPAWN_POINT, walk to their zone
// position, and return to SPAWN_POINT before disappearing. Ported from
// bot-crossing (src/agents/astronauts.js), without pathfinding/steering: the
// flat 2D Canvas has no obstacles, so a straight line is sufficient.
// T-12 — SPAWN_POINT is the world origin: with the default camera
// ({x:0,y:0,zoom:1}), it is exactly at screen center.
const SPAWN_POINT = { x: 0, y: 0 };
const MOVEMENT_TICK_MS = 50; // 20 steps/second
const WALK_SPEED = 140; // px/second
const ARRIVE_RADIUS = 6; // px
const SPAWN_SCALE_RATE = 3; // scale/second while appearing
const LEAVING_SHRINK_RATE = 2.2; // scale/second while leaving
const MOVEMENT_DT = MOVEMENT_TICK_MS / 1000;

let agents = []; // latest response from /api/agents
let selectedSessionId = null;

// T-11 — each agent's currently DISPLAYED position, separate from the target
// zone position (computeAgentPositions). Updated by updateAgentMovement() every
// MOVEMENT_TICK_MS; draw() and click hit testing read this rather than the raw
// target because a moving agent must be drawn/clickable where it actually is.
const agentMovement = new Map(); // sessionId -> { state, x, y, scale, stateAge, name, activity }

// T-07 — archive persistence (see state.js + public/merge-state.js).
// `state` is the local working copy; `baseSnapshot`/`baseUpdatedAt` are the last
// server-confirmed version, used as the merge base after a 409.
let state = { version: 1, archived: [], archivedAt: {}, plots: {}, updatedAt: 0 };
let baseUpdatedAt = 0;
let baseSnapshot = { version: 1, archived: [], archivedAt: {}, plots: {}, updatedAt: 0 };
let pendingSave = null;
let showHidden = false;
let knownAgentNames = {}; // sessionId -> name, used to show hidden agents that are no longer live

// T-10 — signature of the last saved zone layout (the bot-crossing src/main.js
// pattern): recalculate every tick but write to disk only when the layout
// differs from the last saved version, avoiding a write on every poll.
let lastPlotsSignature = null;

// T-13/T-15 — grass patch cropped from the Tiny Swords terrain tilemap and
// drawn as the full-screen background (T-15: there is no longer water; grass
// always covers the whole Canvas regardless of zones/agents). The pattern is
// created once after the source image loads and remains fixed; it does not
// follow camera/zoom (see the T-13/T-15 reports).
const GRASS_PATCH_SX = 40;
const GRASS_PATCH_SY = 60;
const GRASS_PATCH_SIZE = 64;

const terrainImage = new Image();
let grassPattern = null;
terrainImage.onload = () => {
  const patchCanvas = document.createElement('canvas');
  patchCanvas.width = GRASS_PATCH_SIZE;
  patchCanvas.height = GRASS_PATCH_SIZE;
  const patchCtx = patchCanvas.getContext('2d');
  patchCtx.drawImage(
    terrainImage,
    GRASS_PATCH_SX, GRASS_PATCH_SY, GRASS_PATCH_SIZE, GRASS_PATCH_SIZE,
    0, 0, GRASS_PATCH_SIZE, GRASS_PATCH_SIZE
  );
  grassPattern = ctx.createPattern(patchCanvas, 'repeat');
};
terrainImage.src = '/sprites/terrain-tilemap.png';

const TOWER_WORLD_X = 0;
const TOWER_WORLD_Y = 0;
const TOWER_DEST_WIDTH = 64;
const TOWER_DEST_HEIGHT = 128;

const towerImage = new Image();
let towerImageLoaded = false;
towerImage.onload = () => { towerImageLoaded = true; };
towerImage.src = '/sprites/tower.png';

function drawTower() {
  if (!towerImageLoaded) return;
  const pos = worldToScreen(TOWER_WORLD_X, TOWER_WORLD_Y);
  const destW = TOWER_DEST_WIDTH * camera.zoom;
  const destH = TOWER_DEST_HEIGHT * camera.zoom;
  ctx.drawImage(towerImage, pos.x - destW / 2, pos.y - destH, destW, destH);
}

// T-14 — zone decorations (animated bushes and static rocks) plus clouds
// floating over water, so the terrain no longer looks like a flat rectangle.
const BUSH_FRAME_SIZE = 128; // 8 horizontal 128x128 frames
const BUSH_FRAME_COUNT = 8;
const ROCK_SIZE = 64; // native, static
const DECORATION_DEST_SIZE = 8; // drawn much smaller than the cell to avoid overlapping the agent sprite
const DECORATION_OFFSET = 2; // px from the cell corner

const bushImage = new Image();
let bushImageLoaded = false;
bushImage.onload = () => { bushImageLoaded = true; };
bushImage.src = '/sprites/bush.png';

const rock1Image = new Image();
let rock1ImageLoaded = false;
rock1Image.onload = () => { rock1ImageLoaded = true; };
rock1Image.src = '/sprites/rock1.png';

const rock2Image = new Image();
let rock2ImageLoaded = false;
rock2Image.onload = () => { rock2ImageLoaded = true; };
rock2Image.src = '/sprites/rock2.png';

// DETERMINISTICALLY decides (from a hash, not Math.random()) whether a zone
// cell gets a decoration. Its position must remain stable between draws, just
// like hash-based agent positioning.
function decorationForCell(projectId, cell) {
  const h = hashToCellIndex(projectId + ':' + cell.x + ',' + cell.y);
  if (h % 3 === 0) return { type: 'bush' };
  if (h % 3 === 1) return { type: 'rock', variant: h % 2 }; // 0=rock1, 1=rock2
  return null; // 1 in 3 cells stays empty to avoid visual clutter
}

const pawnImage = new Image();
let pawnImageLoaded = false;
pawnImage.onload = () => {
  pawnImageLoaded = true;
};
pawnImage.src = '/sprites/pawn-idle.png';

// T-11 — running sprite used while an agent is 'walking'/'leaving'.
const pawnRunImage = new Image();
let pawnRunImageLoaded = false;
pawnRunImage.onload = () => {
  pawnRunImageLoaded = true;
};
pawnRunImage.src = '/sprites/pawn-run.png';

// T-17 — geographic quadrant containing a world position, used for the visual
// theme/animation of the agent there. Y increases downward on the Canvas.
function regionForWorldPos(x, y) {
  if (x > 0 && y > 0) return 'forest';
  if (x > 0 && y < 0) return 'gold';
  return null;
}

const pawnRunAxeImage = new Image();
let pawnRunAxeImageLoaded = false;
pawnRunAxeImage.onload = () => { pawnRunAxeImageLoaded = true; };
pawnRunAxeImage.src = '/sprites/pawn-run-axe.png';

const pawnInteractAxeImage = new Image();
let pawnInteractAxeImageLoaded = false;
pawnInteractAxeImage.onload = () => { pawnInteractAxeImageLoaded = true; };
pawnInteractAxeImage.src = '/sprites/pawn-interact-axe.png';

const pawnRunPickaxeImage = new Image();
let pawnRunPickaxeImageLoaded = false;
pawnRunPickaxeImage.onload = () => { pawnRunPickaxeImageLoaded = true; };
pawnRunPickaxeImage.src = '/sprites/pawn-run-pickaxe.png';

const pawnInteractPickaxeImage = new Image();
let pawnInteractPickaxeImageLoaded = false;
pawnInteractPickaxeImage.onload = () => { pawnInteractPickaxeImageLoaded = true; };
pawnInteractPickaxeImage.src = '/sprites/pawn-interact-pickaxe.png';

// T-17 — fixed quadrant decorations (forest trees and gold on rocks), always
// drawn at fixed world positions regardless of projects/agents, like the tower
// in T-15.
const FOREST_TREE_POSITIONS = [
  { x: 220, y: 220 }, { x: 300, y: 260 }, { x: 260, y: 320 },
];
const GOLD_STONE_POSITIONS = [
  { x: 220, y: -220 }, { x: 300, y: -260 }, { x: 260, y: -320 },
];
const TREE_FRAME_SIZE = 192; // 8 frames of 192x256
const TREE_FRAME_COUNT = 8;
const TREE_FRAME_HEIGHT = 256;
const TREE_DEST_WIDTH = 48;
const TREE_DEST_HEIGHT = 64;
const GOLD_STONE_SIZE = 128; // native, static
const GOLD_STONE_DEST_SIZE = 32;

const treeImage = new Image();
let treeImageLoaded = false;
treeImage.onload = () => { treeImageLoaded = true; };
treeImage.src = '/sprites/tree.png';

const goldStoneImage = new Image();
let goldStoneImageLoaded = false;
goldStoneImage.onload = () => { goldStoneImageLoaded = true; };
goldStoneImage.src = '/sprites/gold-stone.png';

function drawRegionLandmarks() {
  if (treeImageLoaded) {
    for (const p of FOREST_TREE_POSITIONS) {
      const pos = worldToScreen(p.x, p.y);
      const destW = TREE_DEST_WIDTH * camera.zoom;
      const destH = TREE_DEST_HEIGHT * camera.zoom;
      ctx.drawImage(
        treeImage,
        (currentFrame % TREE_FRAME_COUNT) * TREE_FRAME_SIZE, 0, TREE_FRAME_SIZE, TREE_FRAME_HEIGHT,
        pos.x - destW / 2, pos.y - destH, destW, destH
      );
    }
  }
  if (goldStoneImageLoaded) {
    for (const p of GOLD_STONE_POSITIONS) {
      const pos = worldToScreen(p.x, p.y);
      const destSize = GOLD_STONE_DEST_SIZE * camera.zoom;
      ctx.drawImage(goldStoneImage, 0, 0, GOLD_STONE_SIZE, GOLD_STONE_SIZE, pos.x - destSize / 2, pos.y - destSize, destSize, destSize);
    }
  }
}

let currentFrame = 0;

// Grid position is calculated from a sessionId hash rather than the index in
// the server response array. If agent order changes between polls because one
// appears or disappears, an existing agent must not jump to another cell; its
// position must remain stable over time.
function hashToCellIndex(str) {
  let sum = 0;
  for (let i = 0; i < str.length; i++) {
    sum += str.charCodeAt(i);
  }
  return sum % (GRID_COLS * GRID_ROWS);
}

function cellIndexToPosition(index) {
  const col = index % GRID_COLS;
  const row = Math.floor(index / GRID_COLS);
  return {
    x: GRID_OFFSET + col * CELL_SIZE + CELL_SIZE / 2,
    y: GRID_OFFSET + row * CELL_SIZE + CELL_SIZE / 2,
  };
}

// T-10 — per-project positioning. `cellIndexToPosition` and the global grid
// above no longer position anything; they remain only because existing tests
// still exercise them directly (see the handoff report).

// T-12 — returns WORLD coordinates, not screen coordinates; pixel conversion
// happens only while drawing, through worldToScreen().
function zoneCellToPixels(cell) {
  return {
    x: cell.x * CELL_SIZE,
    y: cell.y * CELL_SIZE,
  };
}

function colorForProject(projectId) {
  return ZONE_PALETTE[hashToCellIndex(projectId) % ZONE_PALETTE.length];
}

// An agent chooses a cell in its project zone via a sessionId hash, producing
// a stable position rather than one recalculated from array order.
function cellForAgent(agent, projectCells) {
  if (!projectCells || projectCells.length === 0) return { x: 0, y: 0 }; // fallback: the project received no cell (pool exhausted)
  const index = hashToCellIndex(agent.sessionId) % projectCells.length;
  return projectCells[index];
}

// computeAgentPositions — TARGET pixel position for every live agent (where it
// SHOULD be in its zone), with jitter for agents that land on the same cell in
// one project because hashing does not guarantee unique distribution.
// T-11: updateAgentMovement() uses the result as a walking destination; draw()
// and click handling use the DISPLAYED agentMovement position instead.
function computeAgentPositions(liveAgents) {
  const groups = new Map(); // "cwd|x,y" -> [{ agent, cell }]
  for (const agent of liveAgents) {
    const projectCells = state.plots[agent.cwd];
    const cell = cellForAgent(agent, projectCells);
    const groupKey = agent.cwd + '|' + cell.x + ',' + cell.y;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push({ agent, cell });
  }

  const positions = new Map();
  for (const group of groups.values()) {
    group.sort((a, b) => (a.agent.sessionId < b.agent.sessionId ? -1 : 1));
    const n = group.length;
    group.forEach(({ agent, cell }, i) => {
      const pos = zoneCellToPixels(cell);
      if (n > 1) {
        const angle = (2 * Math.PI * i) / n;
        pos.x += Math.cos(angle) * ZONE_JITTER_RADIUS;
        pos.y += Math.sin(angle) * ZONE_JITTER_RADIUS;
      }
      positions.set(agent.sessionId, pos);
    });
  }
  return positions;
}

// T-11 — moves `entry` by up to `WALK_SPEED*MOVEMENT_DT` px toward
// (targetX,targetY). Returns true when it arrives (distance < ARRIVE_RADIUS or
// the step exceeds the remaining distance), snapping exactly to the target.
function stepAgentTowards(entry, targetX, targetY) {
  const dx = targetX - entry.x;
  const dy = targetY - entry.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const step = WALK_SPEED * MOVEMENT_DT;

  if (dist <= ARRIVE_RADIUS || step >= dist) {
    entry.x = targetX;
    entry.y = targetY;
    return true;
  }

  entry.x += (dx / dist) * step;
  entry.y += (dy / dist) * step;
  return false;
}

// T-11 — one real-movement step: spawning -> walking -> at-site -> leaving ->
// removal from agentMovement. Runs at MOVEMENT_TICK_MS, separately from the
// sprite animation loop (SPRITE_ANIMATION_INTERVAL_MS).
function updateAgentMovement() {
  const liveAgents = agents.filter((agent) => agent.alive && !state.archived.includes(agent.sessionId));
  const targets = computeAgentPositions(liveAgents);
  const liveById = new Map(liveAgents.map((agent) => [agent.sessionId, agent]));

  for (const agent of liveAgents) {
    if (!agentMovement.has(agent.sessionId)) {
      agentMovement.set(agent.sessionId, {
        state: 'spawning',
        x: SPAWN_POINT.x,
        y: SPAWN_POINT.y,
        scale: 0,
        stateAge: 0,
        name: agent.name,
        activity: agent.activity,
      });
    }
  }

  for (const [sessionId, entry] of agentMovement) {
    const agent = liveById.get(sessionId);
    if (agent) {
      entry.name = agent.name;
      entry.activity = agent.activity;
    } else if (entry.state !== 'leaving') {
      // The agent disappeared from the live-agent list (archived or dead
      // process), including while spawning or walking. Move directly to
      // leaving so it returns to SPAWN_POINT before disappearing instead of
      // being removed immediately from agentMovement.
      entry.state = 'leaving';
      entry.stateAge = 0;
    }

    entry.stateAge += MOVEMENT_DT;

    if (entry.state === 'spawning') {
      entry.scale = Math.min(1, entry.scale + MOVEMENT_DT * SPAWN_SCALE_RATE);
      if (entry.scale >= 1) {
        entry.state = 'walking';
        entry.stateAge = 0;
      }
    } else if (entry.state === 'walking') {
      const target = targets.get(sessionId) || SPAWN_POINT;
      if (stepAgentTowards(entry, target.x, target.y)) {
        entry.state = 'at-site';
        entry.stateAge = 0;
      }
    } else if (entry.state === 'at-site') {
      const target = targets.get(sessionId);
      if (target && (target.x !== entry.x || target.y !== entry.y)) {
        entry.state = 'walking';
        entry.stateAge = 0;
      }
    } else if (entry.state === 'leaving') {
      const arrived = stepAgentTowards(entry, SPAWN_POINT.x, SPAWN_POINT.y);
      entry.scale = Math.max(0, entry.scale - MOVEMENT_DT * LEAVING_SHRINK_RATE);
      // AND, not OR: scale reaches 0 much faster (~0.45s) than a distant
      // agent can return to SPAWN_POINT. OR would make it vanish in the middle
      // of the screen instead of at the exit. Remove it only after it has both
      // arrived AND fully shrunk.
      if (arrived && entry.scale <= 0) {
        agentMovement.delete(sessionId);
      }
    }
  }
}

// drawZones — background drawn before agents: one rectangle per cell in each
// project zone, plus the project name (last path segment only) above the
// topmost cell, using the leftmost cell to break ties.
function drawZones() {
  for (const projectId of Object.keys(state.plots || {})) {
    const cells = state.plots[projectId];
    if (!cells || cells.length === 0) continue;

    const palette = colorForProject(projectId);
    let topCell = cells[0];
    const cellSizeScreen = CELL_SIZE * camera.zoom;

    for (const cell of cells) {
      const worldPos = zoneCellToPixels(cell);
      const pos = worldToScreen(worldPos.x, worldPos.y);
      ctx.strokeStyle = palette.stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(pos.x - cellSizeScreen / 2, pos.y - cellSizeScreen / 2, cellSizeScreen, cellSizeScreen);
      if (cell.y < topCell.y || (cell.y === topCell.y && cell.x < topCell.x)) topCell = cell;

      // T-14 — fixed hash-derived decoration in the cell's bottom-right
      // corner so it does not overlap agents at the center.
      const decoration = decorationForCell(projectId, cell);
      if (decoration) {
        const destSize = DECORATION_DEST_SIZE * camera.zoom;
        const destX = pos.x + cellSizeScreen / 2 - destSize - DECORATION_OFFSET * camera.zoom;
        const destY = pos.y + cellSizeScreen / 2 - destSize - DECORATION_OFFSET * camera.zoom;

        if (decoration.type === 'bush' && bushImageLoaded) {
          ctx.drawImage(
            bushImage,
            (currentFrame % BUSH_FRAME_COUNT) * BUSH_FRAME_SIZE, 0, BUSH_FRAME_SIZE, BUSH_FRAME_SIZE,
            destX, destY, destSize, destSize
          );
        } else if (decoration.type === 'rock') {
          const rockImage = decoration.variant === 0 ? rock1Image : rock2Image;
          const rockLoaded = decoration.variant === 0 ? rock1ImageLoaded : rock2ImageLoaded;
          if (rockLoaded) {
            ctx.drawImage(rockImage, 0, 0, ROCK_SIZE, ROCK_SIZE, destX, destY, destSize, destSize);
          }
        }
      }
    }

    const labelWorldPos = zoneCellToPixels(topCell);
    const labelPos = worldToScreen(labelWorldPos.x, labelWorldPos.y);
    const name = projectId.split(/[\\/]/).pop();
    ctx.fillStyle = '#ccc';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(name, labelPos.x, labelPos.y - cellSizeScreen / 2 - 6);
  }
}

// updateZones — recalculates zones from current live agents (T-08:
// zones.js/allocateCells) and saves only when the layout actually changed
// since the last save (the bot-crossing src/main.js pattern).
function updateZones() {
  const counts = {};
  for (const agent of agents) {
    if (!agent.alive || state.archived.includes(agent.sessionId)) continue;
    counts[agent.cwd] = (counts[agent.cwd] || 0) + 1;
  }
  const projects = Object.entries(counts)
    .map(([id, size]) => ({ id, size }))
    .sort((a, b) => b.size - a.size); // largest first, as required by zones.js

  const previousMap = new Map(Object.entries(state.plots || {}));
  const newPlotsMap = allocateCells(projects, previousMap);
  const newPlots = Object.fromEntries(newPlotsMap);

  const signature = JSON.stringify(newPlots);
  if (signature !== lastPlotsSignature) {
    lastPlotsSignature = signature;
    state.plots = newPlots;
    queueSave();
  } else {
    state.plots = newPlots; // same data; update the reference without saving
  }
}

function colorForActivity(activity) {
  if (activity === 'working') return COLOR_WORKING;
  if (activity === 'waiting') return COLOR_WAITING;
  if (activity === 'sleeping') return COLOR_SLEEPING;
  console.log('unknown activity:', activity);
  return COLOR_DEFAULT;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = grassPattern || FALLBACK_GRASS_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawTower();

  drawRegionLandmarks();

  drawZones();

  // T-11 — iterate agentMovement rather than live agents directly: an agent
  // in 'leaving' must still be drawn while departing even after it disappears
  // from /api/agents. Drawn position/scale comes from current agentMovement,
  // not from the raw target position.
  for (const [sessionId, entry] of agentMovement) {
    const screenPos = worldToScreen(entry.x, entry.y);
    const spriteSize = SPRITE_DEST_SIZE * entry.scale * camera.zoom;
    const spriteX = screenPos.x - spriteSize / 2;
    const spriteY = screenPos.y - spriteSize / 2;

    const running = entry.state === 'walking' || entry.state === 'leaving';
    const region = regionForWorldPos(entry.x, entry.y);
    let spriteImage, spriteLoaded;
    if (region === 'forest') {
      spriteImage = running ? pawnRunAxeImage : pawnInteractAxeImage;
      spriteLoaded = running ? pawnRunAxeImageLoaded : pawnInteractAxeImageLoaded;
    } else if (region === 'gold') {
      spriteImage = running ? pawnRunPickaxeImage : pawnInteractPickaxeImage;
      spriteLoaded = running ? pawnRunPickaxeImageLoaded : pawnInteractPickaxeImageLoaded;
    } else {
      spriteImage = running ? pawnRunImage : pawnImage;
      spriteLoaded = running ? pawnRunImageLoaded : pawnImageLoaded;
    }
    const frameCount = region === 'forest' || region === 'gold' ? RUN_SPRITE_FRAME_COUNT : (running ? RUN_SPRITE_FRAME_COUNT : SPRITE_FRAME_COUNT);

    if (spriteLoaded && entry.scale > 0) {
      ctx.drawImage(
        spriteImage,
        (currentFrame % frameCount) * SPRITE_FRAME_SIZE, 0, SPRITE_FRAME_SIZE, SPRITE_FRAME_SIZE,
        spriteX, spriteY, spriteSize, spriteSize
      );
    }

    ctx.beginPath();
    ctx.arc(spriteX + spriteSize, spriteY, STATUS_DOT_RADIUS * camera.zoom, 0, Math.PI * 2);
    ctx.fillStyle = colorForActivity(entry.activity);
    ctx.fill();

    if (sessionId === selectedSessionId) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(spriteX, spriteY, spriteSize, spriteSize);
    }

    ctx.fillStyle = '#eee';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(entry.name, screenPos.x, screenPos.y + (SPRITE_DEST_SIZE / 2 + 14) * camera.zoom);
  }
}

function renderDetails() {
  const agent = agents.find((a) => a.sessionId === selectedSessionId);
  if (!agent) {
    detailsEl.classList.add('hidden');
    // Use innerHTML rather than only textContent because the panel contains
    // markup (buttons) from the last selection. Clearing only text left old
    // buttons in the DOM, hidden only visually by the "hidden" class (a bug
    // caught by the T-07 tests).
    detailsEl.innerHTML = '';
    return;
  }

  const updatedAt = new Date(agent.updatedAt).toLocaleTimeString();

  detailsEl.innerHTML = `
    <div><span class="label">name</span>${agent.name}</div>
    <div><span class="label">status</span>${agent.status}</div>
    <div><span class="label">pid</span>${agent.pid}</div>
    <div><span class="label">cwd</span>${agent.cwd}</div>
    <div><span class="label">updatedAt</span>${updatedAt}</div>
    <div><button id="open-btn">Open</button> <button id="new-session-btn">New session</button> <button id="reveal-btn">Reveal in folder</button> <button id="hide-btn">Hide</button> <span id="open-error" class="open-error"></span></div>
  `;
  detailsEl.classList.remove('hidden');

  document.getElementById('open-btn').addEventListener('click', () => {
    openAgentSession(agent.sessionId);
  });
  document.getElementById('new-session-btn').addEventListener('click', () => {
    newSessionForAgent(agent.cwd);
  });
  document.getElementById('reveal-btn').addEventListener('click', () => {
    revealAgentFolder(agent.cwd);
  });
  document.getElementById('hide-btn').addEventListener('click', () => {
    hideAgent(agent.sessionId);
  });
}

// Hide an agent using the optimistic bot-crossing pattern (src/main.js,
// archiveThread): update locally at once, deselect, rerender, then schedule a
// save with the 500ms queueSave debounce.
function hideAgent(sessionId) {
  state.archived = [...new Set([...state.archived, sessionId])];
  state.archivedAt = { ...state.archivedAt, [sessionId]: Date.now() };
  queueSave();
  selectedSessionId = null;
  draw();
  renderDetails();
  renderHiddenList();
}

function unhideAgent(sessionId) {
  state.archived = state.archived.filter((id) => id !== sessionId);
  const nextArchivedAt = { ...state.archivedAt };
  delete nextArchivedAt[sessionId];
  state.archivedAt = nextArchivedAt;
  queueSave();
  draw();
  renderHiddenList();
}

// Minimal list of hidden agents so an Unhide path exists. Names come from
// `knownAgentNames`, populated from /api/agents on each tick; otherwise a
// hidden agent that is no longer live would have no available name.
function renderHiddenList() {
  const count = state.archived.length;

  if (!showHidden) {
    hiddenPanelEl.innerHTML = `<button id="show-hidden-btn">Show hidden (${count})</button>`;
    document.getElementById('show-hidden-btn').addEventListener('click', () => {
      showHidden = true;
      renderHiddenList();
    });
    return;
  }

  const items = state.archived
    .map((sessionId) => {
      const name = knownAgentNames[sessionId] || sessionId;
      return `<li>${name} <button data-session-id="${sessionId}" class="unhide-btn">Unhide</button></li>`;
    })
    .join('');

  hiddenPanelEl.innerHTML = `
    <button id="hide-hidden-btn">Hide list (${count})</button>
    <ul>${items}</ul>
  `;
  document.getElementById('hide-hidden-btn').addEventListener('click', () => {
    showHidden = false;
    renderHiddenList();
  });
  hiddenPanelEl.querySelectorAll('.unhide-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      unhideAgent(btn.dataset.sessionId);
    });
  });
}

// queueSave/saveState — ported from bot-crossing (src/main.js queueSave and
// src/game/api.js saveState): debounce 500ms, then PUT with baseUpdatedAt. On
// 409, perform a three-way merge (merge-state.js) with the server-returned
// state and retry, up to three total attempts.
function queueSave() {
  clearTimeout(pendingSave);
  pendingSave = setTimeout(async () => {
    try {
      state = await saveState(state, 0);
    } catch (e) {
      console.log('failed to save archive state:', e);
    }
  }, 500);
}

async function saveState(localState, attempt) {
  const res = await fetch('/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      archived: localState.archived,
      archivedAt: localState.archivedAt,
      plots: localState.plots,
      baseUpdatedAt: baseUpdatedAt,
    }),
  });

  if (res.status === 409) {
    const remote = await res.json();
    if (attempt >= 2) {
      // All three attempts are exhausted. Give up for now, keep the column
      // working locally, and retry after the next change.
      baseSnapshot = structuredClone(remote);
      baseUpdatedAt = remote.updatedAt;
      return localState;
    }
    const merged = mergeState(baseSnapshot, localState, remote);
    baseSnapshot = structuredClone(remote);
    baseUpdatedAt = remote.updatedAt;
    return saveState(merged, attempt + 1);
  }

  if (!res.ok) {
    throw new Error('PUT /api/state failed with status ' + res.status);
  }

  const body = await res.json();
  baseSnapshot = structuredClone(body);
  baseUpdatedAt = body.updatedAt;
  return body;
}

async function initState() {
  try {
    const res = await fetch('/api/state');
    state = await res.json();
  } catch (e) {
    console.log('could not load archive state; starting empty:', e);
    state = { version: 1, archived: [], archivedAt: {}, plots: {}, updatedAt: 0 };
  }
  baseUpdatedAt = state.updatedAt;
  baseSnapshot = structuredClone(state);
  lastPlotsSignature = JSON.stringify(state.plots || {});
  renderHiddenList();
}

async function openAgentSession(sessionId) {
  const errorEl = document.getElementById('open-error');
  errorEl.textContent = '';
  try {
    const res = await fetch('/api/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    if (!res.ok) {
      errorEl.textContent = 'Could not open the session.';
    }
  } catch (e) {
    errorEl.textContent = 'Could not open the session.';
  }
}

async function newSessionForAgent(cwd) {
  const errorEl = document.getElementById('open-error');
  errorEl.textContent = '';
  try {
    const res = await fetch('/api/new-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: cwd }),
    });
    if (!res.ok) {
      errorEl.textContent = 'Could not start a new session.';
    }
  } catch (e) {
    errorEl.textContent = 'Could not start a new session.';
  }
}

async function revealAgentFolder(cwd) {
  const errorEl = document.getElementById('open-error');
  errorEl.textContent = '';
  try {
    const res = await fetch('/api/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder: cwd }),
    });
    if (!res.ok) {
      errorEl.textContent = 'Could not open the folder.';
    }
  } catch (e) {
    errorEl.textContent = 'Could not open the folder.';
  }
}

// T-12 — drag panning with drag-vs-click distinction. No separate 'click'
// listener is needed: mouseup already KNOWS whether total movement exceeded
// dragMoved, so selection hit testing happens there only when no pan occurred.
// This is simpler than tracking a second state merely to suppress the click.
const DRAG_THRESHOLD_PX = 4;
let isDragging = false;
let dragMoved = false;
let dragStartX = 0;
let dragStartY = 0;
let lastMouseX = 0;
let lastMouseY = 0;

canvas.addEventListener('mousedown', (event) => {
  const rect = canvas.getBoundingClientRect();
  isDragging = true;
  dragMoved = false;
  dragStartX = lastMouseX = event.clientX - rect.left;
  dragStartY = lastMouseY = event.clientY - rect.top;
});

window.addEventListener('mousemove', (event) => {
  if (!isDragging) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  if (!dragMoved) {
    const totalDx = x - dragStartX;
    const totalDy = y - dragStartY;
    if (Math.sqrt(totalDx * totalDx + totalDy * totalDy) > DRAG_THRESHOLD_PX) dragMoved = true;
  }

  const dx = x - lastMouseX;
  const dy = y - lastMouseY;
  camera.x -= dx / camera.zoom;
  camera.y -= dy / camera.zoom;
  lastMouseX = x;
  lastMouseY = y;
  draw();
});

window.addEventListener('mouseup', (event) => {
  if (!isDragging) return;
  isDragging = false;
  if (dragMoved) return; // this was a pan, not a selection

  const rect = canvas.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;
  const worldClick = screenToWorld(clickX, clickY);

  // T-11 — hit test the current DISPLAYED agentMovement position, not the
  // target position: a moving agent must be clickable where it is actually
  // drawn. T-12: compare in WORLD coordinates with a zoom-invariant radius.
  selectedSessionId = null;
  for (const agent of agents) {
    if (!agent.alive) continue;
    if (state.archived.includes(agent.sessionId)) continue;
    const entry = agentMovement.get(agent.sessionId);
    if (!entry) continue;
    const dx = worldClick.x - entry.x;
    const dy = worldClick.y - entry.y;
    if (Math.sqrt(dx * dx + dy * dy) <= CIRCLE_RADIUS) {
      selectedSessionId = agent.sessionId;
      break;
    }
  }

  draw();
  renderDetails();
});

// T-12 — cursor-anchored wheel zoom: the world point beneath the cursor stays
// exactly under the cursor before and after the zoom change.
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const cursorX = event.clientX - rect.left;
  const cursorY = event.clientY - rect.top;

  const before = screenToWorld(cursorX, cursorY);
  camera.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * (1 - event.deltaY * 0.001)));
  camera.x = before.x - (cursorX - canvas.width / 2) / camera.zoom;
  camera.y = before.y - (cursorY - canvas.height / 2) / camera.zoom;

  draw();
}, { passive: false });

// T-12 — full-screen Canvas, resized on load and window resize.
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  draw();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

async function tick() {
  const res = await fetch('/api/agents');
  agents = await res.json();
  for (const agent of agents) {
    knownAgentNames[agent.sessionId] = agent.name;
  }
  updateZones();
  draw();
  renderDetails();
  renderHiddenList();
}

initState().then(() => {
  tick();
  setInterval(tick, POLL_INTERVAL_MS);
});

setInterval(() => {
  currentFrame = (currentFrame + 1) % SPRITE_FRAME_COUNT;
  draw();
}, SPRITE_ANIMATION_INTERVAL_MS);

// T-11 — movement loop separate from the sprite animation loop above. It
// advances agentMovement (spawn/walk/leave) at MOVEMENT_TICK_MS and rerenders
// so movement is fluid rather than updating only at each 125ms frame change.
setInterval(() => {
  updateAgentMovement();
  draw();
}, MOVEMENT_TICK_MS);
