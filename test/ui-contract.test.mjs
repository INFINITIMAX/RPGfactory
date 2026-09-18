import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const HTML = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(PUBLIC, 'hud.css'), 'utf8');
const WORLD_SOURCE = fs.readFileSync(path.join(PUBLIC, 'world.js'), 'utf8');

class FakeElement {
  constructor(tagName) { this.tagName = tagName; this.childNodes = []; this.parentNode = null; this._listeners = {}; this._text = ''; this.dataset = {}; this.style = {}; this.width = 960; this.height = 720; this.attributes = new Map(); }
  get firstChild() { return this.childNodes[0] || null; } get children() { return this.childNodes; }
  appendChild(node) { if (node.parentNode) node.parentNode.removeChild(node); this.childNodes.push(node); node.parentNode = this; return node; }
  removeChild(node) { const i = this.childNodes.indexOf(node); if (i >= 0) this.childNodes.splice(i, 1); node.parentNode = null; return node; }
  set textContent(value) { this.childNodes = []; this._text = String(value); } get textContent() { return this._text + this.childNodes.map((node) => node.textContent).join(''); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); } getAttribute(name) { return this.attributes.get(name) || null; }
  get innerHTML() { throw new Error('innerHTML interzis în lista alternativă'); } set innerHTML(_) { throw new Error('innerHTML interzis în lista alternativă'); }
  addEventListener(type, listener) { (this._listeners[type] = this._listeners[type] || []).push(listener); }
  dispatch(type, event = {}) { for (const listener of this._listeners[type] || []) listener({ preventDefault() {}, ...event }); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 720 }; } getContext() { return makeContext(); } setPointerCapture() {}
}
function makeContext() { const gradient = { addColorStop() {} }; return { setTransform() {}, clearRect() {}, fillRect() {}, createRadialGradient: () => gradient, beginPath() {}, moveTo() {}, lineTo() {}, fill() {}, stroke() {}, drawImage() {}, arc() {}, fillText() {} }; }
function snapshot({ availability = 'ready', freshness = 'fresh', active = true, id = 'opaque-node', role = '<hostile>' } = {}) { return { availability, freshness, nodes: availability === 'unavailable' ? [] : [{ id, parentId: null, relation: 'coordinator', depth: 0, rank: 'coordinator', role, lifecycle: 'running', attention: null, active }] }; }
function loadWorld() {
  const ids = Object.fromEntries(['world-canvas', 'world-status', 'world-pawn-list', 'map-zoom-in', 'map-zoom-out', 'map-reset', 'map-zoom-value'].map((id) => [id, new FakeElement(id === 'world-canvas' ? 'canvas' : 'div')]));
  ids['map-zoom-value'].textContent = '100%'; const listeners = {}; const events = [];
  class FakeCustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  class FakeImage { set src(value) { this._src = value; } }
  const window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }), addEventListener(type, listener) { (listeners[type] || (listeners[type] = [])).push(listener); }, dispatchEvent(event) { events.push(event); for (const listener of listeners[event.type] || []) listener(event); return true; } };
  const sandbox = { document: { getElementById: (id) => ids[id] || null, createElement: (tag) => new FakeElement(tag) }, window, CustomEvent: FakeCustomEvent, Image: FakeImage, performance: { now: () => 0 }, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, console };
  vm.createContext(sandbox); vm.runInContext(WORLD_SOURCE, sandbox, { filename: 'public/world.js' });
  return { ids, events, emit(type, detail) { window.dispatchEvent(new FakeCustomEvent(type, { detail })); } };
}

test('documentul declară limba, viewport, Canvas accesibil și controale hartă', () => {
  assert.match(HTML, /<html\s+lang="ro">/i); assert.match(HTML, /name="viewport"\s+content="width=device-width,\s*initial-scale=1"/i);
  assert.match(HTML, /<canvas[^>]+id="world-canvas"[^>]+role="img"[^>]+aria-label=/is);
  for (const id of ['map-zoom-out', 'map-zoom-in', 'map-reset']) assert.match(HTML, new RegExp(`id="${id}"`));
  assert.match(HTML, /id="world-status"[^>]+role="status"[^>]+aria-live="polite"/is);
});

