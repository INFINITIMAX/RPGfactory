// Hartă Canvas 2D pentru consola principală. Modul izolat: consumă numai
// /api/world și comunică selecția prin evenimente DOM.
(function () {
  const POLL_INTERVAL_MS = 3000;
  const CELL = 82;
  const TILE = CELL * 0.94;
  const GRASS_PATCH_SX = 40;
  const GRASS_PATCH_SY = 60;
  const GRASS_PATCH_SIZE = 64;
  const FRAME = 192;
  const IDLE_FRAMES = 8;
  const RUN_FRAMES = 6;
  const RUN_FRAME_MS = 140;
  const PAWN_SIZE = 42;

  const canvas = document.getElementById('world-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const statusEl = document.getElementById('world-status');
  const pawnListEl = document.getElementById('world-pawn-list');
  const zoomInEl = document.getElementById('map-zoom-in');
  const zoomOutEl = document.getElementById('map-zoom-out');
  const resetEl = document.getElementById('map-reset');
  const zoomValueEl = document.getElementById('map-zoom-value');

  let zones = [];
  let pawns = [];
  let requestToken = 0;
  let rafId = null;
  let userZoom = 1;
  let panX = 0;
  let panY = 0;
  let selectedProfileId = null;
  let focusedProfileId = null;
  let hoveredProfileId = null;
  let hitTargets = [];
  let pointer = null;

  const terrainImage = new Image();
  let grassPattern = null;
  terrainImage.onload = () => {
    const patchCanvas = document.createElement('canvas');
    patchCanvas.width = GRASS_PATCH_SIZE;
    patchCanvas.height = GRASS_PATCH_SIZE;
    const patchCtx = patchCanvas.getContext('2d');
    patchCtx.drawImage(terrainImage, GRASS_PATCH_SX, GRASS_PATCH_SY, GRASS_PATCH_SIZE, GRASS_PATCH_SIZE, 0, 0, GRASS_PATCH_SIZE, GRASS_PATCH_SIZE);
    grassPattern = ctx.createPattern(patchCanvas, 'repeat');
    draw();
  };
  terrainImage.src = '/sprites/terrain-tilemap.png';

  function loadImage(src, onReady) {
    const image = new Image();
    image.onload = () => { onReady(); draw(); };
    image.src = src;
    return image;
  }
  let towerReady = false;
  let idleReady = false;
  let runReady = false;
  const towerImage = loadImage('/sprites/tower.png', () => { towerReady = true; });
  const idleImage = loadImage('/sprites/pawn-idle.png', () => { idleReady = true; });
  const runImage = loadImage('/sprites/pawn-run.png', () => { runReady = true; });

  function hexToWorld(q, r, size) {
    return { x: size * 1.5 * q, y: size * Math.sqrt(3) * (r + q / 2) };
  }

  function corner(cx, cy, index, size) {
    const angle = Math.PI / 3 * index;
    return { x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) };
  }

  function slotsForCell(cx, cy) {
    const slots = [{ x: cx, y: cy }];
    for (let index = 0; index < 6; index++) {
      const angle = Math.PI / 3 * index + Math.PI / 6;
      slots.push({ x: cx + Math.cos(angle) * TILE * .58, y: cy + Math.sin(angle) * TILE * .58 });
    }
    return slots;
  }

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function canvasSize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height, dpr };
  }

  function worldBounds() {
    const centers = [];
    for (const zone of zones) for (const cell of zone.cells || []) centers.push(hexToWorld(cell.q, cell.r, CELL));
    if (!centers.length) return { minX: -TILE, maxX: TILE, minY: -TILE, maxY: TILE };
    return {
      minX: Math.min(...centers.map((p) => p.x)) - TILE * 1.25,
      maxX: Math.max(...centers.map((p) => p.x)) + TILE * 1.25,
      minY: Math.min(...centers.map((p) => p.y)) - TILE * 1.45,
      maxY: Math.max(...centers.map((p) => p.y)) + TILE * 1.25,
    };
  }

  function camera(width, height) {
    const bounds = worldBounds();
    const worldWidth = Math.max(1, bounds.maxX - bounds.minX);
    const worldHeight = Math.max(1, bounds.maxY - bounds.minY);
    const fit = Math.min((width - 56) / worldWidth, (height - 56) / worldHeight, 2.1);
    const scale = Math.max(.45, fit) * userZoom;
    return {
      scale,
      x: width / 2 + panX - ((bounds.minX + bounds.maxX) / 2) * scale,
      y: height / 2 + panY - ((bounds.minY + bounds.maxY) / 2) * scale,
    };
  }

  function drawHex(cx, cy, size) {
    ctx.beginPath();
    for (let index = 0; index < 6; index++) {
      const point = corner(cx, cy, index, size);
      if (index === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
  }

  function drawGround(width, height) {
    ctx.fillStyle = grassPattern || '#263d2b';
    ctx.fillRect(0, 0, width, height);
    const gradient = ctx.createRadialGradient(width * .48, height * .42, 10, width * .48, height * .42, Math.max(width, height) * .8);
    gradient.addColorStop(0, 'rgba(20,35,27,0)');
    gradient.addColorStop(1, 'rgba(4,13,12,.58)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function drawDistrict(zone, cameraState) {
    const cells = zone.cells || [];
    for (const cell of cells) {
      const center = hexToWorld(cell.q, cell.r, CELL);
      drawHex(center.x, center.y, TILE);
      ctx.save();
      ctx.globalAlpha = .70;
      ctx.fillStyle = zone.accent;
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = 3 / cameraState.scale;
      ctx.strokeStyle = zone.accent;
      ctx.stroke();
      drawHex(center.x, center.y, TILE * .91);
      ctx.lineWidth = 1 / cameraState.scale;
      ctx.strokeStyle = 'rgba(235,244,226,.20)';
      ctx.stroke();
    }
    if (!cells.length) return;
    const root = hexToWorld(cells[0].q, cells[0].r, CELL);
    if (towerReady) {
      const width = 66;
      const height = 86;
      ctx.drawImage(towerImage, root.x - width / 2, root.y - height + 20, width, height);
    }
    ctx.font = '700 17px "Grenze", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 5 / cameraState.scale;
    ctx.strokeStyle = 'rgba(3,10,9,.92)';
    ctx.strokeText(zone.project, root.x, root.y - TILE - 10);
    ctx.fillStyle = '#f4f2e7';
    ctx.fillText(zone.project, root.x, root.y - TILE - 10);
  }

  function pawnPosition(pawn) {
    const zone = zones.find((item) => item.project === pawn.project);
    if (!zone) return null;
    const cell = (zone.cells || [])[Math.floor(pawn.slotIndex / 7)];
    if (!cell) return null;
    const center = hexToWorld(cell.q, cell.r, CELL);
    return slotsForCell(center.x, center.y)[pawn.slotIndex % 7] || null;
  }

  function drawPawns(cameraState) {
    const now = performance.now();
    const reduced = prefersReducedMotion();
    for (const pawn of pawns) {
      const pos = pawnPosition(pawn);
      if (!pos) continue;
      const selected = pawn.profileId === selectedProfileId;
      const size = PAWN_SIZE * Math.max(1, pawn.sizeFactor || 1);
      if (selected) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, size * .72, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(244,204,101,.20)';
        ctx.fill();
        ctx.lineWidth = 3 / cameraState.scale;
        ctx.strokeStyle = '#f4cc65';
        ctx.stroke();
      }
      const image = pawn.working ? runImage : idleImage;
      const ready = pawn.working ? runReady : idleReady;
      const frameCount = pawn.working ? RUN_FRAMES : IDLE_FRAMES;
      const frame = pawn.working && !reduced ? Math.floor(now / RUN_FRAME_MS) % frameCount : 0;
      if (ready) ctx.drawImage(image, frame * FRAME, 0, FRAME, FRAME, pos.x - size / 2, pos.y - size / 2, size, size);
      else {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, size * .35, 0, Math.PI * 2);
        ctx.fillStyle = pawn.working ? '#f1c65e' : '#d9e4dc';
        ctx.fill();
      }
      // Numele apar contextual, nu permanent: eticheta districtului rămâne
      // lizibilă chiar când mai mulți pawn-i ocupă aceeași zonă.
      if (selected || pawn.profileId === focusedProfileId || pawn.profileId === hoveredProfileId) {
        ctx.font = '600 10px ui-sans-serif, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.lineWidth = 3 / cameraState.scale;
        ctx.strokeStyle = 'rgba(2,8,7,.9)';
        ctx.strokeText(pawn.name, pos.x, pos.y + size * .55);
        ctx.fillStyle = '#f5f7f3';
        ctx.fillText(pawn.name, pos.x, pos.y + size * .55);
      }
      hitTargets.push({
        profileId: pawn.profileId,
        x: cameraState.x + pos.x * cameraState.scale,
        y: cameraState.y + pos.y * cameraState.scale,
        radius: Math.max(18, size * cameraState.scale * .68),
      });
    }
  }

  function draw() {
    const { width, height } = canvasSize();
    ctx.clearRect(0, 0, width, height);
    drawGround(width, height);
    hitTargets = [];
    const cameraState = camera(width, height);
    ctx.save();
    ctx.translate(cameraState.x, cameraState.y);
    ctx.scale(cameraState.scale, cameraState.scale);
    for (const zone of zones) drawDistrict(zone, cameraState);
    drawPawns(cameraState);
    ctx.restore();
  }

  function setMapStatus(state, message) {
    if (!statusEl) return;
    statusEl.textContent = message;
    if (statusEl.dataset) statusEl.dataset.state = state;
    else if (typeof statusEl.setAttribute === 'function') statusEl.setAttribute('data-state', state);
  }

  function emitWorldSelection(profileId) {
    selectedProfileId = profileId;
    draw();
    window.dispatchEvent(new CustomEvent('rpg:world-profile-select', { detail: { profileId } }));
  }

  function renderPawnList() {
    if (!pawnListEl) return;
    while (pawnListEl.firstChild) pawnListEl.removeChild(pawnListEl.firstChild);
    const heading = document.createElement('p');
    heading.textContent = pawns.length ? 'Specialiști pe hartă:' : 'Nu există specialiști plasați pe hartă.';
    pawnListEl.appendChild(heading);
    for (const pawn of pawns) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = pawn.name + ' — ' + pawn.project + (pawn.working ? ', lucrează' : ', fără lucru confirmat');
      button.addEventListener('focus', () => {
        focusedProfileId = pawn.profileId;
        draw();
      });
      button.addEventListener('blur', () => {
        if (focusedProfileId === pawn.profileId) focusedProfileId = null;
        draw();
      });
      button.addEventListener('click', () => emitWorldSelection(pawn.profileId));
      pawnListEl.appendChild(button);
    }
  }

  function updateZoom(delta) {
    userZoom = Math.min(2.4, Math.max(.65, userZoom * delta));
    if (zoomValueEl) zoomValueEl.textContent = Math.round(userZoom * 100) + '%';
    draw();
  }

  function resetView() {
    userZoom = 1;
    panX = 0;
    panY = 0;
    if (zoomValueEl) zoomValueEl.textContent = '100%';
    draw();
  }

  if (zoomInEl) zoomInEl.addEventListener('click', () => updateZoom(1.18));
  if (zoomOutEl) zoomOutEl.addEventListener('click', () => updateZoom(1 / 1.18));
  if (resetEl) resetEl.addEventListener('click', resetView);

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    updateZoom(event.deltaY < 0 ? 1.1 : 1 / 1.1);
  }, { passive: false });

  function targetAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const match = hitTargets
      .map((item) => ({ item, distance: Math.hypot(item.x - x, item.y - y) }))
      .filter((entry) => entry.distance <= entry.item.radius)
      .sort((a, b) => a.distance - b.distance)[0];
    return match ? match.item : null;
  }

  canvas.addEventListener('pointerdown', (event) => {
    pointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false };
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointer) {
      const target = targetAt(event.clientX, event.clientY);
      const nextHovered = target ? target.profileId : null;
      if (nextHovered !== hoveredProfileId) {
        hoveredProfileId = nextHovered;
        if (canvas.style) canvas.style.cursor = target ? 'pointer' : 'grab';
        draw();
      }
      return;
    }
    if (pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.lastX;
    const dy = event.clientY - pointer.lastY;
    if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 5) pointer.moved = true;
    panX += dx;
    panY += dy;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    draw();
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const wasMoved = pointer.moved;
    pointer = null;
    canvas.classList.remove('dragging');
    if (wasMoved) return;
    const target = targetAt(event.clientX, event.clientY);
    if (target) emitWorldSelection(target.profileId);
  });
  canvas.addEventListener('pointerleave', () => {
    if (!pointer && hoveredProfileId !== null) {
      hoveredProfileId = null;
      if (canvas.style) canvas.style.cursor = 'grab';
      draw();
    }
  });
  canvas.addEventListener('pointercancel', () => { pointer = null; canvas.classList.remove('dragging'); });

  function updateAnimationLoop() {
    const shouldAnimate = !prefersReducedMotion() && pawns.some((pawn) => pawn.working);
    if (shouldAnimate && rafId === null) {
      const loop = () => { draw(); rafId = requestAnimationFrame(loop); };
      rafId = requestAnimationFrame(loop);
    } else if (!shouldAnimate && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  async function pollOnce() {
    const myToken = ++requestToken;
    try {
      const response = await fetch('/api/world');
      if (!response.ok) throw new Error('răspuns non-OK');
      const body = await response.json();
      if (myToken !== requestToken) return;
      zones = Array.isArray(body.zones) ? body.zones : [];
      pawns = Array.isArray(body.pawns) ? body.pawns : [];
      renderPawnList();
      updateAnimationLoop();
      draw();
      if (!zones.length) setMapStatus('empty', 'Harta este goală. Profilurile fără proiect nu sunt plasate într-un teritoriu.');
      else setMapStatus('ready', 'Harta este actualizată.');
    } catch (_) {
      if (myToken === requestToken) setMapStatus('error', 'Harta nu s-a putut actualiza. Este afișat ultimul instantaneu disponibil.');
    } finally {
      setTimeout(pollOnce, POLL_INTERVAL_MS);
    }
  }

  window.addEventListener('rpg:profile-selected', (event) => {
    selectedProfileId = event && event.detail ? event.detail.profileId : null;
    draw();
  });
  window.addEventListener('resize', draw);
  if (document.fonts && typeof document.fonts.load === 'function') {
    document.fonts.load('700 17px Grenze').then(draw, () => {});
  }
  setMapStatus('loading', 'Se încarcă harta…');
  pollOnce();
}());
