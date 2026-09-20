// Teste pentru logica din public/hud.js (RF-04 + RF-04-b).
//
// hud.js este un script clasic (nu modul), fără `export`-uri, care la
// încărcare face imediat `document.getElementById(...)` și pornește un
// ciclu de sondare (`pollOnce()`, single-flight prin `setTimeout` din
// `finally`, cu token de cerere). Nu poate fi `require`/`import`-at direct
// în Node fără `document`/`fetch` globale.
//
// Tipar identic cu test/app.test.mjs: încărcăm scriptul REAL cu `node:vm`
// într-un sandbox minim, unde `document`/`fetch`/`setTimeout` sunt simulate.
// Funcțiile declarate cu `function`/`async function` la nivel de script
// (reconcileTable, setRowCells, renderInspector, pollOnce, selectProfile,
// selectRun, applyUpdatedProfile, applyUpdatedRun, approveProfile,
// toggleAssignable, associateRun, dissociateRun, pruneSelection,
// clearInspector, setConnectionState, renderProfilesTable, renderRunsTable)
// devin proprietăți ale obiectului global din sandbox și pot fi apelate
// direct. Variabilele `let`/`const` de nivel de script (profiles, runs,
// selection, profileRowsById, runRowsById, requestToken,
// lastRenderedInspector) NU devin proprietăți globale — starea lor e
// verificată INDIRECT: prin ce se randează efectiv în DOM-ul fals (pe care
// îl construim noi și-l pasăm prin document.getElementById, deci avem
// referință directă la exact aceleași obiecte pe care hud.js le manipulează),
// sau prin funcțiile expuse (applyUpdatedProfile/selectProfile/pollOnce etc.)
// care mută acea stare internă.
//
// DOM fals: `FakeElement` de mai jos e un arbore minimal (parentNode/
// childNodes/appendChild/insertBefore/removeChild/classList/textContent),
// suficient cât să acopere exact operațiile pe care hud.js le face (nu un
// jsdom complet). `innerHTML` e capcanat explicit (get/set aruncă) — orice
// regresie care ar reintroduce `innerHTML` cu date interpolate (bug-ul găsit
// deja în docs/AUDIT-13-09-2026.md) ar face să pice IMEDIAT orice test care
// randează ceva, nu doar testele XSS dedicate din secțiunea 3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HUD_JS_PATH = path.join(__dirname, '..', 'public', 'hud.js');
const HUD_SOURCE = fs.readFileSync(HUD_JS_PATH, 'utf8');

// --- DOM fals minimal -------------------------------------------------------

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.childNodes = [];
    this.parentNode = null;
    this._classes = new Set();
    this._listeners = {};
    this._attributes = new Map();
    this._text = '';
    this.value = '';
    this.tabIndex = -1;
    this.disabled = false;
  }

  // hud.js nu amestecă niciodată noduri de text cu elemente ca frați direct
  // relevanți pentru `.children` (vezi comentariul din capul fișierului) —
  // simplificarea `children === childNodes` e sigură pentru codul testat.
  get children() {
    return this.childNodes;
  }

  get firstChild() {
    return this.childNodes[0] || null;
  }

  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] || null;
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx === -1 ? null : this.parentNode.childNodes[idx + 1] || null;
  }

  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    this.childNodes.push(node);
    node.parentNode = this;
    return node;
  }

  insertBefore(node, ref) {
    if (node.parentNode) node.parentNode.removeChild(node);
    if (ref == null) {
      this.childNodes.push(node);
    } else {
      const idx = this.childNodes.indexOf(ref);
      if (idx === -1) this.childNodes.push(node);
      else this.childNodes.splice(idx, 0, node);
    }
    node.parentNode = this;
    return node;
  }

  removeChild(node) {
    const idx = this.childNodes.indexOf(node);
    if (idx !== -1) this.childNodes.splice(idx, 1);
    node.parentNode = null;
    return node;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  get textContent() {
    if (this.childNodes.length) return this._text + this.childNodes.map((node) => node.textContent).join('');
    return this._text;
  }

  set textContent(v) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    this._text = String(v);
  }

  // Capcană explicită: hud.js NU are voie să folosească innerHTML cu date
  // interpolate (regula din docs/AUDIT-13-09-2026.md). Orice test care
  // randează ceva ar pica imediat, zgomotos, dacă acest cod ar reapărea.
  get innerHTML() {
    throw new Error('innerHTML nu trebuie folosit în hud.js (regulă XSS, vezi docs/AUDIT-13-09-2026.md)');
  }

  set innerHTML(_v) {
    throw new Error('innerHTML nu trebuie folosit în hud.js (regulă XSS, vezi docs/AUDIT-13-09-2026.md)');
  }

  get classList() {
    const self = this;
    return {
      toggle(cls, force) {
        const has = self._classes.has(cls);
        const want = force === undefined ? !has : !!force;
        if (want) self._classes.add(cls);
        else self._classes.delete(cls);
        return want;
      },
      add(cls) {
        self._classes.add(cls);
      },
      remove(cls) {
        self._classes.delete(cls);
      },
      contains(cls) {
        return self._classes.has(cls);
      },
    };
  }

  setAttribute(name, value) {
    this._attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this._attributes.has(name) ? this._attributes.get(name) : null;
  }

  removeAttribute(name) {
    this._attributes.delete(name);
  }

  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }

  dispatch(type, ev) {
    let result;
    for (const fn of this._listeners[type] || []) result = fn(ev);
    return result;
  }
}

function createTextNode(text) {
  const node = new FakeElement('#text');
  node.textContent = text;
  return node;
}

