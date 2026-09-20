import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'public', 'hud.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const legacyIds = ['profiles-tbody', 'runs-tbody', 'connection-indicator', 'connection-label', 'inspector', 'create-profile-form', 'create-profile-name', 'create-profile-specialization', 'create-profile-error', 'rail-overview', 'summary-profiles', 'summary-runs', 'summary-running', 'summary-unassociated', 'summary-projects', 'profiles-count', 'runs-count', 'create-profile-submit'];
const piIds = ['pi-source-status', 'pi-source-detail', 'pi-matrix-body', 'pi-tree', 'pi-tree-count', 'pi-inspector', 'pi-mission-status', 'pi-mission-select', 'pi-mission-detail', 'pi-mission-summary', 'pi-handoffs', 'pi-proofs'];
const drawerIds = ['operations-toggle', 'operations-close', 'operations-rail', 'operations-backdrop', 'world-section', 'drawer-last'];
const hex = (digit) => digit.repeat(64);

class Element {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase(); this.childNodes = []; this.parentNode = null;
    this.attributes = new Map(); this.style = { setProperty() {} }; this.dataset = {}; this.scrollTop = 0;
    this._text = ''; this.tabIndex = -1; this.value = ''; this.disabled = false; this.selected = false;
    this.listeners = {}; this.className = ''; this.type = ''; this.focused = false;
  }
  get children() { return this.childNodes; }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes.at(-1) || null; }
  get nextSibling() { return this.parentNode ? this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this) + 1] || null : null; }
  appendChild(node) { if (node.parentNode) node.parentNode.removeChild(node); this.childNodes.push(node); node.parentNode = this; return node; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  insertBefore(node, reference) { if (node.parentNode) node.parentNode.removeChild(node); const index = reference ? this.childNodes.indexOf(reference) : -1; this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, node); node.parentNode = this; return node; }
  removeChild(node) { const index = this.childNodes.indexOf(node); if (index >= 0) this.childNodes.splice(index, 1); node.parentNode = null; return node; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  set textContent(value) { this.childNodes = []; this._text = String(value); }
  get textContent() { return this._text + this.childNodes.map((node) => node.textContent).join(''); }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) || null; }
  removeAttribute(key) { this.attributes.delete(key); }
  addEventListener(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); }
  fire(type, event = {}) { for (const fn of this.listeners[type] || []) fn({ target: this, preventDefault() {}, ...event }); }
  get classList() {
    const element = this;
    const names = () => new Set(element.className.split(/\s+/).filter(Boolean));
    const save = (set) => { element.className = [...set].join(' '); };
    return {
      toggle(name, force) { const set = names(); const enabled = force === undefined ? !set.has(name) : !!force; if (enabled) set.add(name); else set.delete(name); save(set); return enabled; },
      add(name) { const set = names(); set.add(name); save(set); },
      remove(name) { const set = names(); set.delete(name); save(set); },
      contains(name) { return names().has(name); },
    };
  }
  contains(node) { return node === this || this.childNodes.some((child) => child.contains && child.contains(node)); }
  focus() { this.focused = true; if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  set innerHTML(_) { throw new Error('innerHTML is forbidden'); }
  get innerHTML() { throw new Error('innerHTML is forbidden'); }
}

function kingdom(nodes = [
  { id: hex('a'), parentId: null, relation: 'coordinator', depth: 0, rank: 'coordinator', role: '<hostile-planner>', lifecycle: 'running', attention: null, activity: 'coordinating', startedAt: 1, lastActivityAt: 2, active: true },
  { id: hex('b'), parentId: hex('a'), relation: 'direct', depth: 1, rank: 'direct', role: 'coder', lifecycle: 'completed', attention: null, activity: null, startedAt: 3, lastActivityAt: 4, active: false },
]) {
  return { schemaVersion: 1, source: 'pi-subagents', availability: 'ready', freshness: 'fresh', observedAt: 4, otherObservationCount: 0, truncated: false, warnings: [], nodes };
}
function mission(id, proofRefs = [hex('d')], changes = {}) {
  return {
    id, status: 'active', createdAt: 1, updatedAt: 2, goalStatus: 'active', usageTokens: 5, openDecisionCount: 1,
    runs: [
      { id: hex('a'), mode: 'workflow', status: 'completed', startedAt: 1, completedAt: 2, usageTokens: 2, linked: true, role: '<hostile-planner>' },
      { id: hex('c'), mode: 'workflow', status: 'running', startedAt: 3, completedAt: null, usageTokens: null, linked: false, role: null },
    ],
    handoffs: [],
    proofs: proofRefs.map((ref, index) => ({ ref, source: index ? 'receipt' : 'artifact', kind: index ? 'ci' : '<hostile-kind>', status: index ? 'succeeded' : null })),
    ...changes,
  };
}
function board(changes = {}) {
  return {
    schemaVersion: 1, source: 'rpgfactory-pi-mission-board', observedAt: 2, missionAvailability: 'ready',
    truncated: { missions: false, runs: false, proofs: false }, warnings: [], kingdom: kingdom(),
    missions: [mission(hex('1'), []), mission(hex('2'), [hex('d'), hex('e')])], ...changes,
  };
}
function response(value, ok = true) { return { ok, json: async () => value }; }
function flush() { return new Promise((resolve) => setImmediate(resolve)); }

