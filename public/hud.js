// Consola operațională. Datele venite din API sunt scrise exclusiv cu
// textContent/createTextNode; nu se interpretează markup primit din exterior.
const POLL_INTERVAL_MS = 3000;

function optionalElement(id) {
  try { return document.getElementById(id); } catch (_) { return null; }
}

const profilesTbody = document.getElementById('profiles-tbody');
const runsTbody = document.getElementById('runs-tbody');
const connectionIndicatorEl = document.getElementById('connection-indicator');
const connectionLabelEl = optionalElement('connection-label');
const inspectorEl = document.getElementById('inspector');
const createProfileForm = document.getElementById('create-profile-form');
const createProfileNameInput = document.getElementById('create-profile-name');
const createProfileSpecializationInput = document.getElementById('create-profile-specialization');
const createProfileErrorEl = document.getElementById('create-profile-error');
const railOverviewEl = optionalElement('rail-overview');
const summaryProfilesEl = optionalElement('summary-profiles');
const summaryRunsEl = optionalElement('summary-runs');
const summaryRunningEl = optionalElement('summary-running');
const summaryUnassociatedEl = optionalElement('summary-unassociated');
const summaryProjectsEl = optionalElement('summary-projects');
const profilesCountEl = optionalElement('profiles-count');
const runsCountEl = optionalElement('runs-count');
const createProfileSubmitEl = optionalElement('create-profile-submit');

let profiles = [];
let runs = [];
let selection = null;
const profileRowsById = new Map();
const runRowsById = new Map();
let requestToken = 0;
let lastRenderedInspector = null;

function findProfile(id) { return profiles.find((p) => p.id === id) || null; }
function findRun(id) { return runs.find((r) => r.id === id) || null; }
function isProfileSelected(id) { return !!selection && selection.kind === 'profile' && selection.id === id; }
function isRunSelected(id) { return !!selection && selection.kind === 'run' && selection.id === id; }

function emitProfileSelection(id) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return;
  window.dispatchEvent(new CustomEvent('rpg:profile-selected', { detail: { profileId: id } }));
}

function selectProfile(id, options) {
  if (!findProfile(id)) return;
  selection = { kind: 'profile', id };
  renderProfilesTable();
  renderRunsTable();
  renderInspector();
  if (!options || !options.fromWorld) emitProfileSelection(id);
}

function selectRun(id) {
  const run = findRun(id);
  if (!run) return;
  selection = { kind: 'run', id };
  renderProfilesTable();
  renderRunsTable();
  renderInspector();
  // Inspectorul indică run-ul, iar harta indică profilul asociat acelui run.
  // Pentru un run neasociat, eliminăm explicit orice pawn rămas selectat.
  emitProfileSelection(run.profile_id || null);
}

function clearSelection() {
  selection = null;
  renderProfilesTable();
  renderRunsTable();
  renderInspector();
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rpg:profile-selected', { detail: { profileId: null } }));
  }
}

function pruneSelection() {
  if (!selection) return;
  if (selection.kind === 'profile' && !findProfile(selection.id)) selection = null;
  else if (selection.kind === 'run' && !findRun(selection.id)) selection = null;
}

function makeRowOperable(tr, id, label, onActivate) {
  tr.tabIndex = 0;
  if (typeof tr.setAttribute === 'function') {
    tr.setAttribute('role', 'button');
    tr.setAttribute('aria-label', label);
  }
  if (!tr._keyboardActivationBound) {
    tr.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        onActivate(id);
      }
    });
    tr._keyboardActivationBound = true;
  }
}