// Caută recursiv, în subarborele `root`, un `div` de câmp de inspector
// (creat de addInspectorField: <div><span>label</span>TEXT</div>) și
// întoarce valoarea lui (nodul de text), pentru un `label` dat.
function findFieldValue(root, label) {
  for (const child of root.childNodes) {
    if (child.tagName === 'div' && child.childNodes[0] && child.childNodes[0].textContent === label) {
      return child.childNodes[1] ? child.childNodes[1].textContent : undefined;
    }
    const nested = findFieldValue(child, label);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// --- încărcarea hud.js în sandbox --------------------------------------------

async function loadHud() {
  const elements = {
    profilesTbody: new FakeElement('tbody'),
    runsTbody: new FakeElement('tbody'),
    connectionIndicatorEl: new FakeElement('div'),
    connectionDotEl: new FakeElement('span'),
    connectionLabelEl: new FakeElement('span'),
    inspectorEl: new FakeElement('aside'),
    createProfileForm: new FakeElement('form'),
    createProfileNameInput: new FakeElement('input'),
    createProfileSpecializationInput: new FakeElement('input'),
    createProfileSubmitEl: new FakeElement('button'),
    createProfileErrorEl: new FakeElement('span'),
  };
  elements.connectionDotEl.classList.add('connection-dot');
  elements.connectionLabelEl.textContent = 'connecting…';
  elements.connectionIndicatorEl.appendChild(elements.connectionDotEl);
  elements.connectionIndicatorEl.appendChild(elements.connectionLabelEl);

  const idMap = {
    'profiles-tbody': elements.profilesTbody,
    'runs-tbody': elements.runsTbody,
    'connection-indicator': elements.connectionIndicatorEl,
    'connection-label': elements.connectionLabelEl,
    inspector: elements.inspectorEl,
    'create-profile-form': elements.createProfileForm,
    'create-profile-name': elements.createProfileNameInput,
    'create-profile-specialization': elements.createProfileSpecializationInput,
    'create-profile-submit': elements.createProfileSubmitEl,
    'create-profile-error': elements.createProfileErrorEl,
  };

  // Stare "server" controlabilă din teste.
  const state = { profiles: [], runs: [] };
  const flags = {
    profilesGetOk: true,
    runsGetOk: true,
    profilesGetShouldThrow: false,
    runsGetShouldThrow: false,
    deferGets: false, // T-token: dacă true, GET /api/profiles și /api/runs rămân în așteptare (vezi pendingProfilesGets/pendingRunsGets)
  };
  const impls = {
    createProfile: null, // (body) => ({ ok, status, json })
    patchProfile: null, // (id, body) => ({ ok, status, json })
    associate: null, // (id, body) => ({ ok, status, json })
    dissociate: null, // (id, body) => ({ ok, status, json })
  };
  const calls = {
    createProfile: [],
    patchProfile: [],
    associate: [],
    dissociate: [],
  };
  const pendingProfilesGets = [];
  const pendingRunsGets = [];

  async function mockFetch(url, opts) {
    const method = (opts && opts.method) || 'GET';

    if (url === '/api/profiles' && method === 'GET') {
      if (flags.deferGets) {
        return new Promise((resolve, reject) => pendingProfilesGets.push({ resolve, reject }));
      }
      if (flags.profilesGetShouldThrow) throw new Error('network unavailable (profiles)');
      return {
        ok: flags.profilesGetOk,
        status: flags.profilesGetOk ? 200 : 500,
        json: async () => (flags.profilesGetOk ? state.profiles : { error: 'internal error' }),
      };
    }

    if (url === '/api/runs' && method === 'GET') {
      if (flags.deferGets) {
        return new Promise((resolve, reject) => pendingRunsGets.push({ resolve, reject }));
      }
      if (flags.runsGetShouldThrow) throw new Error('network unavailable (runs)');
      return {
        ok: flags.runsGetOk,
        status: flags.runsGetOk ? 200 : 500,
        json: async () => (flags.runsGetOk ? state.runs : { error: 'internal error' }),
      };
    }

    if (url === '/api/profiles' && method === 'POST') {
      const body = JSON.parse(opts.body);
      calls.createProfile.push(body);
      if (impls.createProfile) return impls.createProfile(body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'auto-id',
          name: body.name,
          primary_specialization: body.primarySpecialization || null,
          approval_state: 'proposed',
          assignable: false,
          last_project: null,
          revision: 1,
        }),
      };
    }

    const patchMatch = url.match(/^\/api\/profiles\/(.+)$/);
    if (patchMatch && method === 'PATCH') {
      const id = patchMatch[1];
      const body = JSON.parse(opts.body);
      calls.patchProfile.push({ id, body });
      if (impls.patchProfile) return impls.patchProfile(id, body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ id, revision: (body.expectedRevision || 0) + 1, ...body.changes }),
      };
    }

    const assocMatch = url.match(/^\/api\/runs\/(.+)\/associate$/);
    if (assocMatch && method === 'POST') {
      const id = assocMatch[1];
      const body = JSON.parse(opts.body);
      calls.associate.push({ id, body });
      if (impls.associate) return impls.associate(id, body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ id, profile_id: body.profileId, revision: (body.expectedRevision || 0) + 1 }),
      };
    }

    const dissocMatch = url.match(/^\/api\/runs\/(.+)\/dissociate$/);
    if (dissocMatch && method === 'POST') {
      const id = dissocMatch[1];
      const body = JSON.parse(opts.body);
      calls.dissociate.push({ id, body });
      if (impls.dissociate) return impls.dissociate(id, body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ id, profile_id: null, revision: (body.expectedRevision || 0) + 1 }),
      };
    }

    throw new Error(`fetch mock: unexpected request ${method} ${url}`);
  }

  const pendingTimers = new Map();
  let nextTimerId = 1;
  function fakeSetTimeout(fn, ms) {
    const id = nextTimerId++;
    pendingTimers.set(id, { fn, ms });
    return id;
  }

  const windowListeners = {};
  const dispatchedWindowEvents = [];
  const fakeWindow = {
    addEventListener(type, fn) {
      (windowListeners[type] = windowListeners[type] || []).push(fn);
    },
    dispatchEvent(event) {
      dispatchedWindowEvents.push(event);
      for (const fn of windowListeners[event.type] || []) fn(event);
      return true;
    },
  };
  class FakeCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }

  const sandbox = {
    document: {
      getElementById: (id) => {
        if (idMap[id]) return idMap[id];
        throw new Error(`element necunoscut: ${id}`);
      },
      createElement: (tag) => new FakeElement(tag),
      createTextNode,
    },
    window: fakeWindow,
    CustomEvent: FakeCustomEvent,
    fetch: (url, opts) => mockFetch(url, opts),
    setTimeout: fakeSetTimeout,
    console,
  };

  vm.createContext(sandbox);
  vm.runInContext(HUD_SOURCE, sandbox, { filename: 'hud.js' });

  // pollOnce() de la coada scriptului a fost DECLANȘAT sincron; fetch-ul mock
  // (implicit, succes imediat) rezolvă prin microtask-uri — un flush e
  // suficient să-l lase să se termine, la fel ca în test/app.test.mjs.
  await flush();

  return { sandbox, elements, state, flags, impls, calls, pendingProfilesGets, pendingRunsGets, pendingTimers, dispatchedWindowEvents };
}

