// agent-map — randare pe canvas cu sprite-ul de muncitor (Tiny Swords, idle loop)

const POLL_INTERVAL_MS = 3000;

const GRID_COLS = 8;
const GRID_ROWS = 8;
const CELL_SIZE = 80;
const GRID_OFFSET = 40; // distanță de la marginea canvas-ului până la prima celulă

const CIRCLE_RADIUS = 28; // folosit ca rază pentru hit-test-ul de click
const COLOR_WORKING = '#2A5FAE';
const COLOR_WAITING = '#B4801E';
const COLOR_SLEEPING = '#888';
const COLOR_DEFAULT = '#888';

// T-10 — o zonă per proiect, culoare ciclată dintr-o paletă mică fixă
// (aceleași nuanțe ca indicatorii de status, plus câteva neutre), aleasă
// prin hash pe id-ul proiectului (cwd) — stabilă indiferent de ordinea
// proiectelor la un tick sau altul.
const ZONE_PALETTE = [
  { fill: 'rgba(42, 95, 174, 0.18)', stroke: '#2A5FAE' },
  { fill: 'rgba(180, 128, 30, 0.18)', stroke: '#B4801E' },
  { fill: 'rgba(76, 159, 76, 0.18)', stroke: '#4C9F4C' },
  { fill: 'rgba(155, 77, 202, 0.18)', stroke: '#9B4DCA' },
  { fill: 'rgba(201, 76, 76, 0.18)', stroke: '#C94C4C' },
  { fill: 'rgba(76, 184, 201, 0.18)', stroke: '#4CB8C9' },
];
const ZONE_JITTER_RADIUS = 12; // deplasare aplicată când mai mulți agenți din același proiect cad pe aceeași celulă

const SPRITE_FRAME_SIZE = 192; // fiecare cadru din sheet e 192x192px
const SPRITE_FRAME_COUNT = 8; // 8 cadre de idle, așezate orizontal
const RUN_SPRITE_FRAME_COUNT = 6; // 6 cadre de alergare, așezate orizontal
const SPRITE_ANIMATION_INTERVAL_MS = 125; // 8 cadre/secundă
const SPRITE_DEST_SIZE = 56; // dimensiunea desenată pe canvas
const STATUS_DOT_RADIUS = 6;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const detailsEl = document.getElementById('details');
const hiddenPanelEl = document.getElementById('hidden-panel');

// T-12 — camera 2D: sistem de coordonate LUME, separat de pixelii de ecran.
// camera.x/y = punctul din LUME aflat curent în centrul ecranului.
// Zoom ancorat pe cursor (principiu portat din bot-crossing, src/core/camera.js:
// "The wheel zooms at the cursor... the ground point under the pointer is held
// still while the camera dollies"), cu matematică 2D simplă (nu portăm codul lor).
const camera = { x: 0, y: 0, zoom: 1 };
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

// T-11 — mișcare reală: agenții apar la SPAWN_POINT, merg spre poziția lor
// din zonă, și se întorc la SPAWN_POINT înainte să dispară. Portat din
// bot-crossing (src/agents/astronauts.js), fără pathfinding/steering — canvas
// 2D plat, fără obstacole, deci linie dreaptă e suficientă.
// T-12 — SPAWN_POINT e originea lumii: la camera implicită ({x:0,y:0,zoom:1})
// cade exact în centrul ecranului (worldToScreen(0,0) = centrul canvas-ului).
const SPAWN_POINT = { x: 0, y: 0 };
const MOVEMENT_TICK_MS = 50; // 20 pași/secundă
const WALK_SPEED = 140; // px/secundă
const ARRIVE_RADIUS = 6; // px
const SPAWN_SCALE_RATE = 3; // scale/secundă la apariție
const LEAVING_SHRINK_RATE = 2.2; // scale/secundă la plecare
const MOVEMENT_DT = MOVEMENT_TICK_MS / 1000;

let agents = []; // ultimul răspuns de la /api/agents
let selectedSessionId = null;