function createHud({ includePi = true, missionFetch } = {}) {
  const ids = [...legacyIds, ...drawerIds, ...(includePi ? piIds : [])];
  const elements = Object.fromEntries(ids.map((id) => [id, new Element()]));
  elements['operations-toggle'].setAttribute('aria-expanded', 'false');
  elements['operations-rail'].setAttribute('aria-hidden', 'true');
  elements['operations-rail'].appendChild(elements['operations-close']);
  elements['operations-rail'].appendChild(elements['drawer-last']);
  elements['operations-rail'].querySelectorAll = () => [elements['operations-close'], elements['drawer-last']];
  if (includePi) {
    elements['pi-source-status'].textContent = 'loading';
    elements['pi-mission-status'].textContent = 'loading';
  }
  const events = []; const listeners = {}; const documentListeners = {}; const calls = [];
  class Event { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } }
  const window = {
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    dispatchEvent(event) { events.push(event); for (const fn of listeners[event.type] || []) fn(event); return true; },
  };
  let missionHandler = missionFetch || (async () => response(board()));
  const documentObject = {
    activeElement: null,
    getElementById: (id) => elements[id] || null,
    createElement: (tag) => { const element = new Element(tag); element.ownerDocument = documentObject; return element; },
    createTextNode: (text) => { const element = new Element('#text'); element.ownerDocument = documentObject; element.textContent = text; return element; },
    addEventListener(type, fn) { (documentListeners[type] || (documentListeners[type] = [])).push(fn); },
  };
  Object.values(elements).forEach((element) => { element.ownerDocument = documentObject; });
  const sandbox = {
    document: documentObject,
    window, CustomEvent: Event, setTimeout() {}, console,
    fetch: async (url) => {
      calls.push(url);
      if (url === '/api/pi/mission-board') return missionHandler(url);
      if (url === '/api/profiles' || url === '/api/runs') return response([]);
      throw new Error(`unexpected fetch ${url}`);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'hud.js' });
  return {
    elements, events, listeners, calls, sandbox, window,
    fireDocument(type, event = {}) {
      const dispatched = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...event };
      for (const fn of documentListeners[type] || []) fn(dispatched);
      return dispatched;
    },
    setMissionHandler(fn) { missionHandler = fn; },
  };
}

async function settledHud(options) { const app = createHud(options); await flush(); await flush(); await flush(); return app; }

test('the HUD without Pi elements keeps legacy polling and does not request the Pi surface', async () => {
  const app = await settledHud({ includePi: false });
  assert.equal(app.calls.includes('/api/pi/mission-board'), false);
  assert.equal(app.calls.includes('/api/pi/kingdom'), false);
  assert.deepEqual(app.calls.filter((url) => url === '/api/profiles' || url === '/api/runs').sort(), ['/api/profiles', '/api/runs']);
});