// === 2.0 accesibilitate și selecție sincronizată ============================

test('the profile row is semantically operable and Enter or Space opens the same profile', async () => {
  const app = await loadHud();
  app.sandbox.applyUpdatedProfile(baseProfile({ id: 'p-keyboard', name: 'Ada' }));
  const row = app.elements.profilesTbody.childNodes[0];

  assert.equal(row.tabIndex, 0);
  assert.equal(row.getAttribute('role'), 'button');
  assert.match(row.getAttribute('aria-label'), /Ada/);

  for (const key of ['Enter', ' ']) {
    let prevented = false;
    row.dispatch('keydown', { key, preventDefault() { prevented = true; } });
    assert.equal(prevented, true, `${JSON.stringify(key)} trebuie să oprească acțiunea implicită`);
    assert.equal(findFieldValue(app.elements.inspectorEl, 'name'), 'Ada');
  }
});

test('HUD profile selection emits world focus with the exact profileId', async () => {
  const app = await loadHud();
  app.sandbox.applyUpdatedProfile(baseProfile({ id: 'p-focus' }));

  app.sandbox.selectProfile('p-focus');

  const event = app.dispatchedWindowEvents.find((item) => item.type === 'rpg:profile-selected');
  assert.ok(event, 'selecția din HUD nu a emis evenimentul pentru hartă');
  assert.equal(event.detail.profileId, 'p-focus');
});

test('world Pawn selection opens the matching profile without an event loop', async () => {
  const app = await loadHud();
  app.sandbox.applyUpdatedProfile(baseProfile({ id: 'p-world', name: 'Real Pawn' }));
  const before = app.dispatchedWindowEvents.length;

  app.sandbox.window.dispatchEvent(new app.sandbox.CustomEvent('rpg:world-profile-select', { detail: { profileId: 'p-world' } }));

  assert.equal(findFieldValue(app.elements.inspectorEl, 'name'), 'Real Pawn');
  const emittedBack = app.dispatchedWindowEvents.slice(before + 1).filter((event) => event.type === 'rpg:profile-selected');
  assert.equal(emittedBack.length, 0, 'selecția venită din lume nu trebuie retrimisă lumii într-o buclă');
});

test('selecting an associated run moves map focus to its profile', async () => {
  const app = await loadHud();
  app.sandbox.applyUpdatedProfile(baseProfile({ id: 'p-anterior' }));
  app.sandbox.applyUpdatedProfile(baseProfile({ id: 'p-asociat' }));
  app.sandbox.applyUpdatedRun(baseRun({ id: 'r-asociat', profile_id: 'p-asociat' }));
  app.sandbox.selectProfile('p-anterior');
  const beforeRun = app.dispatchedWindowEvents.length;

  app.sandbox.selectRun('r-asociat');

  const events = app.dispatchedWindowEvents.slice(beforeRun).filter((event) => event.type === 'rpg:profile-selected');
  assert.equal(events.length, 1);
  assert.equal(events[0].detail.profileId, 'p-asociat');
  assert.equal(findFieldValue(app.elements.inspectorEl, 'native ID'), undefined, 'the inspector does not expose the native ID');
});

test('selecting an unassociated run explicitly clears prior Pawn focus', async () => {
  const app = await loadHud();
  app.sandbox.applyUpdatedProfile(baseProfile({ id: 'p-anterior' }));
  app.sandbox.applyUpdatedRun(baseRun({ id: 'r-neasociat', profile_id: null }));
  app.sandbox.selectProfile('p-anterior');
  const beforeRun = app.dispatchedWindowEvents.length;

  app.sandbox.selectRun('r-neasociat');

  const events = app.dispatchedWindowEvents.slice(beforeRun).filter((event) => event.type === 'rpg:profile-selected');
  assert.equal(events.length, 1);
  assert.equal(events[0].detail.profileId, null);
});

// === 2.1 reconcileTable ======================================================

test('reconcileTable: a new empty list removes all old tbody rows', async () => {
  const { sandbox } = await loadHud();
  const tbody = sandbox.document.createElement('tbody');
  const rowMap = new Map();
  sandbox.reconcileTable(tbody, rowMap, [{ id: 'a' }, { id: 'b' }], (i) => i.id, () => {}, () => false, () => {});
  assert.equal(tbody.childNodes.length, 2);

  sandbox.reconcileTable(tbody, rowMap, [], (i) => i.id, () => {}, () => false, () => {});
  assert.equal(tbody.childNodes.length, 0);
  assert.equal(rowMap.size, 0);
});

test('reconcileTable: new items add rows in list order', async () => {
  const { sandbox } = await loadHud();
  const tbody = sandbox.document.createElement('tbody');
  const rowMap = new Map();
  sandbox.reconcileTable(tbody, rowMap, [{ id: 'a' }, { id: 'b' }], (i) => i.id, () => {}, () => false, () => {});
  assert.equal(tbody.childNodes.length, 2);
  assert.strictEqual(tbody.childNodes[0], rowMap.get('a'));
  assert.strictEqual(tbody.childNodes[1], rowMap.get('b'));
});

