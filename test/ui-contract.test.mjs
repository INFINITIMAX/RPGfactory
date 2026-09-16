import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', 'public');
const HTML = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(PUBLIC, 'hud.css'), 'utf8');
const WORLD_SOURCE = fs.readFileSync(path.join(PUBLIC, 'world.js'), 'utf8');

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.childNodes = [];
    this.parentNode = null;
    this._listeners = {};
    this._classes = new Set();
    this._text = '';
    this.dataset = {};
    this.value = '';
    this.style = {};
    this.width = 960;
    this.height = 720;
  }

  get firstChild() { return this.childNodes[0] || null; }

  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    this.childNodes.push(node);
    node.parentNode = this;
    return node;
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index >= 0) this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  set textContent(value) { this._text = String(value); }
  get textContent() { return this._text; }

  get innerHTML() { throw new Error('innerHTML interzis în lista alternativă a hărții'); }
  set innerHTML(_value) { throw new Error('innerHTML interzis în lista alternativă a hărții'); }

  get classList() {
    return {
      add: (name) => this._classes.add(name),
      remove: (name) => this._classes.delete(name),
      contains: (name) => this._classes.has(name),
    };
  }

  addEventListener(type, listener) {
    (this._listeners[type] = this._listeners[type] || []).push(listener);
  }

  dispatch(type, event = {}) {
    for (const listener of this._listeners[type] || []) listener(event);
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 960, height: 720 };
  }

  getContext() { return makeContext(); }
  setPointerCapture() {}
}