function reconcileTable(tbody, rowMap, items, idFn, buildCells, isSelected, onRowClick) {
  const seen = new Set();
  let previousEl = null;
  for (const item of items) {
    const id = idFn(item);
    seen.add(id);
    let tr = rowMap.get(id);
    if (!tr) {
      tr = document.createElement('tr');
      tr.addEventListener('click', () => onRowClick(id));
      rowMap.set(id, tr);
    }
    buildCells(tr, item);
    const selected = isSelected(id);
    tr.classList.toggle('selected', selected);
    if (typeof tr.setAttribute === 'function') tr.setAttribute('aria-pressed', selected ? 'true' : 'false');
    const expectedNext = previousEl === null ? tbody.firstChild : previousEl.nextSibling;
    if (expectedNext !== tr) tbody.insertBefore(tr, expectedNext);
    previousEl = tr;
  }
  for (const [id, tr] of rowMap) {
    if (!seen.has(id)) {
      tr.remove();
      rowMap.delete(id);
    }
  }
}

function setRowCells(tr, values) {
  while (tr.children.length < values.length) tr.appendChild(document.createElement('td'));
  while (tr.children.length > values.length) tr.removeChild(tr.lastChild);
  values.forEach((value, i) => {
    const safeValue = value == null ? '' : String(value);
    if (tr.children[i].textContent !== safeValue) tr.children[i].textContent = safeValue;
  });
}

function renderProfilesTable() {
  reconcileTable(
    profilesTbody, profileRowsById, profiles, (p) => p.id,
    (tr, p) => {
      setRowCells(tr, [p.name, p.primary_specialization || '—', p.approval_state, p.assignable ? 'da' : 'nu', p.last_project || 'fără proiect']);
      makeRowOperable(tr, p.id, 'Deschide profilul ' + p.name, selectProfile);
    },
    isProfileSelected, selectProfile
  );
}

function renderRunsTable() {
  reconcileTable(
    runsTbody, runRowsById, runs, (r) => r.id,
    (tr, r) => {
      const profile = r.profile_id ? findProfile(r.profile_id) : null;
      setRowCells(tr, [r.source_harness, r.project || '—', r.lifecycle, profile ? profile.name : 'neasociat']);
      makeRowOperable(tr, r.id, 'Deschide sesiunea ' + (r.native_id || r.id), selectRun);
    },
    isRunSelected, selectRun
  );
}

function renderSummary() {
  const running = runs.filter((run) => run.lifecycle === 'running').length;
  const unassociated = runs.filter((run) => !run.profile_id).length;
  const projects = new Set(profiles.map((profile) => profile.last_project).filter(Boolean));
  if (summaryProfilesEl) summaryProfilesEl.textContent = String(profiles.length);
  if (summaryRunsEl) summaryRunsEl.textContent = String(runs.length);
  if (summaryRunningEl) summaryRunningEl.textContent = String(running);
  if (summaryUnassociatedEl) summaryUnassociatedEl.textContent = String(unassociated);
  if (profilesCountEl) profilesCountEl.textContent = String(profiles.length);
  if (runsCountEl) runsCountEl.textContent = String(runs.length);
  if (summaryProjectsEl) summaryProjectsEl.textContent = projects.size + (projects.size === 1 ? ' proiect' : ' proiecte');
}

function clearInspector() {
  while (inspectorEl.firstChild) inspectorEl.removeChild(inspectorEl.firstChild);
}

function addInspectorField(label, value) {
  const row = document.createElement('div');
  row.className = 'field';
  const labelEl = document.createElement('span');
  labelEl.className = 'label';
  labelEl.textContent = label;
  row.appendChild(labelEl);
  row.appendChild(document.createTextNode(value == null ? '—' : String(value)));
  inspectorEl.appendChild(row);
}

function addInspectorHeader() {
  const toolbar = document.createElement('div');
  toolbar.className = 'inspector-toolbar';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'inspector-close';
  close.textContent = 'Închide';
  if (typeof close.setAttribute === 'function') close.setAttribute('aria-label', 'Închide inspectorul');
  close.addEventListener('click', clearSelection);
  toolbar.appendChild(close);
  inspectorEl.appendChild(toolbar);
}

