import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'public', 'world.js'), 'utf8');
const hex = (digit) => digit.repeat(64);

class Element {
  constructor() { this.childNodes = []; this.parentNode = null; this.listeners = {}; this.attributes = new Map(); this.dataset = {}; this._text = ''; this.width = 0; this.height = 0; }
  get children() { return this.childNodes; }
  get firstChild() { return this.childNodes[0] || null; }
  appendChild(node) { this.childNodes.push(node); node.parentNode = this; return node; }
  removeChild(node) { const index = this.childNodes.indexOf(node); if (index >= 0) this.childNodes.splice(index, 1); node.parentNode = null; return node; }
  set textContent(value) { this.childNodes = []; this._text = String(value); }
  get textContent() { return this._text + this.childNodes.map((node) => node.textContent).join(''); }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) || null; }
  addEventListener(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); }
  fire(type, event = {}) { for (const fn of this.listeners[type] || []) fn({ preventDefault() {}, pointerId: 1, ...event }); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; }
  setPointerCapture() {}
  set innerHTML(_) { throw new Error('innerHTML is forbidden'); }
  get innerHTML() { throw new Error('innerHTML is forbidden'); }
}

function node(id, changes = {}) {
  return { id, parentId: null, relation: 'coordinator', depth: 0, rank: 'coordinator', role: 'planner', lifecycle: 'running', attention: null, activity: 'coordinating', startedAt: 1, lastActivityAt: 2, active: false, ...changes };
}
function kingdom(nodes, changes = {}) {
  return { schemaVersion: 1, source: 'pi-subagents', availability: 'ready', freshness: 'fresh', observedAt: 2, otherObservationCount: 0, truncated: false, warnings: [], nodes, ...changes };
}
function proof(ref, kind = 'patch') { return { ref, source: 'artifact', kind, status: null }; }
function mission(proofs = [], changes = {}) {
  return { id: hex('1'), status: 'active', createdAt: 1, updatedAt: 2, goalStatus: 'active', usageTokens: null, openDecisionCount: 0, runs: [], handoffs: [], proofs, ...changes };
}
function board(snapshot, missions) { return { schemaVersion: 1, source: 'rpgfactory-pi-mission-board', observedAt: 2, missionAvailability: 'ready', truncated: { missions: false, runs: false, proofs: false }, warnings: [], kingdom: snapshot, missions }; }

function world({ reduceMotion = false } = {}) {
  const context = {
    frame: null, dash: [], fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '',
    setTransform() {},
    clearRect() { this.frame = { images: [], strokes: [], arcs: [], texts: [] }; },
    fillRect() {}, strokeRect() {}, beginPath() { this.path = []; }, moveTo(x, y) { this.path.push({ x, y }); }, lineTo(x, y) { this.path.push({ x, y }); }, quadraticCurveTo() {}, closePath() {},
    setLineDash(value) { this.dash = [...value]; },
    stroke() { this.frame.strokes.push({ dash: [...this.dash], color: this.strokeStyle, path: [...(this.path || [])] }); },
    arc(x, y, radius) { this.frame.arcs.push({ x, y, radius, color: this.fillStyle }); },
    fill() {}, fillText(text, x, y) { this.frame.texts.push({ text, x, y }); }, strokeText() {},
    measureText(text) { return { width: String(text).length * 7 }; },
    drawImage(image, ...args) { this.frame.images.push({ src: image.src, args }); },
  };
  const elements = {
    'world-canvas': new Element(), 'world-status': new Element(), 'world-pawn-list': new Element(),
    'map-zoom-in': new Element(), 'map-zoom-out': new Element(), 'map-reset': new Element(), 'map-zoom-value': new Element(),
  };
  elements['world-canvas'].getContext = () => context;
  const listeners = {}; const documentListeners = {}; const events = []; let rafId = 0; const rafRequests = []; const cancelled = []; let now = 0; let hidden = false;
  const window = {
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: reduceMotion }),
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    dispatchEvent(event) { events.push(event); for (const fn of listeners[event.type] || []) fn(event); return true; },
  };
  class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  class Image {
    constructor() { this.complete = true; this.naturalWidth = 192; this.naturalHeight = 192; this._src = ''; }
    set src(value) {
      this._src = value;
      const dimensions = {
        '/sprites/tree-1.png': [1536, 256], '/sprites/tree-2.png': [1536, 256], '/sprites/bush.png': [1024, 128],
        '/sprites/building-castle.png': [320, 256], '/sprites/building-barracks.png': [192, 256],
        '/sprites/building-archery.png': [192, 256], '/sprites/building-monastery.png': [192, 320],
        '/sprites/building-house-1.png': [128, 192], '/sprites/building-house-2.png': [128, 192],
        '/sprites/building-house-3.png': [128, 192], '/sprites/building-watchtower.png': [128, 256],
        '/sprites/pawn-run.png': [1152, 192], '/sprites/pawn-idle.png': [1152, 192],
      };
      [this.naturalWidth, this.naturalHeight] = dimensions[value] || [192, 192];
    }
    get src() { return this._src; }
    addEventListener() {}
  }
  const sandbox = {
    document: {
      getElementById: (id) => elements[id] || null,
      createElement: () => new Element(),
      get hidden() { return hidden; },
      addEventListener(type, fn) { (documentListeners[type] || (documentListeners[type] = [])).push(fn); },
    },
    window, CustomEvent, Image, performance: { now: () => now }, console,
    requestAnimationFrame(callback) { const id = ++rafId; rafRequests.push({ id, callback }); return id; },
    cancelAnimationFrame(id) { cancelled.push(id); },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'world.js' });
  return {
    context, elements, events, listeners, window, rafRequests, cancelled,
    emit(type, detail) { window.dispatchEvent(new CustomEvent(type, { detail })); },
    runRaf(index, timestamp) { now = timestamp; rafRequests[index].callback(timestamp); },
    setHidden(value) { hidden = value; for (const fn of documentListeners.visibilitychange || []) fn(); },
  };
}

