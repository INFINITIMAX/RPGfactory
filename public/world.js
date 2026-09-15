// public/world.js — RF-05b: randare statică (Canvas 2D) a zonelor hărții,
// din `/api/world`. Fără personaje, fără animație (RF-05c), fără
// click/hover/selecție (lot separat, neaprobat încă).
//
// ANTI-XSS: singurul text desenat e numele proiectului, prin `ctx.fillText`
// — sigur prin natura API-ului Canvas (nu interpretează HTML). Nu se
// creează niciun element DOM cu `innerHTML` din datele primite de la
// `/api/world` (nu există altă listă/legendă în HTML în afara canvas-ului).
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

const canvas = document.getElementById('world-canvas');
const ctx = canvas.getContext('2d');

// Ultimele zone primite — păstrate ca să putem redesena la resize fără să
// mai așteptăm următorul ciclu de sondare.
let zones = [];

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

  if (!zones.length) return;

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

      // Sloturile — marcaje mici, goale (fără personaje, RF-05c).
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
}

async function pollOnce() {
  const myToken = ++requestToken;
  try {
    const res = await fetch('/api/world');
    if (!res.ok) throw new Error('răspuns non-OK de la /api/world');
    const body = await res.json();
    if (myToken !== requestToken) return; // răspuns vechi — un ciclu mai nou a preluat deja
    zones = body.zones || [];
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