function renderInspector() {
  inspectorEl.classList.toggle('hidden', !selection);
  if (railOverviewEl) railOverviewEl.classList.toggle('hidden', !!selection);
  if (!selection) {
    clearInspector();
    lastRenderedInspector = null;
    return;
  }
  if (selection.kind === 'profile') {
    const profile = findProfile(selection.id);
    if (!profile) return;
    if (lastRenderedInspector && lastRenderedInspector.kind === 'profile' && lastRenderedInspector.id === profile.id && lastRenderedInspector.revision === profile.revision) return;
    renderProfileInspector(profile);
    lastRenderedInspector = { kind: 'profile', id: profile.id, revision: profile.revision };
  } else {
    const run = findRun(selection.id);
    if (!run) return;
    if (lastRenderedInspector && lastRenderedInspector.kind === 'run' && lastRenderedInspector.id === run.id && lastRenderedInspector.revision === run.revision) return;
    renderRunInspector(run);
    lastRenderedInspector = { kind: 'run', id: run.id, revision: run.revision };
  }
}

function renderProfileInspector(profile) {
  clearInspector();
  addInspectorHeader('Profil selectat');
  const title = document.createElement('h2');
  title.textContent = profile.name;
  inspectorEl.appendChild(title);
  addInspectorField('nume', profile.name);
  addInspectorField('specializare', profile.primary_specialization || '—');
  addInspectorField('stare aprobare', profile.approval_state);
  addInspectorField('eligibil', profile.assignable ? 'da' : 'nu');
  addInspectorField('ultim proiect', profile.last_project || '—');
  addInspectorField('revizie', String(profile.revision));

  const actions = document.createElement('div');
  actions.className = 'actions';
  const errorEl = document.createElement('span');
  errorEl.className = 'action-error';
  if (typeof errorEl.setAttribute === 'function') errorEl.setAttribute('role', 'alert');
  if (profile.approval_state === 'proposed') {
    const approveBtn = document.createElement('button');
    approveBtn.textContent = 'Aprobă profilul';
    approveBtn.addEventListener('click', () => approveProfile(profile, errorEl, approveBtn));
    actions.appendChild(approveBtn);
  }
  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = profile.assignable ? 'Dezactivează eligibilitatea' : 'Activează eligibilitatea';
  toggleBtn.addEventListener('click', () => toggleAssignable(profile, errorEl, toggleBtn));
  actions.appendChild(toggleBtn);
  actions.appendChild(errorEl);
  inspectorEl.appendChild(actions);
}

function renderRunInspector(run) {
  clearInspector();
  addInspectorHeader('Sesiune selectată');
  const title = document.createElement('h2');
  title.textContent = run.native_id || 'Sesiune observată';
  inspectorEl.appendChild(title);
  const profile = run.profile_id ? findProfile(run.profile_id) : null;
  addInspectorField('harness', run.source_harness);
  addInspectorField('id nativ', run.native_id);
  addInspectorField('proiect', run.project || '—');
  addInspectorField('stare', run.lifecycle);
  addInspectorField('profil asociat', profile ? profile.name : 'neasociat');
  addInspectorField('revizie', String(run.revision));

  const actions = document.createElement('div');
  actions.className = 'actions';
  const errorEl = document.createElement('span');
  errorEl.className = 'action-error';
  if (!run.profile_id) {
    const select = document.createElement('select');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- alege profil --';
    select.appendChild(placeholder);
    for (const p of profiles) {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = p.name;
      select.appendChild(option);
    }
    const associateBtn = document.createElement('button');
    associateBtn.textContent = 'Asociază';
    associateBtn.addEventListener('click', () => associateRun(run, select.value, errorEl, associateBtn));
    actions.appendChild(select);
    actions.appendChild(associateBtn);
  } else {
    const dissociateBtn = document.createElement('button');
    dissociateBtn.textContent = 'Dezasociază';
    dissociateBtn.addEventListener('click', () => dissociateRun(run, errorEl, dissociateBtn));
    actions.appendChild(dissociateBtn);
  }
  actions.appendChild(errorEl);
  inspectorEl.appendChild(actions);
}

