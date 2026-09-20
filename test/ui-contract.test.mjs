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
  get innerHTML() { throw new Error('innerHTML is forbidden in the alternative list'); } set innerHTML(_) { throw new Error('innerHTML is forbidden in the alternative list'); }
  addEventListener(type, listener) { (this._listeners[type] = this._listeners[type] || []).push(listener); }
  dispatch(type, event = {}) { for (const listener of this._listeners[type] || []) listener({ preventDefault() {}, ...event }); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 720 }; } getContext() { return makeContext(); } setPointerCapture() {}
}
function makeContext() { const gradient = { addColorStop() {} }; return { setTransform() {}, clearRect() {}, fillRect() {}, strokeRect() {}, createRadialGradient: () => gradient, beginPath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {}, fill() {}, stroke() {}, drawImage() {}, arc() {}, fillText() {}, strokeText() {}, setLineDash() {}, measureText(text) { return { width: String(text).length * 7 }; } }; }
function snapshot({ availability = 'ready', freshness = 'fresh', active = true, id = 'opaque-node', role = '<hostile>' } = {}) { return { availability, freshness, nodes: availability === 'unavailable' ? [] : [{ id, parentId: null, relation: 'coordinator', depth: 0, rank: 'coordinator', role, lifecycle: 'running', attention: null, active }] }; }
function board(kingdom) { return { schemaVersion: 1, source: 'rpgfactory-pi-mission-board', observedAt: 1, missionAvailability: 'ready', truncated: { missions: false, runs: false, proofs: false }, warnings: [], kingdom, missions: [] }; }
function loadWorld() {
  const ids = Object.fromEntries(['world-canvas', 'world-status', 'world-pawn-list', 'map-zoom-in', 'map-zoom-out', 'map-reset', 'map-zoom-value'].map((id) => [id, new FakeElement(id === 'world-canvas' ? 'canvas' : 'div')]));
  ids['map-zoom-value'].textContent = '100%'; const listeners = {}; const events = [];
  class FakeCustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  class FakeImage { constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; } set src(value) { this._src = value; } addEventListener() {} }
  const window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }), addEventListener(type, listener) { (listeners[type] || (listeners[type] = [])).push(listener); }, dispatchEvent(event) { events.push(event); for (const listener of listeners[event.type] || []) listener(event); return true; } };
  const sandbox = { document: { getElementById: (id) => ids[id] || null, createElement: (tag) => new FakeElement(tag) }, window, CustomEvent: FakeCustomEvent, Image: FakeImage, performance: { now: () => 0 }, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, console };
  vm.createContext(sandbox); vm.runInContext(WORLD_SOURCE, sandbox, { filename: 'public/world.js' });
  return { ids, events, emit(type, detail) { window.dispatchEvent(new FakeCustomEvent(type, { detail })); } };
}

test('the document declares English, the viewport, an accessible Canvas, and map controls', () => {
  assert.match(HTML, /<html\s+lang="en">/i); assert.match(HTML, /name="viewport"\s+content="width=device-width,\s*initial-scale=1"/i);
  assert.match(HTML, /<canvas[^>]+id="world-canvas"[^>]+role="img"[^>]+aria-label=/is);
  for (const id of ['map-zoom-out', 'map-zoom-in', 'map-reset']) assert.match(HTML, new RegExp(`id="${id}"`));
  assert.match(HTML, /id="world-status"[^>]+role="status"[^>]+aria-live="polite"/is);
});

test('the layout is map-dominant with an overlay drawer, no mobile overflow, and a focusable alternative', () => {
  assert.match(CSS, /body\s*\{[^}]*overflow:\s*hidden/is);
  assert.match(CSS, /#world-section\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/is);
  assert.match(CSS, /\.operations-drawer\s*\{[^}]*position:\s*absolute[^}]*right:\s*0[^}]*transform:\s*translateX\(105%\)/is);
  assert.match(CSS, /\.operations-drawer\.is-open\s*\{[^}]*transform:\s*translateX\(0\)/is);
  assert.match(CSS, /@media\s*\(max-width:\s*520px\)/i); assert.match(CSS, /prefers-reduced-motion:\s*reduce/i);
  const focus = CSS.match(/\.canvas-alternative:focus-within\s*\{([^}]+)\}/i);
  assert.ok(focus); assert.match(focus[1], /z-index:\s*10/i); assert.match(focus[1], /clip:\s*auto\s*!important/i); assert.match(focus[1], /width:\s*auto\s*!important/i); assert.match(focus[1], /overflow:\s*auto\s*!important/i);
  assert.match(CSS, /\.drawer-backdrop\s*\{[^}]*z-index:\s*19/is);
  assert.match(CSS, /\.operations-drawer\s*\{[^}]*z-index:\s*20/is);
  assert.match(CSS, /button:focus-visible[^\{]*\{[^}]*outline:\s*3px\s+solid/is);
});