// T-11 — poziția AFIȘATĂ curentă a fiecărui agent, separată de poziția-țintă
// din zonă (computeAgentPositions). Actualizată de updateAgentMovement() la
// fiecare MOVEMENT_TICK_MS; draw() și hit-test-ul de click citesc de aici, nu
// poziția-țintă brută — un agent în mișcare trebuie desenat/clicabil acolo
// unde e efectiv, nu unde va ajunge.
const agentMovement = new Map(); // sessionId -> { state, x, y, scale, stateAge, name, activity }

// T-07 — persistența arhivării (vezi state.js + public/merge-state.js).
// `state` e copia locală de lucru; `baseSnapshot`/`baseUpdatedAt` sunt
// ultima versiune confirmată de server, folosită ca bază pentru merge la 409.
let state = { version: 1, archived: [], archivedAt: {}, plots: {}, updatedAt: 0 };
let baseUpdatedAt = 0;
let baseSnapshot = { version: 1, archived: [], archivedAt: {}, plots: {}, updatedAt: 0 };
let pendingSave = null;
let showHidden = false;
let knownAgentNames = {}; // sessionId -> name, ca să afișăm numele agenților ascunși care nu mai sunt live

// T-10 — semnătura ultimului layout de zone salvat (tiparul din bot-crossing,
// src/main.js): recalculăm la fiecare tick, dar salvăm pe disc doar când
// layout-ul chiar diferă de ultimul salvat, altfel am scrie la fiecare poll.
let lastPlotsSignature = null;

// T-13 — fundal de apă (tileable) + petic de iarbă decupat din terrain-tilemap
// (Tiny Swords), în loc de fundal gri/culoare plată. Pattern-urile se creează
// o singură dată, după încărcarea imaginii sursă, și rămân fixe (nu urmăresc
// camera/zoom-ul — vezi raportul T-13).
const GRASS_PATCH_SX = 40;
const GRASS_PATCH_SY = 60;
const GRASS_PATCH_SIZE = 64;

const waterImage = new Image();
let waterPattern = null;
waterImage.onload = () => {
  waterPattern = ctx.createPattern(waterImage, 'repeat');
};
waterImage.src = '/sprites/water-bg.png';

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

// T-14 — decorațiuni pe zone (tufe animate + stânci statice) + nori care
// plutesc peste apă, ca terenul să nu mai arate ca un dreptunghi plat.
const BUSH_FRAME_SIZE = 128; // 8 cadre de 128x128, așezate orizontal
const BUSH_FRAME_COUNT = 8;
const ROCK_SIZE = 64; // nativ, static
const DECORATION_DEST_SIZE = CELL_SIZE / 2; // desenată mai mică decât celula
const DECORATION_OFFSET = 4; // px, distanță față de colțul celulei

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

const CLOUD_DEST_WIDTH = 180;
const CLOUD_DEST_HEIGHT = 80;

const cloud1Image = new Image();
let cloud1ImageLoaded = false;
cloud1Image.onload = () => { cloud1ImageLoaded = true; };
cloud1Image.src = '/sprites/cloud1.png';

const cloud2Image = new Image();
let cloud2ImageLoaded = false;
cloud2Image.onload = () => { cloud2ImageLoaded = true; };
cloud2Image.src = '/sprites/cloud2.png';

// Poziții proprii, în spațiul de ECRAN (ambientale, ca fundalul de apă — nu
// urmăresc camera/zoom-ul). Actualizate la bucla de mișcare (MOVEMENT_TICK_MS,
// aceeași folosită pentru agenți — motivat în raportul T-14).
const clouds = [
  { image: 'cloud1', x: 100, y: 80, speed: 8 },
  { image: 'cloud2', x: 500, y: 150, speed: 5 },
  { image: 'cloud1', x: 900, y: 60, speed: 10 },
];

// Decide DETERMINIST (din hash, nu Math.random()) dacă o celulă a unei zone
// primește o decorațiune — poziția trebuie stabilă între desenări, la fel ca
// poziționarea agenților pe hash.
function decorationForCell(projectId, cell) {
  const h = hashToCellIndex(projectId + ':' + cell.x + ',' + cell.y);
  if (h % 3 === 0) return { type: 'bush' };
  if (h % 3 === 1) return { type: 'rock', variant: h % 2 }; // 0=rock1, 1=rock2
  return null; // 1 din 3 celule rămâne goală, ca să nu fie prea aglomerat
}