function applyUpdatedProfile(updated) {
  const idx = profiles.findIndex((p) => p.id === updated.id);
  if (idx >= 0) profiles[idx] = updated; else profiles.push(updated);
  renderProfilesTable();
  renderRunsTable();
  renderSummary();
  renderInspector();
}

function applyUpdatedRun(updated) {
  const idx = runs.findIndex((r) => r.id === updated.id);
  if (idx >= 0) runs[idx] = updated; else runs.push(updated);
  renderRunsTable();
  renderSummary();
  renderInspector();
}

// Blocare per acțiune, nu globală: două acțiuni independente pot continua,
// dar aceeași mutație nu poate fi expediată de două ori cât fetch-ul e pending.
const pendingActionKeys = new Set();
function beginAction(key, container, trigger, progressEl, message) {
  if (pendingActionKeys.has(key)) return null;
  pendingActionKeys.add(key);
  if (trigger) trigger.disabled = true;
  if (container && typeof container.setAttribute === 'function') container.setAttribute('aria-busy', 'true');
  progressEl.textContent = message;
  return function finishAction() {
    pendingActionKeys.delete(key);
    if (trigger) trigger.disabled = false;
    if (container && typeof container.removeAttribute === 'function') container.removeAttribute('aria-busy');
    if (progressEl.textContent === message) progressEl.textContent = '';
  };
}

async function approveProfile(profile, errorEl, trigger) {
  const finish = beginAction('approve:' + profile.id, inspectorEl, trigger, errorEl, 'Se aprobă profilul…');
  if (!finish) return;
  try {
    const res = await fetch('/api/profiles/' + profile.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: profile.revision, changes: { approval_state: 'approved' } }) });
    const body = await res.json();
    if (!res.ok) { errorEl.textContent = body.error || ('eroare ' + res.status); return; }
    applyUpdatedProfile(body);
  } catch (_) { errorEl.textContent = 'cererea a eșuat'; }
  finally { finish(); }
}

async function toggleAssignable(profile, errorEl, trigger) {
  const finish = beginAction('assignable:' + profile.id, inspectorEl, trigger, errorEl, 'Se actualizează eligibilitatea…');
  if (!finish) return;
  try {
    const res = await fetch('/api/profiles/' + profile.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: profile.revision, changes: { assignable: !profile.assignable } }) });
    const body = await res.json();
    if (!res.ok) { errorEl.textContent = body.error || ('eroare ' + res.status); return; }
    applyUpdatedProfile(body);
  } catch (_) { errorEl.textContent = 'cererea a eșuat'; }
  finally { finish(); }
}

async function associateRun(run, profileId, errorEl, trigger) {
  if (!profileId) { errorEl.textContent = 'alege un profil din listă'; return; }
  const finish = beginAction('associate:' + run.id, inspectorEl, trigger, errorEl, 'Se asociază sesiunea…');
  if (!finish) return;
  try {
    const res = await fetch('/api/runs/' + run.id + '/associate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId, expectedRevision: run.revision }) });
    const body = await res.json();
    if (!res.ok) {
      let message = body.error || ('eroare ' + res.status);
      if (body.activeRuns && body.activeRuns.length) message += ' — blocat de: ' + body.activeRuns.map((r) => r.id).join(', ');
      errorEl.textContent = message;
      return;
    }
    applyUpdatedRun(body);
  } catch (_) { errorEl.textContent = 'cererea a eșuat'; }
  finally { finish(); }
}

async function dissociateRun(run, errorEl, trigger) {
  const finish = beginAction('dissociate:' + run.id, inspectorEl, trigger, errorEl, 'Se elimină asocierea…');
  if (!finish) return;
  try {
    const res = await fetch('/api/runs/' + run.id + '/dissociate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: run.revision }) });
    const body = await res.json();
    if (!res.ok) { errorEl.textContent = body.error || ('eroare ' + res.status); return; }
    applyUpdatedRun(body);
  } catch (_) { errorEl.textContent = 'cererea a eșuat'; }
  finally { finish(); }
}

createProfileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pendingActionKeys.has('create-profile')) return;
  createProfileErrorEl.textContent = '';
  const name = createProfileNameInput.value.trim();
  if (!name) { createProfileErrorEl.textContent = 'numele este obligatoriu'; return; }
  const specialization = createProfileSpecializationInput.value.trim();
  const finish = beginAction('create-profile', createProfileForm, createProfileSubmitEl, createProfileErrorEl, 'Se creează profilul…');
  if (!finish) return;
  try {
    const res = await fetch('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, primarySpecialization: specialization || undefined }) });
    const body = await res.json();
    if (!res.ok) { createProfileErrorEl.textContent = body.error || ('eroare ' + res.status); return; }
    profiles.push(body);
    renderProfilesTable();
    renderSummary();
    createProfileNameInput.value = '';
    createProfileSpecializationInput.value = '';
  } catch (_) { createProfileErrorEl.textContent = 'cererea a eșuat'; }
  finally { finish(); }
});