function goldImages(app) { return app.context.frame.images.filter((entry) => entry.src === '/sprites/gold-stone.png'); }
function spriteImages(app, file) { return app.context.frame.images.filter((entry) => entry.src === `/sprites/${file}`); }
function listButtons(app) { return app.elements['world-pawn-list'].children.filter((child) => child.attributes.has('aria-pressed')); }
function uniqueNodeId(index) { return index.toString(16).padStart(64, '0'); }
function pawnCenter(app, file = 'pawn-run.png') {
  const image = spriteImages(app, file).at(-1);
  assert.ok(image, `current frame must draw ${file}`);
  const [, , , , left, top, width, height] = image.args;
  return { x: left + width / 2, y: top + height / 2 };
}

test('sprites use real source frames and preserve native building aspect ratios', () => {
  const app = world();
  const image = (file) => {
    const match = spriteImages(app, file)[0];
    assert.ok(match, `sprite ${file} must be drawn`);
    return match.args;
  };

  const tree = image('tree-1.png');
  assert.deepEqual(tree.slice(0, 4), [0, 0, 192, 256]);
  assert.deepEqual(tree.slice(6), [54, 72], 'the tree destination preserves the 192:256 aspect ratio');
  const bush = image('bush.png');
  assert.deepEqual(bush.slice(0, 4), [0, 0, 128, 128]);
  assert.deepEqual(bush.slice(6), [38, 38], 'the bush destination preserves the 1:1 aspect ratio');

  for (const [file, sourceWidth, sourceHeight] of [
    ['building-castle.png', 320, 256],
    ['building-monastery.png', 192, 320],
    ['building-house-1.png', 128, 192],
    ['building-watchtower.png', 128, 256],
  ]) {
    const args = image(file);
    assert.equal(args.length, 4, `${file} uses full-image drawing without sheet cropping`);
    const [destinationWidth, destinationHeight] = args.slice(-2);
    assert.equal(destinationHeight, Math.round(destinationWidth * sourceHeight / sourceWidth), `${file} preserves its native ratio with pixel rounding`);
  }
});