test('reconcileTable: changed data updates cells without recreating the existing tr', async () => {
  const { sandbox } = await loadHud();
  const tbody = sandbox.document.createElement('tbody');
  const rowMap = new Map();
  const buildCells = (tr, item) => sandbox.setRowCells(tr, [item.name]);
  sandbox.reconcileTable(tbody, rowMap, [{ id: 'a', name: 'primul' }], (i) => i.id, buildCells, () => false, () => {});
  const trBefore = rowMap.get('a');

  sandbox.reconcileTable(tbody, rowMap, [{ id: 'a', name: 'schimbat' }], (i) => i.id, buildCells, () => false, () => {});
  const trAfter = rowMap.get('a');

  assert.strictEqual(trBefore, trAfter, 'elementul <tr> a fost recreat, nu doar actualizat');
  assert.equal(trAfter.children[0].textContent, 'schimbat');
});

test('reconcileTable: changed list order reorders DOM rows', async () => {
  const { sandbox } = await loadHud();
  const tbody = sandbox.document.createElement('tbody');
  const rowMap = new Map();
  sandbox.reconcileTable(tbody, rowMap, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], (i) => i.id, () => {}, () => false, () => {});
  const [trA, trB, trC] = [rowMap.get('a'), rowMap.get('b'), rowMap.get('c')];
  assert.deepEqual(tbody.childNodes, [trA, trB, trC]);

  sandbox.reconcileTable(tbody, rowMap, [{ id: 'c' }, { id: 'a' }, { id: 'b' }], (i) => i.id, () => {}, () => false, () => {});
  assert.deepEqual(tbody.childNodes, [trC, trA, trB], 'rândurile nu au fost reordonate conform noii liste');
});

test('reconcileTable: a removed item is deleted from both tbody and rowMap', async () => {
  const { sandbox } = await loadHud();
  const tbody = sandbox.document.createElement('tbody');
  const rowMap = new Map();
  sandbox.reconcileTable(tbody, rowMap, [{ id: 'a' }], (i) => i.id, () => {}, () => false, () => {});
  assert.equal(rowMap.has('a'), true);

  sandbox.reconcileTable(tbody, rowMap, [], (i) => i.id, () => {}, () => false, () => {});
  assert.equal(rowMap.has('a'), false, 'harta internă a păstrat o referință "agățată" la elementul dispărut');
  assert.equal(tbody.childNodes.length, 0);
});

test('reconcileTable: an item with the same ID returning later is treated as new', async () => {
  const { sandbox } = await loadHud();
  const tbody = sandbox.document.createElement('tbody');
  const rowMap = new Map();
  sandbox.reconcileTable(tbody, rowMap, [{ id: 'a' }], (i) => i.id, () => {}, () => false, () => {});
  const firstTr = rowMap.get('a');

  sandbox.reconcileTable(tbody, rowMap, [], (i) => i.id, () => {}, () => false, () => {}); // dispare
  sandbox.reconcileTable(tbody, rowMap, [{ id: 'a' }], (i) => i.id, () => {}, () => false, () => {}); // reapare
  const secondTr = rowMap.get('a');

  assert.notStrictEqual(firstTr, secondTr, 'rândul vechi a fost "reînviat" în loc de recreat ca element nou');
});

// === 2.2 setRowCells =========================================================

test('setRowCells: existing cells update when the value count is unchanged', async () => {
  const { sandbox } = await loadHud();
  const tr = sandbox.document.createElement('tr');
  sandbox.setRowCells(tr, ['a', 'b']);
  sandbox.setRowCells(tr, ['x', 'y']);
  assert.equal(tr.children.length, 2);
  assert.equal(tr.children[0].textContent, 'x');
  assert.equal(tr.children[1].textContent, 'y');
});

test('setRowCells: new cells are added when the value count grows', async () => {
  const { sandbox } = await loadHud();
  const tr = sandbox.document.createElement('tr');
  sandbox.setRowCells(tr, ['a']);
  sandbox.setRowCells(tr, ['a', 'b', 'c']);
  assert.equal(tr.children.length, 3);
  assert.equal(tr.children[2].textContent, 'c');
});

test('setRowCells: extra cells are removed when the value count shrinks', async () => {
  const { sandbox } = await loadHud();
  const tr = sandbox.document.createElement('tr');
  sandbox.setRowCells(tr, ['a', 'b', 'c']);
  sandbox.setRowCells(tr, ['x']);
  assert.equal(tr.children.length, 1);
  assert.equal(tr.children[0].textContent, 'x');
});

test('setRowCells: textContent is not rewritten when the value is unchanged', async () => {
  const { sandbox } = await loadHud();
  const tr = sandbox.document.createElement('tr');
  sandbox.setRowCells(tr, ['neschimbat', 'neschimbat2']);

  let writes = 0;
  for (const td of tr.children) {
    let stored = td.textContent;
    Object.defineProperty(td, 'textContent', {
      get() {
        return stored;
      },
      set(v) {
        writes++;
        stored = v;
      },
    });
  }

  sandbox.setRowCells(tr, ['neschimbat', 'neschimbat2']);
  assert.equal(writes, 0, 'setRowCells a rescris textContent deși valorile erau identice');
});

// === 2.3 renderInspector / lastRenderedInspector (RF-04-b) ===================

function baseProfile(overrides) {
  return {
    id: 'p1',
    name: 'Alice',
    primary_specialization: 'backend',
    approval_state: 'proposed',
    assignable: false,
    last_project: 'proj',
    revision: 1,
    ...overrides,
  };
}

test('renderInspector: unchanged selection and data do not rebuild the inspector (RF-04-b)', async () => {
  const { sandbox, elements } = await loadHud();
  sandbox.applyUpdatedProfile(baseProfile());
  sandbox.selectProfile('p1');

  const marker = sandbox.document.createElement('div');
  elements.inspectorEl.appendChild(marker);

  sandbox.renderInspector(); // nimic nu s-a schimbat

  assert.ok(
    elements.inspectorEl.childNodes.includes(marker),
    'inspectorul a fost reconstruit deși nici selecția, nici datele nu s-au schimbat (marker-ul manual a dispărut)'
  );
});