function setConnectionState(connected) {
  const message = connected ? 'conectat' : 'reîncercăm...';
  // În browser actualizăm numai eticheta, ca punctul vizual să rămână în DOM.
  // Fallback-ul păstrează compatibilitatea cu sandboxul minimal existent.
  if (connectionLabelEl) connectionLabelEl.textContent = message;
  else connectionIndicatorEl.textContent = message;
  connectionIndicatorEl.classList.toggle('connection-connected', connected);
  connectionIndicatorEl.classList.toggle('connection-retrying', !connected);
}

async function pollOnce() {
  const myToken = ++requestToken;
  try {
    const [profilesRes, runsRes] = await Promise.all([fetch('/api/profiles'), fetch('/api/runs')]);
    if (!profilesRes.ok || !runsRes.ok) throw new Error('răspuns non-OK');
    const [newProfiles, newRuns] = await Promise.all([profilesRes.json(), runsRes.json()]);
    if (myToken !== requestToken) return;
    profiles = newProfiles;
    runs = newRuns;
    pruneSelection();
    setConnectionState(true);
    renderProfilesTable();
    renderRunsTable();
    renderSummary();
    renderInspector();
  } catch (_) {
    if (myToken === requestToken) setConnectionState(false);
  } finally { setTimeout(pollOnce, POLL_INTERVAL_MS); }
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('rpg:world-profile-select', (event) => {
    const id = event && event.detail ? event.detail.profileId : null;
    if (id) selectProfile(id, { fromWorld: true });
  });
}

pollOnce();