test('at least 22 Pawns have unique centers and each center selects the correct ID', () => {
  const app = world();
  const nodes = Array.from({ length: 22 }, (_, index) => node(uniqueNodeId(index), index === 0 ? {} : {
    parentId: uniqueNodeId(0), relation: 'direct', depth: 1, rank: 'direct', role: `worker-${index}`,
  }));
  const selectedMission = mission([]);
  app.emit('rpg:pi-mission-board', { board: board(kingdom(nodes), [selectedMission]), missionId: selectedMission.id, proofRef: null });

  const pawnDraws = app.context.frame.images.filter((entry) => entry.src === '/sprites/pawn-idle.png');
  assert.equal(pawnDraws.length, nodes.length);
  const centers = pawnDraws.map((entry) => {
    const [, , , , left, top, width, height] = entry.args;
    return { x: left + width / 2, y: top + height / 2 };
  });
  assert.equal(new Set(centers.map(({ x, y }) => `${x},${y}`)).size, nodes.length, 'no Pawn centers overlap');

  const selectAt = (center, index) => {
    app.elements['world-canvas'].fire('pointerdown', { clientX: center.x, clientY: center.y });
    app.elements['world-canvas'].fire('pointerup', { clientX: center.x, clientY: center.y });
    const selected = app.events.filter((event) => event.type === 'rpg:world-pi-select').at(-1);
    assert.ok(selected, `Pawn ${index} must emit a selection`);
    assert.equal(selected.detail.nodeId, nodes[index].id, `Pawn ${index} center selects its own ID`);
  };
  centers.slice(0, -1).forEach(selectAt);

  app.elements['world-canvas'].fire('pointerdown', { clientX: 0, clientY: 0 });
  app.elements['world-canvas'].fire('pointermove', { clientX: 500, clientY: 100 });
  app.elements['world-canvas'].fire('pointerup', { clientX: 500, clientY: 100 });
  const overflowDraw = app.context.frame.images.filter((entry) => entry.src === '/sprites/pawn-idle.png').at(-1);
  const [, , , , left, top, width, height] = overflowDraw.args;
  const overflowCenter = { x: left + width / 2, y: top + height / 2 };
  assert.ok(overflowCenter.x >= 0 && overflowCenter.x <= 800, 'the overflow Pawn becomes accessible after panning');
  assert.ok(overflowCenter.y >= 0 && overflowCenter.y <= 600, 'the overflow Pawn remains vertically within the viewport');
  selectAt(overflowCenter, nodes.length - 1);
});

test('zero proofs produce zero drawn and zero hittable gold objects', () => {
  const app = world();
  const snapshot = kingdom([node(hex('a'))]);
  const selectedMission = mission([]);
  app.emit('rpg:pi-mission-board', { board: board(snapshot, [selectedMission]), missionId: selectedMission.id, proofRef: null });

  assert.equal(goldImages(app).length, 0);
  assert.equal(app.context.frame.texts.some((entry) => /VAULT/.test(entry.text)), false);
  assert.equal(listButtons(app).length, 1, 'alternative DOM contains only the Pawn');
  app.elements['world-canvas'].fire('pointerdown', { clientX: 389, clientY: 392 });
  app.elements['world-canvas'].fire('pointerup', { clientX: 389, clientY: 392 });
  assert.equal(app.events.some((event) => event.type === 'rpg:world-proof-select'), false);
});

test('N proofs produce exactly N gold objects, all in the DOM list, and hit testing emits the correct ref', () => {
  const app = world();
  const refs = [hex('d'), hex('e'), hex('f')];
  const snapshot = kingdom([node(hex('a'))]);
  const selectedMission = mission(refs.map((ref, index) => proof(ref, index ? 'review' : 'patch')));
  app.emit('rpg:pi-mission-board', { board: board(snapshot, [selectedMission]), missionId: selectedMission.id, proofRef: null });

  assert.equal(goldImages(app).length, refs.length);
  assert.equal(listButtons(app).length, 1 + refs.length, 'one Pawn plus every proof is keyboard reachable');
  assert.ok(listButtons(app).every((button) => button.type === 'button'));
  // For 3 proofs: 2 columns; coordinates derive from WORLD center and the 800×600 viewport.
  app.elements['world-canvas'].fire('pointerdown', { clientX: 343, clientY: 465 });
  app.elements['world-canvas'].fire('pointerup', { clientX: 343, clientY: 465 });
  const selected = app.events.filter((event) => event.type === 'rpg:world-proof-select').at(-1);
  assert.ok(selected);
  assert.equal(selected.detail.proofRef, refs[1]);
});