test('the modal drawer isolates the world, traps Tab and Shift+Tab, and restores focus', async () => {
  assert.match(indexHtml, /id="operations-toggle"[^>]+aria-controls="operations-rail"[^>]+aria-expanded="false"/is);
  assert.match(indexHtml, /id="operations-rail"[^>]+role="dialog"[^>]+aria-modal="true"[^>]+aria-labelledby="operations-title"[^>]+aria-hidden="true"/is);
  const app = await settledHud();
  const toggle = app.elements['operations-toggle'];
  const close = app.elements['operations-close'];
  const last = app.elements['drawer-last'];
  const rail = app.elements['operations-rail'];
  const backdrop = app.elements['operations-backdrop'];
  const worldSection = app.elements['world-section'];

  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(rail.getAttribute('aria-hidden'), 'true');
  assert.equal(worldSection.getAttribute('inert'), null);

  toggle.fire('click');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(rail.getAttribute('aria-hidden'), 'false');
  assert.equal(rail.classList.contains('is-open'), true);
  assert.equal(backdrop.classList.contains('is-open'), true);
  assert.equal(backdrop.tabIndex, -1);
  assert.equal(worldSection.inert, true);
  assert.equal(worldSection.attributes.has('inert'), true, 'the boolean inert attribute is present');
  assert.equal(app.sandbox.document.activeElement, close);

  const reverseWrap = app.fireDocument('keydown', { key: 'Tab', shiftKey: true });
  assert.equal(reverseWrap.defaultPrevented, true);
  assert.equal(app.sandbox.document.activeElement, last, 'Shift+Tab from the first control reaches the last control');
  const forwardWrap = app.fireDocument('keydown', { key: 'Tab', shiftKey: false });
  assert.equal(forwardWrap.defaultPrevented, true);
  assert.equal(app.sandbox.document.activeElement, close, 'Tab from the last control returns to the first control');
  toggle.focus();
  const outsideRecovery = app.fireDocument('keydown', { key: 'Tab' });
  assert.equal(outsideRecovery.defaultPrevented, true);
  assert.equal(app.sandbox.document.activeElement, close, 'focus outside the drawer is returned to the dialog');

  close.fire('click');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(worldSection.inert, false);
  assert.equal(worldSection.attributes.has('inert'), false);
  assert.equal(app.sandbox.document.activeElement, toggle, 'closing restores focus to the toggle');
  toggle.fire('click'); backdrop.fire('click');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(worldSection.attributes.has('inert'), false);
  toggle.fire('click'); app.fireDocument('keydown', { key: 'Escape' });
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(rail.getAttribute('aria-hidden'), 'true');
  assert.equal(worldSection.attributes.has('inert'), false);
});

test('loading is the default, followed by one Pi fetch and one shared snapshot', async () => {
  assert.match(indexHtml, /id="pi-source-status"[^>]*>loading<\/[^>]+>/);
  assert.match(indexHtml, /id="pi-mission-status"[^>]*>loading<\/[^>]+>/);

  let resolveMission;
  const pending = new Promise((resolve) => { resolveMission = resolve; });
  const app = createHud({ missionFetch: () => pending });
  assert.equal(app.elements['pi-source-status'].textContent, 'loading');
  assert.equal(app.elements['pi-mission-status'].textContent, 'loading');
  assert.equal(app.calls.filter((url) => url === '/api/pi/mission-board').length, 1);
  assert.equal(app.calls.includes('/api/pi/kingdom'), false);

  resolveMission(response(board()));
  await flush(); await flush();
  assert.equal(app.elements['pi-source-status'].textContent, 'ready');
  assert.equal(app.events.filter((event) => event.type === 'rpg:pi-mission-board').length, 1);
  const common = app.events.find((event) => event.type === 'rpg:pi-mission-board').detail;
  assert.equal(common.board.kingdom.nodes.length, 2);
  assert.equal(common.missionId, hex('1'));
});

test('ready-empty, unavailable, and disconnected remain distinct while the last snapshot stays visible', async () => {
  const readyEmpty = await settledHud({ missionFetch: async () => response(board({ missions: [] })) });
  assert.equal(readyEmpty.elements['pi-mission-status'].textContent, 'empty');
  assert.match(readyEmpty.elements['pi-proofs'].textContent, /No evidence/);

  const unavailable = await settledHud({ missionFetch: async () => response(board({ missionAvailability: 'unavailable', missions: [] })) });
  assert.equal(unavailable.elements['pi-mission-status'].textContent, 'unavailable');
  assert.match(unavailable.elements['pi-handoffs'].textContent, /unavailable/);

  const disconnected = await settledHud();
  const previousTree = disconnected.elements['pi-tree'].children.length;
  const previousProofText = disconnected.elements['pi-proofs'].textContent;
  disconnected.setMissionHandler(async () => response(null, false));
  await disconnected.sandbox.pollPi();
  assert.equal(disconnected.elements['pi-source-status'].textContent, 'disconnected');
  assert.equal(disconnected.elements['pi-mission-status'].textContent, 'disconnected');
  assert.equal(disconnected.elements['pi-tree'].children.length, previousTree);
  assert.equal(disconnected.elements['pi-proofs'].textContent, previousProofText);
  assert.ok(disconnected.events.some((event) => event.type === 'rpg:pi-disconnected'));
});