function drawClouds() {
  for (const cloud of clouds) {
    const image = cloud.image === 'cloud1' ? cloud1Image : cloud2Image;
    const loaded = cloud.image === 'cloud1' ? cloud1ImageLoaded : cloud2ImageLoaded;
    if (!loaded) continue;
    ctx.drawImage(image, cloud.x, cloud.y, CLOUD_DEST_WIDTH, CLOUD_DEST_HEIGHT);
  }
}

function updateClouds() {
  for (const cloud of clouds) {
    cloud.x += cloud.speed * MOVEMENT_DT;
    if (cloud.x > canvas.width) cloud.x = -CLOUD_DEST_WIDTH;
  }
}

const pawnImage = new Image();
let pawnImageLoaded = false;
pawnImage.onload = () => {
  pawnImageLoaded = true;
};
pawnImage.src = '/sprites/pawn-idle.png';

// T-11 — sprite de alergare, folosit cât timp un agent e 'walking'/'leaving'.
const pawnRunImage = new Image();
let pawnRunImageLoaded = false;
pawnRunImage.onload = () => {
  pawnRunImageLoaded = true;
};
pawnRunImage.src = '/sprites/pawn-run.png';

let currentFrame = 0;

// Poziția pe grilă se calculează dintr-un hash al sessionId, nu din index-ul
// în array-ul primit de la server. Motiv: dacă ordinea agenților se schimbă
// între două poll-uri (unul apare/dispare), un agent existent nu trebuie să
// sară în altă celulă — poziția lui trebuie să fie stabilă în timp.
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

// T-10 — poziționarea per proiect. `cellIndexToPosition`/grila globală de mai
// sus nu mai poziționează nimic (păstrată doar pentru că testele existente
// încă o exercită direct — vezi raportul de predare).

// T-12 — întoarce coordonate de LUME (nu de ecran); conversia la pixeli se
// face doar la desenare, via worldToScreen().
function zoneCellToPixels(cell) {
  return {
    x: cell.x * CELL_SIZE,
    y: cell.y * CELL_SIZE,
  };
}

function colorForProject(projectId) {
  return ZONE_PALETTE[hashToCellIndex(projectId) % ZONE_PALETTE.length];
}

// Un agent își alege celula din zona proiectului lui printr-un hash pe
// sessionId — poziție stabilă, nu recalculată din ordinea din array.
function cellForAgent(agent, projectCells) {
  if (!projectCells || projectCells.length === 0) return { x: 0, y: 0 }; // fallback: proiectul n-a primit nicio celulă (pool epuizat)
  const index = hashToCellIndex(agent.sessionId) % projectCells.length;
  return projectCells[index];
}

// computeAgentPositions — poziția-ȚINTĂ în pixeli a fiecărui agent viu (unde
// AR TREBUI să fie, în zona lui), cu jitter pentru cei care cad pe aceeași
// celulă din același proiect (hash-ul nu garantează distribuție unică).
// T-11: rezultatul e folosit de updateAgentMovement() ca destinație de mers —
// draw()/click-ul folosesc poziția AFIȘATĂ din agentMovement, nu asta direct.
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

// T-11 — mișcă `entry` cu până la `WALK_SPEED*MOVEMENT_DT` px spre
// (targetX,targetY). Întoarce true dacă a ajuns (distanță < ARRIVE_RADIUS sau
// pasul depășește distanța rămasă), caz în care poziția se fixează exact pe
// țintă, nu doar "aproape".
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