test('only confirmed handoffs supplied by the mission snapshot are drawn', () => {
  const rootId = hex('a'); const childId = hex('b'); const absentId = hex('c');
  const snapshot = kingdom([
    node(rootId),
    node(childId, { parentId: rootId, relation: 'direct', rank: 'direct', depth: 1, role: 'coder' }),
  ]);
  const hierarchyOnly = world();
  hierarchyOnly.emit('rpg:pi-mission-board', { board: board(snapshot, [mission([], { handoffs: [] })]), missionId: hex('1'), proofRef: null });
  assert.equal(hierarchyOnly.context.frame.strokes.filter((stroke) => stroke.dash.join(',') === '9,6').length, 0, 'the parentId relation does not invent a handoff');

  const app = world();
  const selectedMission = mission([], {
    handoffs: [
      { fromRunId: rootId, toRunId: childId, at: 10, basis: 'temporal_sequence' },
      { fromRunId: childId, toRunId: absentId, at: 20, basis: 'temporal_sequence' },
    ],
  });
  app.emit('rpg:pi-mission-board', { board: board(snapshot, [selectedMission]), missionId: selectedMission.id, proofRef: null });
  const handoffStrokes = app.context.frame.strokes.filter((stroke) => stroke.dash.join(',') === '9,6');
  assert.equal(handoffStrokes.length, 1, 'confirmed edge with both existing Pawns is drawn; missing endpoint is ignored');
});

test('only node.active true starts RAF; inactive, stale, and reduced-motion states do not animate', () => {
  const inactive = world();
  const inactiveSnapshot = kingdom([node(hex('a'), { lifecycle: 'running', active: false })]);
  inactive.emit('rpg:pi-mission-board', { board: board(inactiveSnapshot, [mission()]), missionId: hex('1'), proofRef: null });
  assert.equal(inactive.rafRequests.length, 0);

  const stale = world();
  const staleSnapshot = kingdom([node(hex('a'), { lifecycle: 'running', active: false })], { freshness: 'stale' });
  stale.emit('rpg:pi-mission-board', { board: board(staleSnapshot, [mission()]), missionId: hex('1'), proofRef: null });
  assert.equal(stale.rafRequests.length, 0);

  const active = world();
  const activeSnapshot = kingdom([node(hex('a'), { active: true })]);
  active.emit('rpg:pi-mission-board', { board: board(activeSnapshot, [mission()]), missionId: hex('1'), proofRef: null });
  assert.equal(active.rafRequests.length, 1);
  active.emit('rpg:pi-mission-board', { board: board(inactiveSnapshot, [mission()]), missionId: hex('1'), proofRef: null });
  assert.deepEqual(active.cancelled, [active.rafRequests[0].id]);

  const reduced = world({ reduceMotion: true });
  reduced.emit('rpg:pi-mission-board', { board: board(activeSnapshot, [mission()]), missionId: hex('1'), proofRef: null });
  assert.equal(reduced.rafRequests.length, 0);
});

test('the alternative DOM list contains every Pawn and proof while external selection updates Canvas and list', () => {
  const app = world();
  const rootId = hex('a'); const childId = hex('b'); const ref = hex('d');
  const snapshot = kingdom([node(rootId), node(childId, { parentId: rootId, relation: 'direct', rank: 'direct', depth: 1, role: 'tester' })]);
  const selectedMission = mission([proof(ref)]);
  app.emit('rpg:pi-mission-board', { board: board(snapshot, [selectedMission]), missionId: selectedMission.id, proofRef: null });
  assert.equal(listButtons(app).length, 3);

  app.emit('rpg:pi-node-selected', { nodeId: childId });
  let pressed = listButtons(app).filter((button) => button.getAttribute('aria-pressed') === 'true');
  assert.equal(pressed.length, 1);
  assert.match(pressed[0].textContent, /tester/);

  app.emit('rpg:proof-selected', { proofRef: ref });
  pressed = listButtons(app).filter((button) => button.getAttribute('aria-pressed') === 'true');
  assert.equal(pressed.length, 1);
  assert.match(pressed[0].textContent, /Evidence/);
  assert.equal(goldImages(app).length, 1, 'external selection redraws but still renders exactly one gold in the current frame');
});

test('world builds safe DOM without innerHTML', () => {
  assert.equal(source.includes('innerHTML'), false);
  const app = world();
  const hostile = node(hex('a'), { role: '<img src=x onerror=PRIVATE>' });
  app.emit('rpg:pi-mission-board', { board: board(kingdom([hostile]), [mission([proof(hex('d'), '<svg>')])]), missionId: hex('1'), proofRef: null });
  assert.equal(app.elements['world-pawn-list'].textContent.includes('<img src=x onerror=PRIVATE>'), true);
  assert.equal(app.elements['world-pawn-list'].children.length, 3);
});