test('renderInspector: changing selection with the same revision rebuilds the inspector', async () => {
  const { sandbox, elements } = await loadHud();
  sandbox.applyUpdatedProfile(baseProfile({ id: 'p1', name: 'Alice' }));
  sandbox.applyUpdatedProfile(baseProfile({ id: 'p2', name: 'Bob' }));
  sandbox.selectProfile('p1');

  const marker = sandbox.document.createElement('div');
  elements.inspectorEl.appendChild(marker);

  sandbox.selectProfile('p2'); // revizie identică (1), id diferit — exact capcana RF-04-b

  assert.ok(
    !elements.inspectorEl.childNodes.includes(marker),
    'inspectorul NU s-a reconstruit la schimbarea selecției — asta e bug-ul semnalat de planner în RF-04-b'
  );
  assert.equal(findFieldValue(elements.inspectorEl, 'name'), 'Bob');
});

test('renderInspector: changing the revision for the same selection rebuilds the inspector', async () => {
  const { sandbox, elements } = await loadHud();
  sandbox.applyUpdatedProfile(baseProfile({ revision: 1 }));
  sandbox.selectProfile('p1');

  const marker = sandbox.document.createElement('div');
  elements.inspectorEl.appendChild(marker);

  sandbox.applyUpdatedProfile(baseProfile({ revision: 2 })); // cheamă renderInspector() intern

  assert.ok(
    !elements.inspectorEl.childNodes.includes(marker),
    'inspectorul nu s-a reconstruit deși revizia elementului selectat s-a schimbat'
  );
});

// === 2.3-bis: golirea și reconstrucția inspectorului, prin fluxul real de poll ===
// (selecție devenită `null` via `pruneSelection()` — nu putem seta `selection`
// direct din test, e `let` de nivel de script, nu proprietate a sandbox-ului;
// trecem prin `pollOnce()`, calea REALĂ prin care `pruneSelection()` e chemată
// în producție.)

test('inspector: a selected item missing from a poll clears selection and later return rebuilds correctly', async () => {
  const app = await loadHud();
  app.state.profiles = [baseProfile({ revision: 1 })];
  await app.sandbox.pollOnce();
  app.sandbox.selectProfile('p1');
  assert.ok(!app.elements.inspectorEl.classList.contains('hidden'));
  assert.ok(app.elements.inspectorEl.childNodes.length > 0);

  app.state.profiles = []; // p1 dispare din snapshot
  await app.sandbox.pollOnce();
  assert.ok(app.elements.inspectorEl.classList.contains('hidden'), 'inspectorul ar fi trebuit ascuns când elementul selectat dispare');
  assert.equal(app.elements.inspectorEl.childNodes.length, 0, 'inspectorul ar fi trebuit golit explicit, nu lăsat cu date vechi');

  app.state.profiles = [baseProfile({ revision: 1 })]; // revine, cu ACEEAȘI revizie ca înainte
  await app.sandbox.pollOnce();
  app.sandbox.selectProfile('p1');
  assert.ok(!app.elements.inspectorEl.classList.contains('hidden'));
  assert.ok(
    app.elements.inspectorEl.childNodes.length > 0,
    'reselectarea aceluiași element (aceeași revizie) după o golire nu a reconstruit inspectorul — a rămas "blocat"'
  );
});

test('inspector: selection survives a poll with no real changes', async () => {
  const app = await loadHud();
  app.state.profiles = [baseProfile({ revision: 1 })];
  await app.sandbox.pollOnce();
  app.sandbox.selectProfile('p1');

  await app.sandbox.pollOnce(); // aceleași date

  assert.ok(!app.elements.inspectorEl.classList.contains('hidden'), 'inspectorul s-a ascuns la un refresh fără schimbări reale');
  const tr = app.elements.profilesTbody.childNodes[0];
  assert.ok(tr.classList.contains('selected'), 'rândul selectat nu mai era marcat "selected" după refresh');
});

// === 2.4 pollOnce — single-flight și token de cerere =========================

test('pollOnce schedules exactly one next cycle through setTimeout at POLL_INTERVAL_MS', async () => {
  const app = await loadHud();
  // pollOnce() automat de la încărcarea scriptului a rulat deja o dată (loadHud
  // face `await flush()`) și, în `finally`, a programat exact un timer.
  assert.equal(app.pendingTimers.size, 1, 'ar fi trebuit să existe exact un timer programat de pollOnce()');
  const [[, timer]] = app.pendingTimers;
  assert.equal(timer.ms, 3000, 'intervalul de sondare nu mai e 3000ms (POLL_INTERVAL_MS)');
});

test('request token: an older late response does not overwrite state from a newer cycle', async () => {
  const app = await loadHud();
  app.flags.deferGets = true;

  const cycle1 = app.sandbox.pollOnce(); // pornește, fetch-urile rămân în așteptare
  const cycle2 = app.sandbox.pollOnce(); // pornește al doilea, înainte ca primul să se termine

  assert.equal(app.pendingProfilesGets.length, 2);
  assert.equal(app.pendingRunsGets.length, 2);

  // Ciclul 2 (mai nou) răspunde PRIMUL.
  app.pendingProfilesGets[1].resolve({
    ok: true,
    status: 200,
    json: async () => [baseProfile({ id: 'p-nou', name: 'Nou' })],
  });
  app.pendingRunsGets[1].resolve({ ok: true, status: 200, json: async () => [] });
  await cycle2;

  // Ciclul 1 (mai vechi) răspunde ABIA ACUM, cu date diferite.
  app.pendingProfilesGets[0].resolve({
    ok: true,
    status: 200,
    json: async () => [baseProfile({ id: 'p-vechi', name: 'Vechi' })],
  });
  app.pendingRunsGets[0].resolve({ ok: true, status: 200, json: async () => [] });
  await cycle1;

  const names = app.elements.profilesTbody.childNodes.map((tr) => tr.children[0].textContent);
  assert.deepEqual(names, ['Nou'], 'răspunsul vechi (ciclul 1) a suprascris starea aplicată deja de ciclul mai nou');
});

