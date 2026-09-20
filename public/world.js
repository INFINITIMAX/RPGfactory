// RF-K02 Canvas: top-down 2D citadel projected exclusively from the mission board.
(function () {
  const canvas = document.getElementById('world-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const statusEl = document.getElementById('world-status');
  const listEl = document.getElementById('world-pawn-list');
  const zoomIn = document.getElementById('map-zoom-in');
  const zoomOut = document.getElementById('map-zoom-out');
  const reset = document.getElementById('map-reset');
  const zoomValue = document.getElementById('map-zoom-value');
  const WORLD = { width: 1280, height: 820, centerX: 640, centerY: 410 };
  const sprites = loadSprites({
    pawnRun: '/sprites/pawn-run.png', pawnIdle: '/sprites/pawn-idle.png',
    castle: '/sprites/building-castle.png', barracks: '/sprites/building-barracks.png',
    archery: '/sprites/building-archery.png', monastery: '/sprites/building-monastery.png',
    house1: '/sprites/building-house-1.png', house2: '/sprites/building-house-2.png',
    house3: '/sprites/building-house-3.png', watchtower: '/sprites/building-watchtower.png',
    tree1: '/sprites/tree-1.png', tree2: '/sprites/tree-2.png', bush: '/sprites/bush.png',
    rock1: '/sprites/rock-1.png', gold: '/sprites/gold-stone.png'
  });
  const sourceFrames = {
    tree1: { x: 0, y: 0, width: 192, height: 256 },
    tree2: { x: 0, y: 0, width: 192, height: 256 },
    bush: { x: 0, y: 0, width: 128, height: 128 }
  };
  const buildings = [
    { key: 'castle', x: 640, y: 350, width: 176, sourceWidth: 320, sourceHeight: 256, label: 'Coordination Castle' },
    { key: 'barracks', x: 350, y: 294, width: 106, sourceWidth: 192, sourceHeight: 256, label: 'Implementation District' },
    { key: 'archery', x: 928, y: 286, width: 106, sourceWidth: 192, sourceHeight: 256, label: 'Testing Yard' },
    { key: 'monastery', x: 925, y: 590, width: 104, sourceWidth: 192, sourceHeight: 320, label: 'Research Archive' },
    { key: 'house2', x: 350, y: 596, width: 77, sourceWidth: 128, sourceHeight: 192, label: 'Review Workshop' },
    { key: 'house1', x: 205, y: 424, width: 77, sourceWidth: 128, sourceHeight: 192 },
    { key: 'house3', x: 1070, y: 430, width: 77, sourceWidth: 128, sourceHeight: 192 },
    { key: 'watchtower', x: 640, y: 700, width: 64, sourceWidth: 128, sourceHeight: 256 }
  ];
  const stations = [
    { x: 515, y: 365 }, { x: 765, y: 365 }, { x: 590, y: 485 }, { x: 690, y: 485 },
    { x: 275, y: 270 }, { x: 420, y: 270 }, { x: 280, y: 380 }, { x: 420, y: 390 },
    { x: 850, y: 265 }, { x: 1000, y: 265 }, { x: 850, y: 390 }, { x: 1000, y: 390 },
    { x: 850, y: 555 }, { x: 1005, y: 555 }, { x: 850, y: 670 }, { x: 1005, y: 680 },
    { x: 275, y: 555 }, { x: 425, y: 555 }, { x: 275, y: 680 }, { x: 425, y: 680 }
  ];
  const districtLabels = [
    { text: 'IMPLEMENTATION', x: 350, y: 185 }, { text: 'TESTING', x: 930, y: 180 },
    { text: 'REVIEW', x: 350, y: 742 }, { text: 'RESEARCH', x: 930, y: 742 },
    { text: 'CENTRAL SQUARE', x: 640, y: 548 }
  ];
  let snapshot = null;
  let mission = null;
  let selectedId = null;
  let selectedProofRef = null;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let hits = [];
  let pointer = null;
  let raf = null;
  let viewport = { width: 1, height: 1 };
  const colors = { coordinator: '#5597d1', direct: '#d6ae45', descendant: '#9871c9', unknown: '#89918f' };
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function loadSprites(paths) {
    const result = {};
    Object.keys(paths).forEach((key) => {
      const image = new Image();
      image.src = paths[key];
      image.addEventListener('load', draw);
      result[key] = image;
    });
    return result;
  }
  function spriteReady(image) { return image && image.complete && image.naturalWidth > 0; }
  function setStatus(state, text) {
    if (!statusEl) return;
    statusEl.dataset.state = state;
    statusEl.textContent = text;
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    viewport = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    const pixelWidth = Math.round(viewport.width * dpr);
    const pixelHeight = Math.round(viewport.height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    return viewport;
  }
  function screenPoint(point) {
    return {
      x: Math.round(viewport.width / 2 + panX + (point.x - WORLD.centerX) * zoom),
      y: Math.round(viewport.height / 2 + panY + (point.y - WORLD.centerY) * zoom)
    };
  }
  function stableHash(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    return hash >>> 0;
  }
  function overflowStation(index) {
    const rows = 18;
    return { x: -180 - Math.floor(index / rows) * 82, y: 70 + (index % rows) * 44 };
  }
  function nodePositions() {
    const positions = new Map();
    if (!snapshot) return positions;
    const root = snapshot.nodes.find((node) => node.rank === 'coordinator');
    if (root) positions.set(root.id, screenPoint({ x: WORLD.centerX, y: WORLD.centerY }));
    const used = new Set();
    let overflowIndex = 0;
    snapshot.nodes.filter((node) => !root || node.id !== root.id).slice().sort((a, b) => a.id.localeCompare(b.id)).forEach((node) => {
      let station;
      if (used.size < stations.length) {
        let index = stableHash(node.id) % stations.length;
        while (used.has(index)) index = (index + 1) % stations.length;
        used.add(index);
        station = stations[index];
      } else {
        station = overflowStation(overflowIndex);
        overflowIndex += 1;
      }
      positions.set(node.id, screenPoint(station));
    });
    return positions;
  }
  function roundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + width - r, y); ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r); ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function drawGround() {
    ctx.fillStyle = '#1d6269';
    ctx.fillRect(0, 0, viewport.width, viewport.height);
    ctx.strokeStyle = '#4f9393';
    ctx.lineWidth = 1;
    for (let y = 24; y < viewport.height; y += 38) {
      ctx.beginPath();
      for (let x = (y % 76) - 50; x < viewport.width + 50; x += 52) {
        ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 9, y - 4, x + 18, y);
      }
      ctx.stroke();
    }
    const a = screenPoint({ x: 70, y: 50 });
    const b = screenPoint({ x: 1210, y: 770 });
    roundedRect(a.x, a.y, b.x - a.x, b.y - a.y, 86 * zoom);
    ctx.fillStyle = '#d2bd78'; ctx.fill();
    ctx.lineWidth = Math.max(7, 13 * zoom); ctx.strokeStyle = '#e5d399'; ctx.stroke();
    const innerA = screenPoint({ x: 92, y: 70 });
    const innerB = screenPoint({ x: 1188, y: 748 });
    roundedRect(innerA.x, innerA.y, innerB.x - innerA.x, innerB.y - innerA.y, 72 * zoom);
    ctx.fillStyle = '#518447'; ctx.fill();
    ctx.strokeStyle = '#386a3d'; ctx.lineWidth = Math.max(2, 5 * zoom); ctx.stroke();
    drawRoads();
    drawWalls();
  }
  function road(points, width) {
    ctx.beginPath();
    points.map(screenPoint).forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.strokeStyle = '#9f7a47'; ctx.lineWidth = width * zoom; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.strokeStyle = '#c19b61'; ctx.lineWidth = Math.max(2, (width - 7) * zoom); ctx.stroke();
  }
  function drawRoads() {
    road([{ x: 640, y: 150 }, { x: 640, y: 710 }], 25);
    road([{ x: 190, y: 430 }, { x: 1090, y: 430 }], 25);
    road([{ x: 640, y: 430 }, { x: 350, y: 295 }], 18);
    road([{ x: 640, y: 430 }, { x: 930, y: 290 }], 18);
    road([{ x: 640, y: 430 }, { x: 350, y: 600 }], 18);
    road([{ x: 640, y: 430 }, { x: 930, y: 595 }], 18);
    const center = screenPoint({ x: 640, y: 430 });
    ctx.beginPath(); ctx.arc(center.x, center.y, 106 * zoom, 0, Math.PI * 2);
    ctx.fillStyle = '#b58e57'; ctx.fill(); ctx.strokeStyle = '#d0ad71'; ctx.lineWidth = 4 * zoom; ctx.stroke();
  }
  function drawWalls() {
    const leftTop = screenPoint({ x: 125, y: 105 });
    const rightBottom = screenPoint({ x: 1155, y: 715 });
    roundedRect(leftTop.x, leftTop.y, rightBottom.x - leftTop.x, rightBottom.y - leftTop.y, 50 * zoom);
    ctx.strokeStyle = '#8d8062'; ctx.lineWidth = Math.max(5, 12 * zoom); ctx.stroke();
    [[145,125],[1135,125],[145,695],[1135,695]].forEach(([x, y]) => {
      const point = screenPoint({ x, y });
      ctx.fillStyle = '#716c59'; ctx.fillRect(point.x - 18 * zoom, point.y - 18 * zoom, 36 * zoom, 36 * zoom);
      ctx.strokeStyle = '#3e4237'; ctx.lineWidth = 2; ctx.strokeRect(point.x - 18 * zoom, point.y - 18 * zoom, 36 * zoom, 36 * zoom);
    });
  }
  function drawDecorations() {
    const trees = [[170,205],[205,180],[1085,185],[1120,220],[170,625],[195,665],[1090,635],[1115,670]];
    trees.forEach(([x, y], index) => {
      const key = index % 2 ? 'tree2' : 'tree1';
      drawSpriteOrFallback(sprites[key], { x, y }, 54, 72, '#285d32', 'tree', sourceFrames[key]);
    });
    [[240,170],[1035,690],[1100,560],[165,520]].forEach(([x, y]) => drawSpriteOrFallback(sprites.bush, { x, y }, 38, 38, '#3c7438', 'bush', sourceFrames.bush));
    [[245,645],[1045,205],[1080,590]].forEach(([x, y]) => drawSpriteOrFallback(sprites.rock1, { x, y }, 40, 32, '#757568', 'rock'));
  }
  function drawSpriteOrFallback(image, worldPoint, width, height, color, shape, sourceFrame) {
    const point = screenPoint(worldPoint);
    const w = Math.round(width * zoom), h = Math.round(height * zoom);
    const left = Math.round(point.x - w / 2), top = Math.round(point.y - h / 2);
    if (spriteReady(image) && sourceFrame) ctx.drawImage(image, sourceFrame.x, sourceFrame.y, sourceFrame.width, sourceFrame.height, left, top, w, h);
    else if (spriteReady(image)) ctx.drawImage(image, left, top, w, h);
    else {
      ctx.fillStyle = color;
      if (shape === 'tree' || shape === 'bush') { ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(5, w * .36), 0, Math.PI * 2); ctx.fill(); }
      else { roundedRect(point.x - w / 2, point.y - h / 2, w, h, 5); ctx.fill(); }
    }
  }
  function drawBuildings() {
    buildings.forEach((building) => {
      const point = screenPoint(building);
      const w = Math.round(building.width * zoom);
      const h = Math.round(building.width * building.sourceHeight / building.sourceWidth * zoom);
      ctx.fillStyle = '#315f2e55'; ctx.fillRect(point.x - w * .55, point.y + h * .27, w * 1.1, h * .26);
      if (spriteReady(sprites[building.key])) ctx.drawImage(sprites[building.key], Math.round(point.x - w / 2), Math.round(point.y - h / 2), w, h);
      else drawBuildingFallback(point, w, h, building.key);
      if (building.label) drawDistrictLabel(building.label, point.x, point.y - h * .58);
    });
    districtLabels.forEach((label) => {
      const point = screenPoint(label);
      ctx.font = '700 ' + Math.max(10, Math.round(12 * zoom)) + 'px Grenze, serif';
      ctx.textAlign = 'center'; ctx.fillStyle = '#f8e3aa'; ctx.strokeStyle = '#382719'; ctx.lineWidth = 4;
      ctx.strokeText(label.text, point.x, point.y); ctx.fillText(label.text, point.x, point.y);
    });
  }
  function drawBuildingFallback(point, width, height, key) {
    ctx.fillStyle = key === 'castle' ? '#8e7958' : '#9a7549';
    ctx.fillRect(point.x - width * .42, point.y - height * .28, width * .84, height * .62);
    ctx.fillStyle = key === 'monastery' ? '#556b78' : '#74442a';
    ctx.beginPath(); ctx.moveTo(point.x - width * .48, point.y - height * .28); ctx.lineTo(point.x, point.y - height * .58); ctx.lineTo(point.x + width * .48, point.y - height * .28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3b281b'; ctx.fillRect(point.x - width * .08, point.y + height * .06, width * .16, height * .28);
  }
  function drawDistrictLabel(text, x, y) {
    ctx.font = '600 ' + Math.max(10, Math.round(11 * zoom)) + 'px Candara, sans-serif';
    const width = ctx.measureText(text).width + 14;
    ctx.fillStyle = '#392718dc'; ctx.fillRect(Math.round(x - width / 2), Math.round(y - 13), Math.round(width), 20);
    ctx.fillStyle = '#f6dfac'; ctx.textAlign = 'center'; ctx.fillText(text, x, y + 1);
  }
  function drawHandoffs(positions) {
    if (!mission || !Array.isArray(mission.handoffs)) return;
    mission.handoffs.forEach((handoff) => {
      const from = positions.get(handoff.fromRunId), to = positions.get(handoff.toRunId);
      if (!from || !to) return;
      const midX = Math.round((from.x + to.x) / 2);
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(midX, from.y); ctx.lineTo(midX, to.y); ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = '#f4c64f'; ctx.lineWidth = 4; ctx.setLineDash([9, 6]); ctx.stroke(); ctx.setLineDash([]);
    });
  }
  function proofPoints(count) {
    const points = [];
    const columns = Math.min(5, Math.max(1, Math.ceil(Math.sqrt(count))));
    for (let index = 0; index < count; index += 1) points.push(screenPoint({ x: 555 + (index % columns) * 28, y: 575 + Math.floor(index / columns) * 26 }));
    return points;
  }
  function drawProofs() {
    if (!mission || !mission.proofs.length) return;
    const points = proofPoints(mission.proofs.length);
    const topLeft = screenPoint({ x: 520, y: 545 });
    const rows = Math.ceil(mission.proofs.length / Math.min(5, Math.ceil(Math.sqrt(mission.proofs.length))));
    const boxWidth = Math.max(130, Math.min(5, mission.proofs.length) * 28 + 42) * zoom;
    const boxHeight = Math.max(80, rows * 26 + 50) * zoom;
    ctx.fillStyle = '#4a2d17e8'; ctx.fillRect(topLeft.x, topLeft.y, boxWidth, boxHeight);
    ctx.strokeStyle = '#d7b35e'; ctx.lineWidth = 3; ctx.strokeRect(topLeft.x + 1, topLeft.y + 1, boxWidth - 2, boxHeight - 2);
    ctx.fillStyle = '#f6dfac'; ctx.font = '600 11px Candara, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('VAULT · ' + mission.proofs.length, topLeft.x + 10, topLeft.y + 17);
    mission.proofs.forEach((proof, index) => {
      const point = points[index];
      if (spriteReady(sprites.gold)) {
        const crop = Math.max(1, Math.floor(Math.min(sprites.gold.naturalWidth, sprites.gold.naturalHeight) * .62));
        ctx.drawImage(sprites.gold, Math.floor((sprites.gold.naturalWidth - crop) / 2), Math.floor((sprites.gold.naturalHeight - crop) / 2), crop, crop, point.x - 13, point.y - 13, 26, 26);
      } else { ctx.beginPath(); ctx.arc(point.x, point.y, 10, 0, Math.PI * 2); ctx.fillStyle = '#d7aa43'; ctx.fill(); }
      if (proof.ref === selectedProofRef) { ctx.beginPath(); ctx.arc(point.x, point.y, 14, 0, Math.PI * 2); ctx.strokeStyle = '#fff0a8'; ctx.lineWidth = 3; ctx.stroke(); }
      hits.push({ kind: 'proof', ref: proof.ref, x: point.x, y: point.y, radius: 16 });
    });
  }
  function drawNodes(positions) {
    snapshot.nodes.forEach((node) => {
      const point = positions.get(node.id);
      if (!point) return;
      const radius = node.rank === 'coordinator' ? 36 : 31;
      if (node.id === selectedId) { ctx.beginPath(); ctx.arc(point.x, point.y, radius + 8, 0, Math.PI * 2); ctx.strokeStyle = '#fff0ae'; ctx.lineWidth = 3; ctx.stroke(); }
      const active = node.active === true;
      const image = active ? sprites.pawnRun : sprites.pawnIdle;
      const frame = active && !reduced() ? Math.floor(performance.now() / 140) % 6 : 0;
      if (spriteReady(image)) ctx.drawImage(image, frame * 192, 0, 192, 192, Math.round(point.x - radius), Math.round(point.y - radius), radius * 2, radius * 2);
      else { ctx.beginPath(); ctx.arc(point.x, point.y, radius * .62, 0, Math.PI * 2); ctx.fillStyle = colors[node.rank] || colors.unknown; ctx.fill(); }
      drawNodeLabel(node, point, radius);
      hits.push({ kind: 'node', id: node.id, x: point.x, y: point.y, radius: radius + 8 });
    });
  }
  function drawNodeLabel(node, point, radius) {
    const role = node.role || 'role unavailable';
    const state = node.lifecycle + (node.attention === 'needs_attention' ? ' · attention' : '');
    ctx.font = '600 11px Candara, sans-serif';
    const width = Math.ceil(Math.max(ctx.measureText(role).width, ctx.measureText(state).width)) + 14;
    const top = point.y + radius - 2;
    ctx.fillStyle = '#2f2117e8'; ctx.fillRect(Math.round(point.x - width / 2), Math.round(top), width, 31);
    ctx.strokeStyle = colors[node.rank] || colors.unknown; ctx.lineWidth = 2; ctx.strokeRect(Math.round(point.x - width / 2), Math.round(top), width, 31);
    ctx.fillStyle = '#fff0bd'; ctx.textAlign = 'center'; ctx.fillText(role, point.x, top + 12);
    ctx.font = '10px Candara, sans-serif'; ctx.fillStyle = node.attention === 'needs_attention' ? '#ffd36b' : '#f7f5e9'; ctx.fillText(state, point.x, top + 24);
  }
  function draw() {
    resize();
    ctx.clearRect(0, 0, viewport.width, viewport.height);
    hits = [];
    drawGround();
    drawDecorations();
    drawBuildings();
    if (!snapshot) return;
    const positions = nodePositions();
    drawHandoffs(positions);
    drawProofs();
    drawNodes(positions);
  }
  function renderList() {
    if (!listEl) return;
    while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
    const hasNodes = !!(snapshot && snapshot.nodes.length), hasProofs = !!(mission && mission.proofs.length);
    const intro = document.createElement('p');
    intro.textContent = hasNodes || hasProofs ? 'Specialists and evidence on the map:' : 'No Pi observation or evidence is available.';
    listEl.appendChild(intro);
    (snapshot ? snapshot.nodes : []).forEach((node) => addButton([node.role || 'role unavailable', node.rank, node.lifecycle, snapshot.freshness].join(' — '), node.id === selectedId, () => selectNode(node.id)));
    (mission ? mission.proofs : []).forEach((proof, index) => addButton('Evidence ' + (index + 1) + ' — ' + proof.kind + ' — ' + (proof.status || 'no status'), proof.ref === selectedProofRef, () => selectProof(proof.ref)));
  }
  function addButton(text, pressed, action) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
    button.setAttribute('aria-pressed', pressed ? 'true' : 'false'); button.addEventListener('click', action); listEl.appendChild(button);
  }
  function selectNode(id) {
    selectedId = id; selectedProofRef = null; draw(); renderList();
    window.dispatchEvent(new CustomEvent('rpg:world-pi-select', { detail: { nodeId: id } }));
  }
  function selectProof(ref) {
    selectedProofRef = ref; selectedId = null; draw(); renderList();
    window.dispatchEvent(new CustomEvent('rpg:world-proof-select', { detail: { proofRef: ref } }));
  }
  function syncAnimation() {
    const animated = snapshot && snapshot.nodes.some((node) => node.active === true) && !reduced();
    if (animated && raf === null) {
      const loop = () => { draw(); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    } else if (!animated && raf !== null) { cancelAnimationFrame(raf); raf = null; }
  }
  function zoomBy(factor) {
    zoom = Math.max(.65, Math.min(2.2, zoom * factor));
    if (zoomValue) zoomValue.textContent = Math.round(zoom * 100) + '%';
    draw();
  }
  if (zoomIn) zoomIn.addEventListener('click', () => zoomBy(1.16));
  if (zoomOut) zoomOut.addEventListener('click', () => zoomBy(1 / 1.16));
  if (reset) reset.addEventListener('click', () => { zoom = 1; panX = 0; panY = 0; if (zoomValue) zoomValue.textContent = '100%'; draw(); });
  canvas.addEventListener('wheel', (event) => { event.preventDefault(); zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
  function hit(event) {
    const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
    return hits.map((item) => ({ item, distance: Math.hypot(item.x - x, item.y - y) })).filter((entry) => entry.distance <= entry.item.radius).sort((a, b) => a.distance - b.distance)[0]?.item || null;
  }
  canvas.addEventListener('pointerdown', (event) => { pointer = { x: event.clientX, y: event.clientY, moved: false }; canvas.setPointerCapture?.(event.pointerId); });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointer) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (Math.hypot(dx, dy) > 4) pointer.moved = true;
    panX += dx; panY += dy; pointer.x = event.clientX; pointer.y = event.clientY; draw();
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!pointer) return;
    const moved = pointer.moved; pointer = null;
    if (!moved) { const target = hit(event); if (target) target.kind === 'proof' ? selectProof(target.ref) : selectNode(target.id); }
  });
  window.addEventListener('rpg:pi-mission-board', (event) => {
    const detail = event.detail || {}, board = detail.board;
    if (!board || !board.kingdom) return;
    snapshot = board.kingdom;
    mission = board.missions.find((item) => item.id === detail.missionId) || null;
    selectedProofRef = detail.proofRef || null;
    if (selectedId && !snapshot.nodes.some((node) => node.id === selectedId)) selectedId = null;
    renderList(); syncAnimation(); draw();
    const state = snapshot.availability === 'unavailable' ? 'empty' : snapshot.freshness === 'stale' ? 'stale' : 'ready';
    const text = state === 'empty' ? 'No Pi observation is available.' : state === 'stale' ? 'The Pi observation is stale; the last snapshot remains visible.' : 'Pi Kingdom is up to date.';
    setStatus(state, text);
  });
  window.addEventListener('rpg:pi-disconnected', () => setStatus('disconnected', 'The Pi connection failed; the last snapshot remains visible.'));
  window.addEventListener('rpg:pi-node-selected', (event) => { selectedId = event.detail.nodeId; selectedProofRef = null; draw(); renderList(); });
  window.addEventListener('rpg:proof-selected', (event) => { selectedProofRef = event.detail.proofRef; selectedId = null; draw(); renderList(); });
  window.addEventListener('resize', draw);
  setStatus('loading', 'Waiting for a Pi observation…'); renderList(); draw();
}());