test('an active Pawn moves on both axes with the run sprite and caps a long frame delta at 64 ms', () => {
  const app = world();
  const moving = node(hex('b'), { rank: 'direct', relation: 'direct', active: true });
  app.emit('rpg:pi-mission-board', { board: board(kingdom([moving]), [mission()]), missionId: hex('1'), proofRef: null });
  app.runRaf(0, 0);
  const start = pawnCenter(app);
  app.runRaf(1, 640);
  const capped = pawnCenter(app);
  assert.notEqual(capped.x, start.x, 'the Pawn changes horizontal screen position');
  assert.notEqual(capped.y, start.y, 'the Pawn changes vertical screen position');
  assert.ok(Math.hypot(capped.x - start.x, capped.y - start.y) <= 6.1, 'a 640 ms pause advances no farther than the 64 ms cap');
  assert.ok(spriteImages(app, 'pawn-run.png').length > 0, 'active motion uses the run sheet');
});

test('active motion ping-pongs at segment endpoints without leaving its short station/work route', () => {
  const app = world();
  const moving = node(hex('b'), { rank: 'direct', relation: 'direct', active: true });
  app.emit('rpg:pi-mission-board', { board: board(kingdom([moving]), [mission()]), missionId: hex('1'), proofRef: null });
  const centers = [];
  for (let index = 0; index < 22; index += 1) {
    app.runRaf(index, index * 64);
    centers.push(pawnCenter(app));
  }
  const horizontalSteps = centers.slice(1).map((point, index) => Math.sign(point.x - centers[index].x)).filter(Boolean);
  assert.ok(horizontalSteps.includes(1) && horizontalSteps.includes(-1), 'horizontal travel reverses after reaching an endpoint');
  assert.ok(Math.max(...centers.map((point) => point.x)) - Math.min(...centers.map((point) => point.x)) <= 35, 'the Pawn remains within its route horizontal bounds');
  assert.ok(Math.max(...centers.map((point) => point.y)) - Math.min(...centers.map((point) => point.y)) <= 30, 'the Pawn remains within its route vertical bounds');
});

test('repeated active polls retain current position and do not create concurrent RAF callbacks', () => {
  const app = world();
  const moving = node(hex('b'), { rank: 'direct', relation: 'direct', active: true });
  const currentBoard = board(kingdom([moving]), [mission()]);
  app.emit('rpg:pi-mission-board', { board: currentBoard, missionId: hex('1'), proofRef: null });
  app.runRaf(0, 0); app.runRaf(1, 64);
  const beforePoll = pawnCenter(app);
  const queuedBeforePoll = app.rafRequests.length;
  app.emit('rpg:pi-mission-board', { board: currentBoard, missionId: hex('1'), proofRef: null });
  assert.deepEqual(pawnCenter(app), beforePoll, 'a redraw caused by the same active snapshot does not reset to station');
  assert.equal(app.rafRequests.length, queuedBeforePoll, 'the outstanding RAF is reused rather than duplicated');
  app.runRaf(2, 128);
  assert.notDeepEqual(pawnCenter(app), beforePoll, 'the retained route continues on its next frame');
});

test('terminal and stale/inactive snapshots are stationary, freeze the final position, and stop animation', () => {
  const app = world();
  const id = hex('b'); const active = node(id, { rank: 'direct', relation: 'direct', active: true });
  app.emit('rpg:pi-mission-board', { board: board(kingdom([active]), [mission()]), missionId: hex('1'), proofRef: null });
  app.runRaf(0, 0); app.runRaf(1, 64);
  const finalPosition = pawnCenter(app);
  const inactive = node(id, { rank: 'direct', relation: 'direct', lifecycle: 'completed', active: false });
  app.emit('rpg:pi-mission-board', { board: board(kingdom([inactive]), [mission()]), missionId: hex('1'), proofRef: null });
  assert.deepEqual(pawnCenter(app, 'pawn-idle.png'), finalPosition, 'terminal transition preserves the last motion position');
  assert.ok(app.cancelled.includes(3), 'the pending RAF is cancelled when no Pawn remains active');
  app.emit('rpg:pi-mission-board', { board: board(kingdom([inactive]), [mission()]), missionId: hex('1'), proofRef: null });
  assert.deepEqual(pawnCenter(app, 'pawn-idle.png'), finalPosition, 'later inactive polls remain frozen');

  const stale = world();
  stale.emit('rpg:pi-mission-board', { board: board(kingdom([node(hex('c'), { active: false })], { freshness: 'stale' }), [mission()]), missionId: hex('1'), proofRef: null });
  assert.equal(stale.rafRequests.length, 0);
  assert.match(listButtons(stale)[0].textContent, /stationary/);
});