test('a delayed network failure from an old cycle does not overwrite a newer connected indicator', async () => {
  const app = await loadHud();
  app.flags.deferGets = true;

  const cycle1 = app.sandbox.pollOnce(); // va eșua, dar mai târziu
  const cycle2 = app.sandbox.pollOnce(); // se termină cu succes primul

  app.pendingProfilesGets[1].resolve({ ok: true, status: 200, json: async () => [] });
  app.pendingRunsGets[1].resolve({ ok: true, status: 200, json: async () => [] });
  await cycle2;
  assert.ok(app.elements.connectionIndicatorEl.classList.contains('connection-connected'));

  app.pendingProfilesGets[0].reject(new Error('delayed network failure'));
  await cycle1;

  assert.ok(
    app.elements.connectionIndicatorEl.classList.contains('connection-connected'),
    'un eșec vechi a suprascris indicatorul de conexiune stabilit deja de un ciclu mai nou'
  );
});

test('a polling network failure sets disconnected state and later recovery restores connected state', async () => {
  const app = await loadHud();
  app.flags.profilesGetShouldThrow = true;
  await app.sandbox.pollOnce();
  assert.ok(app.elements.connectionIndicatorEl.classList.contains('connection-retrying'));
  assert.equal(app.elements.connectionIndicatorEl.textContent, 'disconnected · retrying');

  app.flags.profilesGetShouldThrow = false;
  await app.sandbox.pollOnce();
  assert.ok(app.elements.connectionIndicatorEl.classList.contains('connection-connected'));
});

test('a non-OK response from profiles or runs is treated as a connection failure', async () => {
  const app = await loadHud();
  app.flags.runsGetOk = false;
  await app.sandbox.pollOnce();
  assert.ok(app.elements.connectionIndicatorEl.classList.contains('connection-retrying'));
});

test('setConnectionState preserves the visual dot and updates only the dedicated label', async () => {
  const app = await loadHud();
  const dot = app.elements.connectionDotEl;
  const label = app.elements.connectionLabelEl;

  app.sandbox.setConnectionState(true);
  assert.strictEqual(app.elements.connectionIndicatorEl.childNodes[0], dot);
  assert.strictEqual(app.elements.connectionIndicatorEl.childNodes[1], label);
  assert.ok(dot.classList.contains('connection-dot'));
  assert.equal(label.textContent, 'connected');

  app.sandbox.setConnectionState(false);
  assert.strictEqual(app.elements.connectionIndicatorEl.childNodes[0], dot);
  assert.equal(label.textContent, 'disconnected · retrying');
});

// === 2.5 Acțiunile ===========================================================

test('approveProfile pending blocks duplicates and releases disabled and aria-busy on success', async () => {
  const app = await loadHud();
  const wait = deferred();
  const errorEl = app.sandbox.document.createElement('span');
  const trigger = app.sandbox.document.createElement('button');
  app.impls.patchProfile = () => wait.promise;

  const first = app.sandbox.approveProfile(baseProfile(), errorEl, trigger);
  const duplicate = app.sandbox.approveProfile(baseProfile(), errorEl, trigger);

  assert.equal(trigger.disabled, true);
  assert.equal(app.elements.inspectorEl.getAttribute('aria-busy'), 'true');
  assert.match(errorEl.textContent, /approving profile/i);
  assert.equal(app.calls.patchProfile.length, 1, 'a doua activare pending nu trebuie să expedieze alt PATCH');

  await duplicate;
  wait.resolve({ ok: true, status: 200, json: async () => baseProfile({ approval_state: 'approved', revision: 2 }) });
  await first;

  assert.equal(trigger.disabled, false);
  assert.equal(app.elements.inspectorEl.getAttribute('aria-busy'), null);
});

test('approveProfile pending releases disabled and aria-busy while preserving the error on failure', async () => {
  const app = await loadHud();
  const wait = deferred();
  const errorEl = app.sandbox.document.createElement('span');
  const trigger = app.sandbox.document.createElement('button');
  app.impls.patchProfile = () => wait.promise;

  const pending = app.sandbox.approveProfile(baseProfile(), errorEl, trigger);
  assert.equal(trigger.disabled, true);
  assert.equal(app.elements.inspectorEl.getAttribute('aria-busy'), 'true');
  wait.reject(new Error('network unavailable'));
  await pending;

  assert.equal(trigger.disabled, false);
  assert.equal(app.elements.inspectorEl.getAttribute('aria-busy'), null);
  assert.equal(errorEl.textContent, 'The request failed.');
});

test('approveProfile: success applies the response profile and clears the local error', async () => {
  const app = await loadHud();
  const errorEl = app.sandbox.document.createElement('span');
  errorEl.textContent = 'previous error';
  app.impls.patchProfile = (id, body) => ({
    ok: true,
    status: 200,
    json: async () => baseProfile({ id, approval_state: 'approved', revision: body.expectedRevision + 1 }),
  });

  await app.sandbox.approveProfile(baseProfile({ revision: 1 }), errorEl);

  assert.equal(errorEl.textContent, '');
  assert.equal(app.calls.patchProfile[0].body.expectedRevision, 1);
  assert.equal(app.calls.patchProfile[0].body.changes.approval_state, 'approved');
  assert.equal(app.elements.profilesTbody.childNodes.length, 1, 'profilul actualizat ar fi trebuit randat în tabel');
});