// T-11 — un pas al mișcării reale: spawning -> walking -> at-site -> leaving
// -> (dispariție din agentMovement). Rulează separat de bucla de animație a
// sprite-ului (SPRITE_ANIMATION_INTERVAL_MS), la MOVEMENT_TICK_MS.
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
      // Agentul a dispărut din lista de agenți vii (arhivat sau proces mort)
      // — inclusiv dacă abia apăruse (spawning) sau era pe drum (walking):
      // trece direct în leaving, ca să se întoarcă la SPAWN_POINT înainte
      // să dispară complet, nu se șterge instant din agentMovement.
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
      // ȘI, nu SAU: scale-ul ajunge la 0 mult mai repede (~0.45s) decât drumul
      // de întoarcere la SPAWN_POINT pentru un agent departe pe ecran — cu
      // "SAU" ar dispărea brusc la mijlocul ecranului, nu la punctul de
      // ieșire. Dispare doar când chiar a ajuns ȘI s-a micșorat complet.
      if (arrived && entry.scale <= 0) {
        agentMovement.delete(sessionId);
      }
    }
  }
}

// drawZones — fundalul, desenat înainte de agenți: un dreptunghi per celulă
// din zona fiecărui proiect, plus numele proiectului (doar ultimul segment
// al căii) deasupra celulei celei mai de sus (cea mai de stânga, la egalitate).
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
      ctx.fillStyle = grassPattern || palette.fill;
      ctx.strokeStyle = palette.stroke;
      ctx.lineWidth = 1;
      ctx.fillRect(pos.x - cellSizeScreen / 2, pos.y - cellSizeScreen / 2, cellSizeScreen, cellSizeScreen);
      ctx.strokeRect(pos.x - cellSizeScreen / 2, pos.y - cellSizeScreen / 2, cellSizeScreen, cellSizeScreen);
      if (cell.y < topCell.y || (cell.y === topCell.y && cell.x < topCell.x)) topCell = cell;

      // T-14 — decorațiune fixă (din hash), poziționată în colțul
      // dreapta-jos al celulei, ca să nu se suprapună cu agenții (centrul).
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

// updateZones — recalculează zonele din agenții vii curenți (T-08:
// zones.js/allocateCells) și salvează doar dacă layout-ul chiar s-a
// schimbat față de ultima salvare (tiparul din bot-crossing, src/main.js).
function updateZones() {
  const counts = {};
  for (const agent of agents) {
    if (!agent.alive || state.archived.includes(agent.sessionId)) continue;
    counts[agent.cwd] = (counts[agent.cwd] || 0) + 1;
  }
  const projects = Object.entries(counts)
    .map(([id, size]) => ({ id, size }))
    .sort((a, b) => b.size - a.size); // cel mai mare primul, cum cere zones.js

  const previousMap = new Map(Object.entries(state.plots || {}));
  const newPlotsMap = allocateCells(projects, previousMap);
  const newPlots = Object.fromEntries(newPlotsMap);

  const signature = JSON.stringify(newPlots);
  if (signature !== lastPlotsSignature) {
    lastPlotsSignature = signature;
    state.plots = newPlots;
    queueSave();
  } else {
    state.plots = newPlots; // aceleași date, doar actualizăm referința, fără salvare
  }
}

