// public/world.js — RF-05b: randare statică (Canvas 2D) a zonelor hărții,
// din `/api/world`. RF-05c adaugă pawn-ii per post persistent, cu o pulsație
// minimă bazată pe timp pentru cei care lucrează confirmat (`working: true`,
// nu queued/paused — vezi server.js). RF-05e înlocuiește formele procedurale
// (teren/clădire din RF-05d, cerc+inițială din RF-05c) cu sprite-uri reale
// din pachetul Tiny Swords, deja exportate și folosite de jocul vechi
// (`public/game.js`) — teren = pattern de iarbă decupat, clădire = tower.png,
// pawn-i = pawn-idle.png/pawn-run.png cu cadre. Fără mișcare de poziție
// (pawn-ul stă fix în slot), fără click/hover/selecție (lot separat,
// neaprobat încă).
//
// ANTI-XSS: tot textul desenat (numele proiectului) trece prin
// `ctx.fillText` — sigur prin natura API-ului Canvas (nu interpretează
// HTML). Nu se creează niciun element DOM cu `innerHTML` din datele primite
// de la `/api/world` (nu există altă listă/legendă în HTML în afara
// canvas-ului).
//
// Polling propriu, single-flight, cu request token — aceeași disciplină ca
// `pollOnce()` din hud.js (RF-04), dar modul separat: nu reutilizează ciclul
// de poll de acolo, ca lotul hărții să rămână testabil/verificabil
// independent de ecranul de tabele.