// RF-K01c: o singură cerere Pi este sursa comună pentru panou și Canvas.
const piStatusEl = optionalElement('pi-source-status'), piDetailEl = optionalElement('pi-source-detail'), piMatrixEl = optionalElement('pi-matrix-body'), piTreeEl = optionalElement('pi-tree'), piCountEl = optionalElement('pi-tree-count'), piInspectorEl = optionalElement('pi-inspector');
const piRowsById = new Map(); let piSnapshot = null, piSelectedId = null, piInFlight = false;
function piAvailable() { return !!(piStatusEl && piMatrixEl && piTreeEl && piInspectorEl); }
function emitPi(type, detail) { if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') window.dispatchEvent(new CustomEvent(type, { detail })); }
function piNodeLabel(node, freshness) { return [node.role || 'rol indisponibil', node.rank, node.lifecycle, freshness, node.attention || 'fără atenție'].join(' · '); }
function renderPiInspector() { if (!piInspectorEl) return; while (piInspectorEl.firstChild) piInspectorEl.removeChild(piInspectorEl.firstChild); const node = piSnapshot && piSnapshot.nodes.find((entry) => entry.id === piSelectedId); const text = document.createElement('p'); if (!node) text.textContent = 'Selectează un Pawn pentru inspector.'; else { text.textContent = piNodeLabel(node, piSnapshot.freshness) + (node.activity ? ' · activitate: ' + node.activity : ' · activitate indisponibilă'); } piInspectorEl.appendChild(text); }
function selectPiNode(id, fromCanvas) { if (!piSnapshot || !piSnapshot.nodes.some((node) => node.id === id)) return; piSelectedId = id; renderPiTree(); renderPiInspector(); if (!fromCanvas) emitPi('rpg:pi-node-selected', { nodeId: id }); }
function renderPiTree() { if (!piTreeEl || !piSnapshot) return; const scrollTop = piTreeEl.scrollTop, seen = new Set(); const nodes = piSnapshot.nodes.slice().sort((a, b) => (a.depth == null ? 999 : a.depth) - (b.depth == null ? 999 : b.depth) || a.id.localeCompare(b.id)); let previous = null; nodes.forEach((node) => { seen.add(node.id); let button = piRowsById.get(node.id); if (!button) { button = document.createElement('button'); button.type = 'button'; button.addEventListener('click', () => selectPiNode(node.id, false)); piRowsById.set(node.id, button); } button.textContent = piNodeLabel(node, piSnapshot.freshness); button.style.setProperty('--tree-depth', String(Math.max(0, node.depth || 0))); button.setAttribute('aria-pressed', node.id === piSelectedId ? 'true' : 'false'); const next = previous ? previous.nextSibling : piTreeEl.firstChild; if (next !== button) piTreeEl.insertBefore(button, next); previous = button; }); for (const [id, button] of piRowsById) if (!seen.has(id)) { button.remove(); piRowsById.delete(id); } piTreeEl.scrollTop = scrollTop; if (piCountEl) piCountEl.textContent = String(nodes.length); }
function renderPiMatrix() { if (!piMatrixEl || !piSnapshot) return; while (piMatrixEl.firstChild) piMatrixEl.removeChild(piMatrixEl.firstChild); ['coordinator', 'direct', 'descendant', 'unknown'].forEach((rank) => { const nodes = piSnapshot.nodes.filter((node) => node.rank === rank); const counts = [nodes.length, nodes.filter((n) => n.lifecycle === 'running').length, nodes.filter((n) => n.lifecycle === 'queued').length, nodes.filter((n) => n.lifecycle === 'paused').length, nodes.filter((n) => n.attention === 'needs_attention').length, nodes.filter((n) => n.lifecycle === 'unknown').length]; const row = document.createElement('tr'); setRowCells(row, [rank, ...counts]); piMatrixEl.appendChild(row); }); }
function renderPi() { if (!piSnapshot) return; const state = piSnapshot.availability === 'unavailable' ? 'unavailable' : piSnapshot.freshness === 'stale' ? 'stale' : 'ready'; piStatusEl.textContent = state; piDetailEl.textContent = state === 'unavailable' ? 'Nicio observație Pi disponibilă.' : piSnapshot.otherObservationCount ? 'Observație focală; alte observații: ' + piSnapshot.otherObservationCount + '.' : 'Observație Pi focală.'; renderPiMatrix(); renderPiTree(); renderPiInspector(); }
async function pollPi() { if (!piAvailable() || piInFlight) return; piInFlight = true; try { const response = await fetch('/api/pi/kingdom'); if (!response.ok) throw new Error(); const snapshot = await response.json(); if (!snapshot || !Array.isArray(snapshot.nodes)) throw new Error(); piSnapshot = snapshot; if (piSelectedId && !snapshot.nodes.some((node) => node.id === piSelectedId)) piSelectedId = null; renderPi(); emitPi('rpg:pi-kingdom', { snapshot }); } catch (_) { if (piStatusEl) piStatusEl.textContent = 'disconnected'; if (piDetailEl) piDetailEl.textContent = 'Conexiunea Pi a eșuat; ultimul instantaneu rămâne vizibil.'; emitPi('rpg:pi-disconnected', {}); } finally { piInFlight = false; setTimeout(pollPi, POLL_INTERVAL_MS); } }
if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('rpg:world-pi-select', (event) => selectPiNode(event && event.detail && event.detail.nodeId, true));
if (piAvailable()) pollPi();