test('the selector changes the mission; zero proofs yield zero buttons and N proofs yield exactly N', async () => {
  const app = await settledHud();
  assert.equal(app.elements['pi-mission-select'].children.length, 2);
  assert.equal(app.elements['pi-proofs'].children.filter((child) => child.tagName === 'BUTTON').length, 0);
  assert.match(app.elements['pi-proofs'].textContent, /zero gold/);

  app.elements['pi-mission-select'].value = '1';
  app.elements['pi-mission-select'].fire('change');
  assert.equal(app.elements['pi-proofs'].children.filter((child) => child.tagName === 'BUTTON').length, 2);
  assert.equal(app.elements['pi-handoffs'].children.filter((child) => child.tagName === 'BUTTON').length, 2);
  assert.equal(app.events.at(-1).type, 'rpg:pi-mission-board');
  assert.equal(app.events.at(-1).detail.missionId, hex('2'));
});

test('a linked run selects its Pawn, an unlinked run is disabled, and evidence selects the allowlisted inspector', async () => {
  const app = await settledHud();
  app.elements['pi-mission-select'].value = '1'; app.elements['pi-mission-select'].fire('change');
  const [linked, unlinked] = app.elements['pi-handoffs'].children;
  assert.equal(linked.disabled, false);
  assert.equal(unlinked.disabled, true);
  linked.fire('click');
  assert.equal(app.events.at(-1).type, 'rpg:pi-node-selected');
  assert.equal(app.events.at(-1).detail.nodeId, hex('a'));

  const proofButton = app.elements['pi-proofs'].children[0];
  proofButton.fire('click');
  assert.equal(app.events.at(-1).type, 'rpg:proof-selected');
  assert.equal(app.events.at(-1).detail.proofRef, hex('d'));
  const inspectorText = app.elements['pi-inspector'].textContent;
  assert.match(inspectorText, /Selected evidence/);
  assert.match(inspectorText, /The private target is not exposed/);
  assert.equal(inspectorText.includes('path'), false);
  assert.equal(inspectorText.includes('http'), false);
  assert.equal(inspectorText.includes(hex('d')), false, 'inspector displays only a short opaque ref');
});

test('Canvas events synchronize Pawn and evidence while changing missions emits the filtered snapshot', async () => {
  const app = await settledHud();
  app.elements['pi-mission-select'].value = '1'; app.elements['pi-mission-select'].fire('change');
  app.window.dispatchEvent(new app.sandbox.CustomEvent('rpg:world-pi-select', { detail: { nodeId: hex('b') } }));
  assert.match(app.elements['pi-inspector'].textContent, /coder/);
  assert.equal(app.elements['pi-tree'].children.find((child) => child.getAttribute('aria-pressed') === 'true').textContent.includes('coder'), true);

  app.window.dispatchEvent(new app.sandbox.CustomEvent('rpg:world-proof-select', { detail: { proofRef: hex('e') } }));
  const selectedProof = app.elements['pi-proofs'].children.find((child) => child.getAttribute('aria-pressed') === 'true');
  assert.ok(selectedProof);
  assert.match(selectedProof.textContent, /receipt/);
  assert.match(app.elements['pi-inspector'].textContent, /ci/);
});

test('hostile strings remain text, innerHTML is unused, and the UI exposes no Open action, resolver, or private target', async () => {
  const app = await settledHud();
  assert.equal(app.elements['pi-tree'].textContent.includes('<hostile-planner>'), true);
  app.elements['pi-mission-select'].value = '1'; app.elements['pi-mission-select'].fire('change');
  assert.equal(app.elements['pi-proofs'].textContent.includes('<hostile-kind>'), true);
  const combined = [app.elements['pi-mission-detail'], app.elements['pi-handoffs'], app.elements['pi-proofs'], app.elements['pi-inspector']].map((element) => element.textContent).join(' ');
  assert.equal(/\bOpen\b|resolver|https?:\/\/|PRIVATE_PATH|target privat/i.test(combined), false);
  assert.equal(source.includes('innerHTML'), false);
});