test('layout-ul păstrează mobil, reduced-motion și alternativa focusabilă neclipped', () => {
  assert.match(CSS, /@media\s*\(max-width:\s*520px\)/i); assert.match(CSS, /55dvh/i); assert.match(CSS, /prefers-reduced-motion:\s*reduce/i);
  const focus = CSS.match(/\.canvas-alternative:focus-within\s*\{([^}]+)\}/i);
  assert.ok(focus); assert.match(focus[1], /clip:\s*auto\s*!important/i); assert.match(focus[1], /width:\s*(auto!important|min\()/i); assert.match(focus[1], /overflow:\s*auto\s*!important/i);
  assert.match(CSS, /button:focus-visible[^\{]*\{[^}]*outline:\s*3px\s+solid/is);
});

test('world nu face fetch, începe loading și snapshotul Pi randează text sigur + selecție opacă', () => {
  const app = loadWorld();
  assert.equal(app.ids['world-status'].dataset.state, 'loading'); assert.match(app.ids['world-status'].textContent, /Se așteaptă observația Pi/);
  app.emit('rpg:pi-kingdom', { snapshot: snapshot() });
  const list = app.ids['world-pawn-list'];
  assert.equal(app.ids['world-status'].dataset.state, 'ready'); assert.equal(list.children.length, 2);
  assert.match(list.children[1].textContent, /<hostile>/); assert.equal(list.children[1].children.length, 0);
  list.children[1].dispatch('click');
  const selection = app.events.find((event) => event.type === 'rpg:world-pi-select');
  assert.ok(selection, 'click-ul pe nod trebuie să emită selecția Pi');
  assert.equal(selection.detail.nodeId, 'opaque-node');
  assert.equal(WORLD_SOURCE.includes('fetch('), false);
});

test('unavailable și stale sunt distincte; stale păstrează nodurile inactive în alternativa DOM', () => {
  const empty = loadWorld(); empty.emit('rpg:pi-kingdom', { snapshot: snapshot({ availability: 'unavailable' }) });
  assert.equal(empty.ids['world-status'].dataset.state, 'empty'); assert.match(empty.ids['world-status'].textContent, /Nicio observație Pi disponibilă/);
  const stale = loadWorld(); stale.emit('rpg:pi-kingdom', { snapshot: snapshot({ freshness: 'stale', active: false }) });
  assert.equal(stale.ids['world-status'].dataset.state, 'stale'); assert.equal(stale.ids['world-pawn-list'].children.length, 2); assert.equal(stale.ids['world-pawn-list'].children[1].textContent.includes('stale'), true);
});

test('disconnected păstrează lista ultimului snapshot valid', () => {
  const app = loadWorld(); app.emit('rpg:pi-kingdom', { snapshot: snapshot() }); const before = app.ids['world-pawn-list'].textContent;
  app.emit('rpg:pi-disconnected', {});
  assert.equal(app.ids['world-status'].dataset.state, 'disconnected'); assert.match(app.ids['world-status'].textContent, /ultimul instantaneu/i); assert.equal(app.ids['world-pawn-list'].textContent, before);
});

test('hit-testing selectează numai click-ul pe nod, nu exteriorul sau drag-ul', () => {
  const app = loadWorld(); app.emit('rpg:pi-kingdom', { snapshot: snapshot() }); const canvas = app.ids['world-canvas'];
  const selected = () => app.events.filter((event) => event.type === 'rpg:world-pi-select');
  canvas.dispatch('pointerdown', { pointerId: 1, clientX: 480, clientY: 360 }); canvas.dispatch('pointerup', { pointerId: 1, clientX: 480, clientY: 360 });
  assert.equal(selected().length, 1); assert.equal(selected()[0].detail.nodeId, 'opaque-node');
  canvas.dispatch('pointerdown', { pointerId: 2, clientX: 10, clientY: 10 }); canvas.dispatch('pointerup', { pointerId: 2, clientX: 10, clientY: 10 });
  canvas.dispatch('pointerdown', { pointerId: 3, clientX: 480, clientY: 360 }); canvas.dispatch('pointermove', { pointerId: 3, clientX: 500, clientY: 380 }); canvas.dispatch('pointerup', { pointerId: 3, clientX: 500, clientY: 380 });
  assert.equal(selected().length, 1);
});

test('zoom-ul este limitat și resetarea revine la 100%', () => {
  const app = loadWorld(); for (let i = 0; i < 30; i++) app.ids['map-zoom-in'].dispatch('click'); assert.equal(app.ids['map-zoom-value'].textContent, '240%');
  for (let i = 0; i < 60; i++) app.ids['map-zoom-out'].dispatch('click'); assert.equal(app.ids['map-zoom-value'].textContent, '65%'); app.ids['map-reset'].dispatch('click'); assert.equal(app.ids['map-zoom-value'].textContent, '100%');
});