test('reduced motion stays at station with idle rendering and stationary DOM wording', () => {
  const app = world({ reduceMotion: true });
  const moving = node(hex('a'), { active: true });
  app.emit('rpg:pi-mission-board', { board: board(kingdom([moving]), [mission()]), missionId: hex('1'), proofRef: null });
  assert.equal(app.rafRequests.length, 0);
  assert.equal(spriteImages(app, 'pawn-run.png').length, 0);
  assert.deepEqual(pawnCenter(app, 'pawn-idle.png'), { x: 400, y: 300 });
  assert.match(listButtons(app)[0].textContent, /stationary/);
});

test('hidden documents freeze motion and visible documents resume active motion without a paused-tab jump', () => {
  const app = world();
  const moving = node(hex('b'), { rank: 'direct', relation: 'direct', active: true });
  app.emit('rpg:pi-mission-board', { board: board(kingdom([moving]), [mission()]), missionId: hex('1'), proofRef: null });
  app.runRaf(0, 0); app.runRaf(1, 64);
  const frozen = pawnCenter(app);
  app.setHidden(true);
  assert.ok(app.cancelled.includes(3), 'hiding cancels the pending animation frame');
  assert.deepEqual(pawnCenter(app, 'pawn-idle.png'), frozen, 'hiding does not move the Pawn');
  app.setHidden(false);
  app.runRaf(3, 10000);
  assert.deepEqual(pawnCenter(app), frozen, 'the first visible frame establishes time instead of consuming hidden-tab elapsed time');
  app.runRaf(4, 10064);
  assert.ok(Math.hypot(pawnCenter(app).x - frozen.x, pawnCenter(app).y - frozen.y) <= 6.1, 'resumed frame remains bounded');
});

test('removed Pawn motion is discarded, and a reappearing inactive Pawn starts at its deterministic station', () => {
  const app = world();
  const id = hex('a'); const active = node(id, { active: true });
  app.emit('rpg:pi-mission-board', { board: board(kingdom([active]), [mission()]), missionId: hex('1'), proofRef: null });
  app.runRaf(0, 0); app.runRaf(1, 64);
  assert.notDeepEqual(pawnCenter(app), { x: 400, y: 300 });
  app.emit('rpg:pi-mission-board', { board: board(kingdom([]), [mission()]), missionId: hex('1'), proofRef: null });
  const returned = node(id, { lifecycle: 'completed', active: false });
  app.emit('rpg:pi-mission-board', { board: board(kingdom([returned]), [mission()]), missionId: hex('1'), proofRef: null });
  assert.deepEqual(pawnCenter(app, 'pawn-idle.png'), { x: 400, y: 300 });
});

test('current moved Pawn centers drive hit selection and confirmed handoff endpoints', () => {
  const app = world();
  const fromId = hex('a'); const toId = hex('b');
  const nodes = [node(fromId, { active: true }), node(toId, { rank: 'direct', relation: 'direct', active: true })];
  const selectedMission = mission([], { handoffs: [{ fromRunId: fromId, toRunId: toId, at: 1, basis: 'temporal_sequence' }] });
  app.emit('rpg:pi-mission-board', { board: board(kingdom(nodes), [selectedMission]), missionId: selectedMission.id, proofRef: null });
  app.runRaf(0, 0); app.runRaf(1, 64);
  const pawnDraws = app.context.frame.images.filter((entry) => entry.src === '/sprites/pawn-run.png');
  const centers = pawnDraws.map((entry) => ({ x: entry.args[4] + entry.args[6] / 2, y: entry.args[5] + entry.args[7] / 2 }));
  const handoff = app.context.frame.strokes.find((stroke) => stroke.dash.join(',') === '9,6');
  assert.deepEqual(handoff.path[0], centers[0], 'handoff starts at the moved source center');
  assert.deepEqual(handoff.path.at(-1), centers[1], 'handoff ends at the moved destination center');
  app.elements['world-canvas'].fire('pointerdown', { clientX: centers[1].x, clientY: centers[1].y });
  app.elements['world-canvas'].fire('pointerup', { clientX: centers[1].x, clientY: centers[1].y });
  assert.equal(app.events.filter((event) => event.type === 'rpg:world-pi-select').at(-1).detail.nodeId, toId);
  assert.match(listButtons(app)[0].textContent, /moving between station and work/);
});