test('approveProfile: 409 shows a generic message without raw error and applies no update', async () => {
  const app = await loadHud();
  const errorEl = app.sandbox.document.createElement('span');
  app.impls.patchProfile = () => ({ ok: false, status: 409, json: async () => ({ error: 'expired revision PRIVATE' }) });

  await app.sandbox.approveProfile(baseProfile({ revision: 1 }), errorEl);

  assert.equal(errorEl.textContent, 'The action was not accepted.');
  assert.equal(errorEl.textContent.includes('expired revision PRIVATE'), false);
  assert.equal(app.elements.profilesTbody.childNodes.length, 0, 'no update should be applied on failure');
});

test('approveProfile: a network exception produces the generic request-failed message', async () => {
  const app = await loadHud();
  const errorEl = app.sandbox.document.createElement('span');
  app.impls.patchProfile = () => {
    throw new Error('network unavailable');
  };

  await assert.doesNotReject(app.sandbox.approveProfile(baseProfile({ revision: 1 }), errorEl));
  assert.equal(errorEl.textContent, 'The request failed.');
});

test('toggleAssignable: success sends the opposite assignable state and applies the result', async () => {
  const app = await loadHud();
  const errorEl = app.sandbox.document.createElement('span');
  app.impls.patchProfile = (id, body) => ({
    ok: true,
    status: 200,
    json: async () => baseProfile({ id, assignable: body.changes.assignable, revision: 2 }),
  });

  await app.sandbox.toggleAssignable(baseProfile({ assignable: false, revision: 1 }), errorEl);

  assert.equal(app.calls.patchProfile[0].body.changes.assignable, true);
  assert.equal(errorEl.textContent, '');
});

test('toggleAssignable: 400 shows a generic message without raw error and applies no update', async () => {
  const app = await loadHud();
  const errorEl = app.sandbox.document.createElement('span');
  app.impls.patchProfile = () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid request PRIVATE' }) });

  await app.sandbox.toggleAssignable(baseProfile({ revision: 1 }), errorEl);

  assert.equal(errorEl.textContent, 'The update was not accepted.');
  assert.equal(errorEl.textContent.includes('invalid request PRIVATE'), false);
  assert.equal(app.elements.profilesTbody.childNodes.length, 0, 'the profile must not be updated on failure');
});

function baseRun(overrides) {
  return {
    id: 'r1',
    source_harness: 'claude-code',
    native_id: 'n1',
    project: 'proj',
    lifecycle: 'active',
    profile_id: null,
    revision: 1,
    ...overrides,
  };
}

test('associateRun: success applies the updated run from the response', async () => {
  const app = await loadHud();
  const errorEl = app.sandbox.document.createElement('span');
  app.impls.associate = (id, body) => ({
    ok: true,
    status: 200,
    json: async () => baseRun({ id, profile_id: body.profileId, revision: 2 }),
  });

  await app.sandbox.associateRun(baseRun({ revision: 1 }), 'p1', errorEl);

  assert.equal(errorEl.textContent, '');
  assert.equal(app.elements.runsTbody.childNodes.length, 1);
});

test('associateRun: 409 with activeRuns reports a generic conflict without IDs or raw error', async () => {
  const app = await loadHud();
  const errorEl = app.sandbox.document.createElement('span');
  app.impls.associate = () => ({
    ok: false,
    status: 409,
    json: async () => ({ error: 'conflict PRIVATE', activeRuns: [{ id: 'run-activ-1' }, { id: 'run-activ-2' }] }),
  });

  await app.sandbox.associateRun(baseRun({ revision: 1 }), 'p1', errorEl);

  assert.equal(errorEl.textContent, 'The association was not accepted. The profile already has an active run.');
  assert.equal(errorEl.textContent.includes('conflict PRIVATE'), false);
  assert.equal(errorEl.textContent.includes('run-activ-1'), false);
  assert.equal(errorEl.textContent.includes('run-activ-2'), false);
  assert.equal(app.elements.runsTbody.childNodes.length, 0, 'run-ul nu trebuie actualizat la conflict');
});

test('associateRun: no selected profile produces a local error without sending a request', async () => {
  const app = await loadHud();
  const errorEl = app.sandbox.document.createElement('span');

  await app.sandbox.associateRun(baseRun({ revision: 1 }), '', errorEl);

  assert.notEqual(errorEl.textContent, '');
  assert.equal(app.calls.associate.length, 0, 'nu ar fi trebuit trimisă nicio cerere fără profil ales');
});

test('associateRun: a network exception produces the generic request-failed message', async () => {
  const app = await loadHud();
  const errorEl = app.sandbox.document.createElement('span');
  app.impls.associate = () => {
    throw new Error('network unavailable');
  };

  await app.sandbox.associateRun(baseRun({ revision: 1 }), 'p1', errorEl);

  assert.equal(errorEl.textContent, 'The request failed.');
});

test('dissociateRun: success applies the updated run without an associated profile', async () => {
  const app = await loadHud();
  const errorEl = app.sandbox.document.createElement('span');
  app.impls.dissociate = (id) => ({
    ok: true,
    status: 200,
    json: async () => baseRun({ id, profile_id: null, revision: 2 }),
  });

  await app.sandbox.dissociateRun(baseRun({ profile_id: 'p1', revision: 1 }), errorEl);

  assert.equal(errorEl.textContent, '');
  assert.equal(app.elements.runsTbody.childNodes[0].children[3].textContent, 'unassociated');
});

test('dissociateRun: 404 shows a generic message without raw error and applies no update', async () => {
  const app = await loadHud();
  const errorEl = app.sandbox.document.createElement('span');
  app.impls.dissociate = () => ({ ok: false, status: 404, json: async () => ({ error: 'run inexistent PRIVATE' }) });

  await app.sandbox.dissociateRun(baseRun({ revision: 1 }), errorEl);

  assert.equal(errorEl.textContent, 'The dissociation was not accepted.');
  assert.equal(errorEl.textContent.includes('run inexistent PRIVATE'), false);
  assert.equal(app.elements.runsTbody.childNodes.length, 0, 'the run must not be updated on failure');
});