(function () {

const POLL_INTERVAL_MS = 3000;

// Raza hexagonului (centru-la-colț), în pixeli. Aleasă ca 8-9 celule să
// încapă lejer pe un ecran de laptop obișnuit fără scroll orizontal, la
// zoom implicit — nu vine dintr-o măsurătoare a sursei (acolo unitățile
// sunt 3D, nu pixeli).
const CELL = 34;
// Ușor mai mic decât CELL, ca hexagoanele vecine să nu se atingă perfect pe
// margine — lasă un gol vizibil între zone diferite, la fel ca inset-ul
// `TILE = CELL * 0.992` din sursă (acolo motivat de z-fighting 3D; aici pur
// vizual, ca zonele să se distingă clar una de alta).
const TILE = CELL * 0.92;

// RF-05e — teren: petic de iarbă decupat din terrain-tilemap.png (Tiny
// Swords), tehnică și coordonate portate EXACT din `public/game.js`
// (T-13/T-15, GRASS_PATCH_SX/SY/SIZE = 40/60/64) — deja verificate vizual
// acolo, nu inventate din nou aici.
const GRASS_PATCH_SX = 40;
const GRASS_PATCH_SY = 60;
const GRASS_PATCH_SIZE = 64;

const terrainImage = new Image();
let grassPattern = null; // rămâne null până la onload — draw() are fallback, vezi drawGround
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

// RF-05e — clădire: tower.png (Tiny Swords), o singură variantă (albastru)
// pentru toate zonele — nu se tintuiește/recolorează în acest lot (ar cere
// compunere de canale suplimentară, în afara scopului). Ancorată la BAZA
// turnului (ca `drawTower` din game.js), la unghi 0 (spre dreapta), rază și
// dimensiuni alese astfel încât toate cele 4 colțuri ale dreptunghiului
// destinație să rămână strict în interiorul hexagonului — verificat prin
// calcul explicit față de muchia reală a hexagonului (nu față de raza TILE
// ca la un cerc, lecția din respingerea RF-05d, vezi raportul coder-ului
// pentru calculul complet).
const TOWER_RADIUS_RATIO = 0.70;
const TOWER_DEST_WIDTH_RATIO = 0.14;
const TOWER_DEST_HEIGHT_RATIO = 0.32;

const towerImage = new Image();
let towerImageLoaded = false;
towerImage.onload = () => { towerImageLoaded = true; };
towerImage.src = '/sprites/tower.png';

// RF-05e — pawn-i: pawn-idle.png (8 cadre)/pawn-run.png (6 cadre), sheet-uri
// de 192x192px per cadru, tehnică de decupare portată din game.js.
const PAWN_SPRITE_FRAME_SIZE = 192;
const PAWN_IDLE_FRAME_COUNT = 8;
const PAWN_RUN_FRAME_COUNT = 6;
// Durata unui cadru de mers — aleasă rezonabil pentru o animație de lucru
// lizibilă, nu portată dintr-o valoare a jocului vechi (acolo bucla nu avea
// o durată explicită per cadru, ci avansa cu ciclul global de redesenare).
const PAWN_RUN_FRAME_DURATION_MS = 120;
// Dimensiune destinație aleasă mic, verificată geometric (vezi raport) la
// cel mai strâns caz — sloturile din inelul exterior, unde clearance-ul
// față de muchia hexagonului e minim.
const PAWN_SPRITE_DEST_SIZE = 11;

const pawnIdleImage = new Image();
let pawnIdleImageLoaded = false;
pawnIdleImage.onload = () => { pawnIdleImageLoaded = true; };
pawnIdleImage.src = '/sprites/pawn-idle.png';

const pawnRunImage = new Image();
let pawnRunImageLoaded = false;
pawnRunImage.onload = () => { pawnRunImageLoaded = true; };
pawnRunImage.src = '/sprites/pawn-run.png';

const canvas = document.getElementById('world-canvas');
const ctx = canvas.getContext('2d');

// Ultimele zone primite — păstrate ca să putem redesena la resize fără să
// mai așteptăm următorul ciclu de sondare.
let zones = [];
// RF-05c: ultimii pawn primiți — la fel, păstrați pentru resize.
let pawns = [];

// RF-05c: id-ul buclei `requestAnimationFrame` curente, sau null dacă bucla
// nu rulează. Pornită/oprită doar la poll (nu la fiecare cadru) — vezi
// `updateAnimationLoop()`.
let rafId = null;

// Token de cerere — aceeași gardă ca în hud.js: un răspuns care ajunge după
// ce alt ciclu mai nou a pornit deja nu se mai aplică peste starea curentă.
let requestToken = 0;

/** Conversie axial flat-top -> plan (2D), formula identică cu hexToWorld din
 * sursă; a doua axă (r) devine Y de canvas în loc de Z de scenă 3D. */
function hexToWorld(q, r, size) {
  return { x: size * 1.5 * q, y: size * Math.sqrt(3) * (r + q / 2) };
}

/** Colțul i al unui hexagon flat-top centrat în (cx, cy). */
function corner(cx, cy, i, size) {
  const a = (Math.PI / 3) * i;
  return { x: cx + size * Math.cos(a), y: cy + size * Math.sin(a) };
}

/** Cele 7 sloturi ale unei celule, în coordonate locale celulei: centrul,
 * plus un inel de 6 la unghi fix și rază `TILE * 0.58` — geometria portată
 * din `_buildSlots` (bot-crossing), fără nimic din Three.js. */
function slotsForCell(cx, cy) {
  const slots = [{ x: cx, y: cy }];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    slots.push({ x: cx + Math.cos(a) * TILE * 0.58, y: cy + Math.sin(a) * TILE * 0.58 });
  }
  return slots;
}

function resizeCanvasForDPR() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  // Desenăm mereu în coordonate CSS (nu în pixeli fizici) — scalarea
  // contextului la `dpr` face ca textul/liniile să rămână clare pe ecrane
  // HiDPI fără să dublăm manual fiecare coordonată.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: rect.width, height: rect.height };
}