function makeContext() {
  const gradient = { addColorStop() {} };
  return {
    setTransform() {}, clearRect() {}, fillRect() {}, createRadialGradient: () => gradient,
    save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, moveTo() {},
    lineTo() {}, closePath() {}, fill() {}, stroke() {}, drawImage() {}, arc() {},
    strokeText() {}, fillText() {}, createPattern: () => ({}),
  };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function loadWorld(initialBody) {
  const ids = {
    'world-canvas': new FakeElement('canvas'),
    'world-status': new FakeElement('div'),
    'world-pawn-list': new FakeElement('div'),
    'map-zoom-in': new FakeElement('button'),
    'map-zoom-out': new FakeElement('button'),
    'map-reset': new FakeElement('button'),
    'map-zoom-value': new FakeElement('output'),
  };
  ids['map-zoom-value'].textContent = '100%';

  const windowListeners = {};
  const windowEvents = [];
  const timers = [];
  let responseBody = initialBody;
  let fetchError = null;

  const fakeWindow = {
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    addEventListener(type, listener) {
      (windowListeners[type] = windowListeners[type] || []).push(listener);
    },
    dispatchEvent(event) {
      windowEvents.push(event);
      for (const listener of windowListeners[event.type] || []) listener(event);
      return true;
    },
  };

  class FakeCustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }
  class FakeImage { set src(value) { this._src = value; } get src() { return this._src; } }

  const sandbox = {
    document: {
      getElementById: (id) => ids[id] || null,
      createElement: (tag) => new FakeElement(tag),
    },
    window: fakeWindow,
    CustomEvent: FakeCustomEvent,
    Image: FakeImage,
    performance: { now: () => 0 },
    fetch: async () => {
      if (fetchError) throw fetchError;
      return { ok: true, json: async () => responseBody };
    },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(WORLD_SOURCE, sandbox, { filename: 'public/world.js' });

  return {
    ids,
    timers,
    windowEvents,
    setResponse(body) { responseBody = body; fetchError = null; },
    failFetch(error = new Error('rețea indisponibilă')) { fetchError = error; },
  };
}

// Contracte statice care protejează gate-urile de bază, nu detalii decorative.
test('documentul declară limba, viewport-ul, Canvas-ul accesibil și controalele hărții', () => {
  assert.match(HTML, /<html\s+lang="ro">/i);
  assert.match(HTML, /<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1">/i);
  assert.match(HTML, /<canvas[^>]+id="world-canvas"[^>]+role="img"[^>]+aria-label="[^"]+"/is);
  for (const id of ['map-zoom-out', 'map-zoom-in', 'map-reset']) {
    assert.match(HTML, new RegExp(`id="${id}"`));
  }
  assert.match(HTML, /id="world-status"[^>]+role="status"[^>]+aria-live="polite"/is);
  assert.match(HTML, /id="world-pawn-list"[^>]+aria-label="[^"]+"/is);
});

test('layout-ul declară fallback mobil și reduced-motion', () => {
  assert.match(CSS, /@media\s*\(max-width:\s*520px\)/i);
  assert.match(CSS, /55dvh/i);
  assert.match(CSS, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i);
});

test('alternativa Canvas devine un panou neclipped cu focus vizibil când conține focusul', () => {
  assert.match(HTML, /id="world-pawn-list"[^>]+class="[^"]*canvas-alternative[^"]*"/is);
  const focusWithin = CSS.match(/\.canvas-alternative:focus-within\s*\{([^}]+)\}/i);
  assert.ok(focusWithin, 'lipsește mecanismul :focus-within care scoate alternativa din sr-only');
  assert.match(focusWithin[1], /clip:\s*auto\s*!important/i);
  assert.match(focusWithin[1], /width:\s*min\(/i);
  assert.match(focusWithin[1], /overflow:\s*auto\s*!important/i);
  assert.match(CSS, /\.canvas-alternative button:focus-visible\s*\{[^}]*outline:\s*3px\s+solid/is);
});

test('harta arată loading, apoi actualizează lista DOM din pawn-ii reali fără innerHTML', async () => {
  const maliciousName = '<img src=x onerror=alert(1)>';
  const app = loadWorld({
    zones: [{ project: 'regat', accent: '#123456', cells: [{ q: 0, r: 0 }] }],
    pawns: [{ profileId: 'p1', name: maliciousName, project: 'regat', slotIndex: 0, working: false, sizeFactor: 1 }],
  });

  assert.equal(app.ids['world-status'].dataset.state, 'loading');
  assert.match(app.ids['world-status'].textContent, /încarcă/i);
  await flush();
  await flush();

  assert.equal(app.ids['world-status'].dataset.state, 'ready');
  const list = app.ids['world-pawn-list'];
  assert.equal(list.childNodes.length, 2, 'lista trebuie să conțină explicația și pawn-ul real');
  assert.equal(list.childNodes[1].tagName, 'button');
  assert.match(list.childNodes[1].textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(list.childNodes[1].childNodes.length, 0, 'numele extern trebuie păstrat ca text, nu interpretat ca markup');

  list.childNodes[1].dispatch('click');
  const selection = app.windowEvents.find((event) => event.type === 'rpg:world-profile-select');
  assert.equal(selection.detail.profileId, 'p1');
});

test('starea empty are text explicit, fără a lăsa doar Canvas-ul mut', async () => {
  const app = loadWorld({ zones: [], pawns: [] });
  await flush();
  await flush();

  assert.equal(app.ids['world-status'].dataset.state, 'empty');
  assert.match(app.ids['world-status'].textContent, /goală/i);
  assert.match(app.ids['world-pawn-list'].childNodes[0].textContent, /nu există specialiști/i);
});

test('eroarea de polling marchează explicit instantaneul stale și păstrează alternativa DOM validă', async () => {
  const app = loadWorld({
    zones: [{ project: 'regat', accent: '#123456', cells: [{ q: 0, r: 0 }] }],
    pawns: [{ profileId: 'p1', name: 'Ada', project: 'regat', slotIndex: 0, working: false }],
  });
  await flush();
  await flush();
  assert.equal(app.ids['world-pawn-list'].childNodes.length, 2);

  app.failFetch();
  const timer = app.timers.shift();
  assert.equal(timer.ms, 3000);
  await timer.fn();

  assert.equal(app.ids['world-status'].dataset.state, 'error');
  assert.match(app.ids['world-status'].textContent, /ultimul instantaneu/i);
  assert.equal(app.ids['world-pawn-list'].childNodes[1].textContent, 'Ada — regat, fără lucru confirmat');
});

test('pointer hit-testing selectează numai click-ul pe pawn, nu exteriorul sau drag-ul peste pawn', async () => {
  const app = loadWorld({
    zones: [{ project: 'regat', accent: '#123456', cells: [{ q: 0, r: 0 }] }],
    pawns: [{ profileId: 'p-hit', name: 'Ada', project: 'regat', slotIndex: 0, working: false, sizeFactor: 1 }],
  });
  await flush();
  await flush();
  const canvas = app.ids['world-canvas'];
  // Pentru celula axială (0,0), camera de 960×720 centrează pawn-ul aici.
  const target = { x: 480, y: 373 };
  const selections = () => app.windowEvents.filter((event) => event.type === 'rpg:world-profile-select');

  canvas.dispatch('pointerdown', { pointerId: 1, clientX: target.x, clientY: target.y });
  canvas.dispatch('pointerup', { pointerId: 1, clientX: target.x, clientY: target.y });
  assert.equal(selections().length, 1);
  assert.equal(selections()[0].detail.profileId, 'p-hit');

  canvas.dispatch('pointerdown', { pointerId: 2, clientX: 10, clientY: 10 });
  canvas.dispatch('pointerup', { pointerId: 2, clientX: 10, clientY: 10 });
  assert.equal(selections().length, 1, 'click-ul în afara razei nu trebuie să selecteze');

  canvas.dispatch('pointerdown', { pointerId: 3, clientX: target.x, clientY: target.y });
  canvas.dispatch('pointermove', { pointerId: 3, clientX: target.x + 20, clientY: target.y + 20 });
  canvas.dispatch('pointerup', { pointerId: 3, clientX: target.x + 20, clientY: target.y + 20 });
  assert.equal(selections().length, 1, 'pan-ul pornit pe pawn nu trebuie interpretat drept click');
});

test('zoom-ul din controale este limitat și resetarea revine la 100%', async () => {
  const app = loadWorld({ zones: [], pawns: [] });
  await flush();
  await flush();

  for (let index = 0; index < 30; index++) app.ids['map-zoom-in'].dispatch('click');
  assert.equal(app.ids['map-zoom-value'].textContent, '240%');
  for (let index = 0; index < 60; index++) app.ids['map-zoom-out'].dispatch('click');
  assert.equal(app.ids['map-zoom-value'].textContent, '65%');
  app.ids['map-reset'].dispatch('click');
  assert.equal(app.ids['map-zoom-value'].textContent, '100%');
});