function colorForActivity(activity) {
  if (activity === 'working') return COLOR_WORKING;
  if (activity === 'waiting') return COLOR_WAITING;
  if (activity === 'sleeping') return COLOR_SLEEPING;
  console.log('activity necunoscută:', activity);
  return COLOR_DEFAULT;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (waterPattern) {
    ctx.fillStyle = waterPattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawClouds();

  drawZones();

  // T-11 — se iterează agentMovement, nu agenții vii direct: un agent în
  // 'leaving' tot trebuie desenat cât "pleacă", chiar dacă nu mai apare în
  // /api/agents. Poziția/scala desenată vin din agentMovement (afișat
  // curent), nu din poziția-țintă brută.
  for (const [sessionId, entry] of agentMovement) {
    const screenPos = worldToScreen(entry.x, entry.y);
    const spriteSize = SPRITE_DEST_SIZE * entry.scale * camera.zoom;
    const spriteX = screenPos.x - spriteSize / 2;
    const spriteY = screenPos.y - spriteSize / 2;

    const running = entry.state === 'walking' || entry.state === 'leaving';
    const spriteImage = running ? pawnRunImage : pawnImage;
    const spriteLoaded = running ? pawnRunImageLoaded : pawnImageLoaded;
    const frameCount = running ? RUN_SPRITE_FRAME_COUNT : SPRITE_FRAME_COUNT;

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
    // innerHTML, nu doar textContent — panoul conține markup (butoane) de la
    // ultima selecție; golirea doar a textului lăsa butoanele vechi în DOM,
    // ascunse doar vizual prin clasa "hidden" (bug prins de testele T-07).
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
    <div><button id="open-btn">Open</button> <button id="hide-btn">Hide</button> <span id="open-error" class="open-error"></span></div>
  `;
  detailsEl.classList.remove('hidden');

  document.getElementById('open-btn').addEventListener('click', () => {
    openAgentSession(agent.sessionId);
  });
  document.getElementById('hide-btn').addEventListener('click', () => {
    hideAgent(agent.sessionId);
  });
}

// Ascunde un agent — tiparul optimist din bot-crossing (src/main.js,
// archiveThread): actualizăm local imediat, deselectăm, re-randăm, apoi
// programăm salvarea (debounce 500ms în queueSave).
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

// Listă minimă de agenți ascunși, ca să existe o cale înapoi (Unhide).
// Numele vin din `knownAgentNames`, populat la fiecare tick din /api/agents —
// altfel un agent ascuns care nu mai e live nu ar avea de unde să-și ia numele.
function renderHiddenList() {
  const count = state.archived.length;

  if (!showHidden) {
    hiddenPanelEl.innerHTML = `<button id="show-hidden-btn">Arată ascunși (${count})</button>`;
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
    <button id="hide-hidden-btn">Ascunde lista (${count})</button>
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

// queueSave/saveState — portate din bot-crossing (src/main.js queueSave +
// src/game/api.js saveState): debounce 500ms, apoi PUT cu baseUpdatedAt; la
// 409 facem merge pe 3 căi (merge-state.js) cu starea întoarsă de server și
// reîncercăm, până la 3 încercări în total.
function queueSave() {
  clearTimeout(pendingSave);
  pendingSave = setTimeout(async () => {
    try {
      state = await saveState(state, 0);
    } catch (e) {
      console.log('salvarea stării de arhivare a eșuat:', e);
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
      // am epuizat cele 3 încercări — renunțăm, coloana continuă local,
      // se reîncearcă la următoarea schimbare
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
    throw new Error('PUT /api/state a eșuat cu status ' + res.status);
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
    console.log('nu am putut încărca starea de arhivare, pornesc de la gol:', e);
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
      errorEl.textContent = 'nu am putut deschide sesiunea';
    }
  } catch (e) {
    errorEl.textContent = 'nu am putut deschide sesiunea';
  }
}

// T-12 — pan prin drag + distincție drag-vs-click. Nu folosim un listener
// separat de 'click': mouseup ȘTIE deja dacă mișcarea totală a depășit
// pragul (dragMoved), deci facem hit-test-ul de selecție direct acolo, doar
// când NU a fost pan — mai simplu decât să ținem o a doua stare doar pentru
// a suprima un 'click' care oricum ar urma.
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
  if (dragMoved) return; // a fost pan, nu selecție

  const rect = canvas.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;
  const worldClick = screenToWorld(clickX, clickY);

  // T-11 — hit-test pe poziția AFIȘATĂ curentă (agentMovement), nu pe
  // poziția-țintă: un agent în mișcare trebuie clicabil acolo unde e desenat
  // efectiv. T-12: comparat în coordonate de LUME, cu raza de hit-test
  // neschimbată de zoom.
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

// T-12 — zoom cu rotița, ancorat pe cursor: punctul de lume de sub cursor
// rămâne exact sub cursor înainte/după schimbarea zoom-ului.
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

// T-12 — canvas pe tot ecranul: redimensionat la încărcare și la resize.
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

// T-11 — buclă de mișcare, separată de bucla de animație a sprite-ului de mai
// sus: avansează agentMovement (spawn/mers/plecare) la MOVEMENT_TICK_MS și
// re-randează, ca mișcarea să se vadă fluid, nu doar la fiecare schimbare de
// cadru (125ms).
setInterval(() => {
  updateAgentMovement();
  updateClouds();
  draw();
}, MOVEMENT_TICK_MS);