function draw() {
  const { width, height } = resizeCanvasForDPR();
  ctx.clearRect(0, 0, width, height);

  // Centrăm harta pe baza centrelor tuturor celulelor din toate zonele —
  // altfel un layout care crește doar spre o parte ar deriva vizual în
  // afara canvas-ului.
  const centers = [];
  for (const zone of zones) {
    for (const cell of zone.cells) {
      centers.push(hexToWorld(cell.q, cell.r, CELL));
    }
  }
  let originX = width / 2;
  let originY = height / 2;
  if (centers.length) {
    const minX = Math.min(...centers.map((c) => c.x));
    const maxX = Math.max(...centers.map((c) => c.x));
    const minY = Math.min(...centers.map((c) => c.y));
    const maxY = Math.max(...centers.map((c) => c.y));
    originX = width / 2 - (minX + maxX) / 2;
    originY = height / 2 - (minY + maxY) / 2;
  }

  // RF-05d: terenul se desenează ÎNAINTE de orice altceva (chiar și fără
  // nicio zonă), ca harta să nu mai pară pe fundal negru gol.
  drawGround(originX, originY);

  if (!zones.length) return;

  for (const zone of zones) {
    if (!zone.cells.length) continue;
    for (const cell of zone.cells) {
      const { x: wx, y: wy } = hexToWorld(cell.q, cell.r, CELL);
      const cx = originX + wx;
      const cy = originY + wy;

      // Hexagonul zonei, umplut cu accentul ei.
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const p = corner(cx, cy, i, TILE);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fillStyle = zone.accent;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Sloturile goale — marcaje mici, desenate pentru toate cele 7 sloturi
      // ale celulei; cele ocupate primesc pawn-ul lor peste, mai jos (`drawPawns`).
      for (const slot of slotsForCell(cx, cy)) {
        ctx.beginPath();
        ctx.arc(slot.x, slot.y, 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Numele proiectului, o singură dată per zonă, lângă rădăcină (index 0).
    const root = hexToWorld(zone.cells[0].q, zone.cells[0].r, CELL);
    const labelX = originX + root.x;
    const labelY = originY + root.y - TILE - 6;

    // RF-05d: clădirea proiectului, o singură dată per zonă, la celula
    // rădăcină — înainte de pawn-uri, ca aceștia să rămână deasupra ei.
    drawBuilding(originX + root.x, originY + root.y);

    ctx.font = '600 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    // Contur negru + text alb, ca numele să rămână lizibil indiferent de
    // accentul zonei de dedesubt.
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.strokeText(zone.project, labelX, labelY);
    ctx.fillStyle = '#f4f2ee';
    ctx.fillText(zone.project, labelX, labelY);
  }

  drawPawns(originX, originY);
}

/** RF-05e: fundal de teren — pattern de iarbă decupat din terrain-tilemap.png
 * (Tiny Swords), portat exact din `public/game.js` (tehnică + coordonate de
 * decupare identice). Cât timp imaginea sursă nu s-a încărcat încă
 * (`grassPattern` e `null`), desenăm un fallback discret cu o culoare solidă
 * apropiată de verde — restul desenului (hexagoane/pawn-i) nu așteaptă după
 * teren, se desenează oricum peste. */
function drawGround(originX, originY) {
  let radius = TILE * 3;
  if (zones.length) {
    const centers = [];
    for (const zone of zones) {
      for (const cell of zone.cells) {
        centers.push(hexToWorld(cell.q, cell.r, CELL));
      }
    }
    if (centers.length) {
      const minX = Math.min(...centers.map((c) => c.x));
      const maxX = Math.max(...centers.map((c) => c.x));
      const minY = Math.min(...centers.map((c) => c.y));
      const maxY = Math.max(...centers.map((c) => c.y));
      radius = Math.max(maxX - minX, maxY - minY) / 2 + TILE * 2.5;
    }
  }

  ctx.beginPath();
  ctx.arc(originX, originY, radius, 0, Math.PI * 2);
  ctx.fillStyle = grassPattern || '#3a4a34';
  ctx.fill();
}

/** RF-05e: clădirea — tower.png (Tiny Swords), o singură dată per zonă, la
 * celula rădăcină. Ancorată la BAZA turnului (nu centru — turnul crește în
 * sus de la bază), unghi 0 (spre dreapta), la `TILE * TOWER_RADIUS_RATIO`.
 * Dimensiuni/poziție alese conservator și verificate prin calcul (vezi
 * raportul coder-ului) față de muchiile reale ale hexagonului, nu față de
 * `TILE` ca rază de cerc. */
function drawBuilding(cx, cy) {
  if (!towerImageLoaded) return;
  const bx = cx + TILE * TOWER_RADIUS_RATIO;
  const by = cy;
  const destW = TILE * TOWER_DEST_WIDTH_RATIO;
  const destH = TILE * TOWER_DEST_HEIGHT_RATIO;
  ctx.drawImage(towerImage, bx - destW / 2, by - destH, destW, destH);
}

/** RF-05e: desenul pawn-ilor — sprite Tiny Swords pe poziția exactă din
 * `slotsForCell`, nu mai desenăm cerc+inițială. `working === false` -> un
 * singur cadru static din pawn-idle.png (cadrul 0, fără animație — nu costă
 * ciclu de redesenare pentru cineva care nu lucrează). `working === true` ->
 * ciclare pe cele `PAWN_RUN_FRAME_COUNT` cadre din pawn-run.png, pe bază de
 * timp real (`performance.now()`, nu numărul de cadre desenate), cu excepția
 * reduced-motion, unde rămâne un singur cadru static din pawn-run.png
 * (cadrul 0) — lucrul confirmat trebuie să rămână vizibil distinct de idle,
 * dar fără mișcare. */
function drawPawns(originX, originY) {
  if (!pawns.length) return;
  const nowMs = performance.now();
  const reduced = prefersReducedMotion();

  for (const pawn of pawns) {
    const zone = zones.find((z) => z.project === pawn.project);
    if (!zone) continue; // proiectul a dispărut de la ultimul poll

    // Convenția slot_index = cellIndex * 7 + localSlotIndex (identică cu
    // backend-ul, world.js/server.js).
    const cellIndex = Math.floor(pawn.slotIndex / 7);
    const localSlotIndex = pawn.slotIndex % 7;
    const cell = zone.cells[cellIndex];
    if (!cell) continue; // pawn „orfan" — caz limită tranzitoriu, sărit silențios

    const { x: wx, y: wy } = hexToWorld(cell.q, cell.r, CELL);
    const cx = originX + wx;
    const cy = originY + wy;
    const pos = slotsForCell(cx, cy)[localSlotIndex];
    if (!pos) continue;

    let spriteImage;
    let spriteLoaded;
    let frameCount;
    let frame;
    if (pawn.working) {
      spriteImage = pawnRunImage;
      spriteLoaded = pawnRunImageLoaded;
      frameCount = PAWN_RUN_FRAME_COUNT;
      frame = reduced ? 0 : Math.floor(nowMs / PAWN_RUN_FRAME_DURATION_MS) % frameCount;
    } else {
      spriteImage = pawnIdleImage;
      spriteLoaded = pawnIdleImageLoaded;
      frameCount = PAWN_IDLE_FRAME_COUNT;
      frame = 0;
    }
    if (!spriteLoaded) continue; // imaginea nu s-a încărcat încă — sărit silențios, ca la clădire

    // sizeFactor vine fix 1 de la server în acest lot (RF-06 îl va face
    // variabil din usage real) — folosit deja ca multiplicator de dimensiune,
    // ca să nu fie nevoie de nicio rescriere a randării când RF-06 trimite
    // alte valori.
    const size = PAWN_SPRITE_DEST_SIZE * (pawn.sizeFactor || 1);
    ctx.drawImage(
      spriteImage,
      frame * PAWN_SPRITE_FRAME_SIZE, 0, PAWN_SPRITE_FRAME_SIZE, PAWN_SPRITE_FRAME_SIZE,
      pos.x - size / 2, pos.y - size / 2, size, size
    );
  }
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** RF-05c: pornește/oprește bucla `requestAnimationFrame`, apelată doar la
 * poll (nu la fiecare cadru) — bucla rulează DOAR cât timp există cel puțin
 * un pawn `working: true` ȘI reduced-motion e fals; altfel desenul rămâne
 * static (redesenat doar la poll/resize, ca la RF-05b), fără cost de
 * CPU/baterie degeaba. */
function updateAnimationLoop() {
  const shouldAnimate = !prefersReducedMotion() && pawns.some((p) => p.working);
  if (shouldAnimate && rafId === null) {
    const loop = () => {
      draw();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  } else if (!shouldAnimate && rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

async function pollOnce() {
  const myToken = ++requestToken;
  try {
    const res = await fetch('/api/world');
    if (!res.ok) throw new Error('răspuns non-OK de la /api/world');
    const body = await res.json();
    if (myToken !== requestToken) return; // răspuns vechi — un ciclu mai nou a preluat deja
    zones = body.zones || [];
    pawns = body.pawns || [];
    updateAnimationLoop();
    draw();
  } catch (e) {
    // eșecul de sondare nu are indicator propriu în acest lot — harta pur
    // și simplu rămâne cu ultimul desen valid.
  } finally {
    setTimeout(pollOnce, POLL_INTERVAL_MS);
  }
}

window.addEventListener('resize', draw);

pollOnce();

})();