test('the composition loads at least eight local assets, has a procedural fallback, and excludes perspective', () => {
  const spritePaths = [...WORLD_SOURCE.matchAll(/['"](\/sprites\/[^'"]+)['"]/g)].map((match) => match[1]);
  assert.ok(new Set(spritePaths).size >= 8, 'at least eight distinct local assets are declared');
  for (const required of ['building-castle.png', 'building-barracks.png', 'building-archery.png', 'building-monastery.png', 'building-house-1.png', 'building-house-2.png', 'building-house-3.png', 'building-watchtower.png']) {
    assert.ok(spritePaths.some((value) => value.endsWith(required)), `missing asset ${required}`);
  }
  assert.match(WORLD_SOURCE, /if\s*\(spriteReady\(image\)\s*&&\s*sourceFrame\)\s*ctx\.drawImage\(image,\s*sourceFrame\.x,\s*sourceFrame\.y,\s*sourceFrame\.width,\s*sourceFrame\.height,/);
  assert.match(WORLD_SOURCE, /else\s*\{\s*ctx\.fillStyle\s*=\s*color/);
  assert.match(WORLD_SOURCE, /function\s+drawBuildingFallback\s*\(/);
  assert.doesNotMatch(CSS + '\n' + WORLD_SOURCE, /\b(?:perspective|rotateX|rotateY|skew)\s*(?::|\()/i);
});

test('world does not fetch, starts loading, and renders safe text plus opaque selection from a Pi snapshot', () => {
  const app = loadWorld();
  assert.equal(app.ids['world-status'].dataset.state, 'loading'); assert.match(app.ids['world-status'].textContent, /Waiting for a Pi observation/);
  app.emit('rpg:pi-mission-board', { board: board(snapshot()), missionId: null, proofRef: null });
  const list = app.ids['world-pawn-list'];
  assert.equal(app.ids['world-status'].dataset.state, 'ready'); assert.equal(list.children.length, 2);
  assert.match(list.children[1].textContent, /<hostile>/); assert.equal(list.children[1].children.length, 0);
  list.children[1].dispatch('click');
  const selection = app.events.find((event) => event.type === 'rpg:world-pi-select');
  assert.ok(selection, 'clicking the node must emit the Pi selection');
  assert.equal(selection.detail.nodeId, 'opaque-node');
  assert.equal(WORLD_SOURCE.includes('fetch('), false);
});

test('unavailable and stale are distinct; stale keeps inactive nodes in the DOM alternative', () => {
  const empty = loadWorld(); empty.emit('rpg:pi-mission-board', { board: board(snapshot({ availability: 'unavailable' })), missionId: null, proofRef: null });
  assert.equal(empty.ids['world-status'].dataset.state, 'empty'); assert.match(empty.ids['world-status'].textContent, /No Pi observation is available/);
  const stale = loadWorld(); stale.emit('rpg:pi-mission-board', { board: board(snapshot({ freshness: 'stale', active: false })), missionId: null, proofRef: null });
  assert.equal(stale.ids['world-status'].dataset.state, 'stale'); assert.equal(stale.ids['world-pawn-list'].children.length, 2); assert.equal(stale.ids['world-pawn-list'].children[1].textContent.includes('stale'), true);
});

test('disconnected keeps the list from the last valid snapshot', () => {
  const app = loadWorld(); app.emit('rpg:pi-mission-board', { board: board(snapshot()), missionId: null, proofRef: null }); const before = app.ids['world-pawn-list'].textContent;
  app.emit('rpg:pi-disconnected', {});
  assert.equal(app.ids['world-status'].dataset.state, 'disconnected'); assert.match(app.ids['world-status'].textContent, /last snapshot/i); assert.equal(app.ids['world-pawn-list'].textContent, before);
});

test('hit testing selects only a node click, not an outside click or drag', () => {
  const app = loadWorld(); app.emit('rpg:pi-mission-board', { board: board(snapshot()), missionId: null, proofRef: null }); const canvas = app.ids['world-canvas'];
  const selected = () => app.events.filter((event) => event.type === 'rpg:world-pi-select');
  canvas.dispatch('pointerdown', { pointerId: 1, clientX: 480, clientY: 360 }); canvas.dispatch('pointerup', { pointerId: 1, clientX: 480, clientY: 360 });
  assert.equal(selected().length, 1); assert.equal(selected()[0].detail.nodeId, 'opaque-node');
  canvas.dispatch('pointerdown', { pointerId: 2, clientX: 10, clientY: 10 }); canvas.dispatch('pointerup', { pointerId: 2, clientX: 10, clientY: 10 });
  canvas.dispatch('pointerdown', { pointerId: 3, clientX: 480, clientY: 360 }); canvas.dispatch('pointermove', { pointerId: 3, clientX: 500, clientY: 380 }); canvas.dispatch('pointerup', { pointerId: 3, clientX: 500, clientY: 380 });
  assert.equal(selected().length, 1, 'dragging moves the map without selecting');
  canvas.dispatch('pointerdown', { pointerId: 4, clientX: 500, clientY: 380 }); canvas.dispatch('pointerup', { pointerId: 4, clientX: 500, clientY: 380 });
  assert.equal(selected().length, 2, 'after panning, the hit target follows the drawn position');
});

test('zoom is bounded and reset returns to 100%', () => {
  const app = loadWorld(); for (let i = 0; i < 30; i++) app.ids['map-zoom-in'].dispatch('click'); assert.equal(app.ids['map-zoom-value'].textContent, '220%');
  for (let i = 0; i < 60; i++) app.ids['map-zoom-out'].dispatch('click'); assert.equal(app.ids['map-zoom-value'].textContent, '65%'); app.ids['map-reset'].dispatch('click'); assert.equal(app.ids['map-zoom-value'].textContent, '100%');
});
