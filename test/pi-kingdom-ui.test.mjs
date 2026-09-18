import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'public', 'hud.js'), 'utf8');
const legacyIds = ['profiles-tbody', 'runs-tbody', 'connection-indicator', 'connection-label', 'inspector', 'create-profile-form', 'create-profile-name', 'create-profile-specialization', 'create-profile-error', 'rail-overview', 'summary-profiles', 'summary-runs', 'summary-running', 'summary-unassociated', 'summary-projects', 'profiles-count', 'runs-count', 'create-profile-submit'];
const piIds = ['pi-source-status', 'pi-source-detail', 'pi-matrix-body', 'pi-tree', 'pi-tree-count', 'pi-inspector'];

class Element {
  constructor() { this.childNodes = []; this.parentNode = null; this.attributes = new Map(); this.style = { setProperty() {} }; this.scrollTop = 0; this._text = ''; this.tabIndex = -1; this.value = ''; this.disabled = false; }
  get children() { return this.childNodes; } get firstChild() { return this.childNodes[0] || null; } get lastChild() { return this.childNodes.at(-1) || null; }
  get nextSibling() { return this.parentNode ? this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this) + 1] || null : null; }
  appendChild(n) { if (n.parentNode) n.parentNode.removeChild(n); this.childNodes.push(n); n.parentNode = this; return n; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  insertBefore(n, ref) { if (n.parentNode) n.parentNode.removeChild(n); const i = ref ? this.childNodes.indexOf(ref) : -1; this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, n); n.parentNode = this; return n; }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  set textContent(v) { this.childNodes = []; this._text = String(v); } get textContent() { return this._text + this.childNodes.map((n) => n.textContent).join(''); }
  setAttribute(k, v) { this.attributes.set(k, String(v)); } getAttribute(k) { return this.attributes.get(k) || null; } removeAttribute(k) { this.attributes.delete(k); }
  addEventListener(type, fn) { (this.listeners || (this.listeners = {}))[type] = fn; }
  get classList() { return { toggle() {}, add() {}, remove() {} }; }
  set innerHTML(_) { throw new Error('innerHTML is forbidden'); } get innerHTML() { throw new Error('innerHTML is forbidden'); }
}
function flush() { return new Promise((resolve) => setImmediate(resolve)); }
function projection(id = 'opaque-a') { return { availability: 'ready', freshness: 'fresh', otherObservationCount: 0, nodes: [{ id, parentId: null, relation: 'coordinator', depth: 0, rank: 'coordinator', role: '<hostile>', lifecycle: 'running', attention: null, activity: null, active: true }] }; }
async function hud({ pi = true, snapshot = projection() } = {}) {
  const ids = [...legacyIds, ...(pi ? piIds : [])];
  const elements = Object.fromEntries(ids.map((id) => [id, new Element()])); const events = []; const listeners = {}; const calls = [];
  class Event { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  const window = { addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); }, dispatchEvent(event) { events.push(event); (listeners[event.type] || []).forEach((fn) => fn(event)); } };
  const sandbox = { document: { getElementById: (id) => elements[id] || null, createElement: () => new Element(), createTextNode: (text) => { const e = new Element(); e.textContent = text; return e; } }, window, CustomEvent: Event, setTimeout() {}, fetch: async (url) => { calls.push(url); return { ok: true, json: async () => url === '/api/pi/kingdom' ? snapshot : [] }; }, console };
  vm.createContext(sandbox); vm.runInContext(source, sandbox, { filename: 'hud.js' });
  await flush(); await flush(); await flush();
  return { elements, events, sandbox, calls };
}

test('HUD fără elemente Pi păstrează polling legacy și nu cere endpointul Pi', async () => {
  const app = await hud({ pi: false });
  assert.equal(app.calls.includes('/api/pi/kingdom'), false);
  assert.deepEqual(app.calls.filter((url) => url === '/api/profiles' || url === '/api/runs').sort(), ['/api/profiles', '/api/runs']);
});

test('HUD randează text sigur, aria-pressed și emite snapshotul comun', async () => {
  const app = await hud();
  assert.equal(app.elements['pi-source-status'].textContent, 'ready');
  assert.equal(app.elements['pi-tree'].children.length, 1);
  assert.equal(app.elements['pi-tree'].children[0].getAttribute('aria-pressed'), 'false');
  assert.equal(app.elements['pi-tree'].textContent.includes('<hostile>'), true);
  assert.equal(app.events.some((event) => event.type === 'rpg:pi-kingdom'), true);
});

test('HUD păstrează ultimul snapshot la eșec și marchează disconnected', async () => {
  const app = await hud();
  app.sandbox.fetch = async () => ({ ok: false });
  await app.sandbox.pollPi();
  assert.equal(app.elements['pi-source-status'].textContent, 'disconnected');
  assert.equal(app.elements['pi-tree'].children.length, 1);
  assert.equal(app.events.some((event) => event.type === 'rpg:pi-disconnected'), true);
});

test('world.js leagă animația exclusiv de node.active și nu folosește innerHTML', () => {
  const world = fs.readFileSync(path.join(root, 'public', 'world.js'), 'utf8');
  assert.match(world, /snapshot\.nodes\.some\(\(node\) => node\.active === true\)/);
  assert.equal(world.includes('innerHTML'), false);
});