test('the pending form is aria-busy, disables submit, and does not duplicate the POST', async () => {
  const app = await loadHud();
  const wait = deferred();
  app.elements.createProfileNameInput.value = 'Pending profile';
  app.impls.createProfile = () => wait.promise;

  const first = app.elements.createProfileForm.dispatch('submit', { preventDefault() {} });
  assert.equal(app.elements.createProfileSubmitEl.disabled, true);
  assert.equal(app.elements.createProfileForm.getAttribute('aria-busy'), 'true');
  assert.match(app.elements.createProfileErrorEl.textContent, /creating profile/i);

  const duplicate = app.elements.createProfileForm.dispatch('submit', { preventDefault() {} });
  assert.equal(app.elements.createProfileSubmitEl.disabled, true);
  assert.equal(app.elements.createProfileForm.getAttribute('aria-busy'), 'true');
  assert.equal(app.calls.createProfile.length, 1);
  assert.match(app.elements.createProfileErrorEl.textContent, /creating profile/i, 'duplicate activation must not clear the pending message');

  await duplicate;
  wait.resolve({ ok: false, status: 400, json: async () => ({ error: 'name already used PRIVATE' }) });
  await first;
  assert.equal(app.elements.createProfileSubmitEl.disabled, false);
  assert.equal(app.elements.createProfileForm.getAttribute('aria-busy'), null);
  assert.equal(app.elements.createProfileErrorEl.textContent, 'The profile could not be created.');
  assert.equal(app.elements.createProfileErrorEl.textContent.includes('name already used PRIVATE'), false);
  assert.equal(app.elements.createProfileNameInput.value, 'Pending profile', 'the input must be preserved on failure');
  assert.equal(app.elements.profilesTbody.childNodes.length, 0, 'profilul nu trebuie adăugat la eșec');
});

test('profile form: an empty or whitespace-only name produces a local error without a request', async () => {
  const app = await loadHud();
  app.elements.createProfileNameInput.value = '   ';
  app.elements.createProfileForm.dispatch('submit', { preventDefault() {} });
  await flush();

  assert.notEqual(app.elements.createProfileErrorEl.textContent, '');
  assert.equal(app.calls.createProfile.length, 0, 'nu ar fi trebuit trimisă nicio cerere pentru un nume gol');
});

test('profile form: success adds the profile optimistically and clears the inputs', async () => {
  const app = await loadHud();
  app.elements.createProfileNameInput.value = 'New Profile';
  app.elements.createProfileSpecializationInput.value = 'backend';
  app.impls.createProfile = (body) => ({
    ok: true,
    status: 200,
    json: async () => baseProfile({ id: 'nou-1', name: body.name, primary_specialization: body.primarySpecialization }),
  });

  app.elements.createProfileForm.dispatch('submit', { preventDefault() {} });
  await flush();

  assert.equal(app.elements.createProfileNameInput.value, '', 'inputul de nume ar fi trebuit golit la succes');
  assert.equal(app.elements.createProfileSpecializationInput.value, '', 'inputul de specializare ar fi trebuit golit la succes');
  assert.equal(app.elements.profilesTbody.childNodes.length, 1, 'profilul nou ar fi trebuit să apară imediat, fără să aștepte poll-ul următor');
  assert.equal(app.elements.profilesTbody.childNodes[0].children[0].textContent, 'New Profile');
});

test('profile form: server failure shows a generic message without raw error and preserves inputs', async () => {
  const app = await loadHud();
  app.elements.createProfileNameInput.value = 'Profile X';
  app.impls.createProfile = () => ({ ok: false, status: 400, json: async () => ({ error: 'name already used PRIVATE' }) });

  app.elements.createProfileForm.dispatch('submit', { preventDefault() {} });
  await flush();

  assert.equal(app.elements.createProfileErrorEl.textContent, 'The profile could not be created.');
  assert.equal(app.elements.createProfileErrorEl.textContent.includes('name already used PRIVATE'), false);
  assert.equal(app.elements.createProfileNameInput.value, 'Profile X', 'the input must not be cleared on failure');
  assert.equal(app.elements.profilesTbody.childNodes.length, 0);
});

// === 3. XSS — obligatoriu ====================================================

test('XSS: a name containing markup remains literal text in the profile table cell', async () => {
  const app = await loadHud();
  const malicious = '<img src=x onerror=alert(1)>';
  app.sandbox.applyUpdatedProfile(baseProfile({ name: malicious }));

  const tr = app.elements.profilesTbody.childNodes[0];
  assert.equal(tr.children[0].textContent, malicious);
  assert.equal(tr.children[0].childNodes.length, 0, 'celula nu ar fi trebuit să conțină noduri copil (ar însemna markup interpretat, nu text)');
});

test('XSS: native_id remains absent and a markup-like project appears only as safe inspector text', async () => {
  const app = await loadHud();
  const malicious = '<b>test</b>';
  app.sandbox.applyUpdatedRun(baseRun({ native_id: malicious, project: malicious }));
  app.sandbox.selectRun('r1');

  assert.equal(findFieldValue(app.elements.inspectorEl, 'native ID'), undefined);
  assert.equal(findFieldValue(app.elements.inspectorEl, 'project'), 'local project');
  assert.equal(app.elements.inspectorEl.textContent.includes(malicious), false, 'proiectul care seamănă cu o cale trebuie redacționat');
});

test('XSS: a specialization containing markup remains literal in the profile inspector', async () => {
  const app = await loadHud();
  const malicious = '<script>alert(1)</script>';
  app.sandbox.applyUpdatedProfile(baseProfile({ primary_specialization: malicious }));
  app.sandbox.selectProfile('p1');

  assert.equal(findFieldValue(app.elements.inspectorEl, 'specialization'), malicious);
});

test('XSS: the DOM mock structurally rejects innerHTML if hud.js reintroduces it', async () => {
  const { sandbox } = await loadHud();
  const el = sandbox.document.createElement('div');
  assert.throws(() => {
    el.innerHTML = '<b>oricine ar folosi asta ar rupe testul</b>';
  });
});
