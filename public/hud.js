// Operations console. API data is written exclusively with
// textContent/createTextNode; markup received from external sources is never interpreted.
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
const operationsToggleEl = optionalElement('operations-toggle');
const operationsCloseEl = optionalElement('operations-close');
const operationsRailEl = optionalElement('operations-rail');
const operationsBackdropEl = optionalElement('operations-backdrop');
const worldSectionEl = optionalElement('world-section');

let profiles = [];
let runs = [];
let selection = null;
const profileRowsById = new Map();
const runRowsById = new Map();
let requestToken = 0;
let lastRenderedInspector = null;

function findProfile(id) { return profiles.find((p) => p.id === id) || null; }
function findRun(id) { return runs.find((r) => r.id === id) || null; }
function publicProjectLabel(value) {
  if (!value) return '—';
  const text = String(value);
  return /[\\/]|^[A-Za-z]:/.test(text) ? 'local project' : text;
}
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
  // The inspector indicates the run, while the map indicates its associated profile.
  // For an unassociated run, explicitly clear any previously selected Pawn.
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
      setRowCells(tr, [p.name, p.primary_specialization || '—', p.approval_state, p.assignable ? 'yes' : 'no', p.last_project ? publicProjectLabel(p.last_project) : 'no project']);
      makeRowOperable(tr, p.id, 'Open profile ' + p.name, selectProfile);
    },
    isProfileSelected, selectProfile
  );
}

function renderRunsTable() {
  reconcileTable(
    runsTbody, runRowsById, runs, (r) => r.id,
    (tr, r) => {
      const profile = r.profile_id ? findProfile(r.profile_id) : null;
      setRowCells(tr, [r.source_harness, publicProjectLabel(r.project), r.lifecycle, profile ? profile.name : 'unassociated']);
      makeRowOperable(tr, r.id, 'Open ' + (r.source_harness || 'observed') + ' run', selectRun);
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
  if (summaryProjectsEl) summaryProjectsEl.textContent = projects.size + (projects.size === 1 ? ' project' : ' projects');
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
  close.textContent = 'Close';
  if (typeof close.setAttribute === 'function') close.setAttribute('aria-label', 'Close inspector');
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
  addInspectorHeader('Selected profile');
  const title = document.createElement('h2');
  title.textContent = profile.name;
  inspectorEl.appendChild(title);
  addInspectorField('name', profile.name);
  addInspectorField('specialization', profile.primary_specialization || '—');
  addInspectorField('approval status', profile.approval_state);
  addInspectorField('eligible', profile.assignable ? 'yes' : 'no');
  addInspectorField('last project', publicProjectLabel(profile.last_project));
  addInspectorField('revision', String(profile.revision));

  const actions = document.createElement('div');
  actions.className = 'actions';
  const errorEl = document.createElement('span');
  errorEl.className = 'action-error';
  if (typeof errorEl.setAttribute === 'function') errorEl.setAttribute('role', 'alert');
  if (profile.approval_state === 'proposed') {
    const approveBtn = document.createElement('button');
    approveBtn.textContent = 'Approve profile';
    approveBtn.addEventListener('click', () => approveProfile(profile, errorEl, approveBtn));
    actions.appendChild(approveBtn);
  }
  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = profile.assignable ? 'Disable eligibility' : 'Enable eligibility';
  toggleBtn.addEventListener('click', () => toggleAssignable(profile, errorEl, toggleBtn));
  actions.appendChild(toggleBtn);
  actions.appendChild(errorEl);
  inspectorEl.appendChild(actions);
}

function renderRunInspector(run) {
  clearInspector();
  addInspectorHeader('Selected run');
  const title = document.createElement('h2');
  title.textContent = 'Observed Run';
  inspectorEl.appendChild(title);
  const profile = run.profile_id ? findProfile(run.profile_id) : null;
  addInspectorField('harness', run.source_harness);
  addInspectorField('project', publicProjectLabel(run.project));
  addInspectorField('status', run.lifecycle);
  addInspectorField('associated profile', profile ? profile.name : 'unassociated');
  addInspectorField('revision', String(run.revision));

  const actions = document.createElement('div');
  actions.className = 'actions';
  const errorEl = document.createElement('span');
  errorEl.className = 'action-error';
  if (!run.profile_id) {
    const select = document.createElement('select');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- choose profile --';
    select.appendChild(placeholder);
    for (const p of profiles) {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = p.name;
      select.appendChild(option);
    }
    const associateBtn = document.createElement('button');
    associateBtn.textContent = 'Associate';
    associateBtn.addEventListener('click', () => associateRun(run, select.value, errorEl, associateBtn));
    actions.appendChild(select);
    actions.appendChild(associateBtn);
  } else {
    const dissociateBtn = document.createElement('button');
    dissociateBtn.textContent = 'Dissociate';
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

// Lock per action rather than globally: two independent actions may continue,
// but the same mutation cannot be sent twice while its fetch is pending.
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
  const finish = beginAction('approve:' + profile.id, inspectorEl, trigger, errorEl, 'Approving profile…');
  if (!finish) return;
  try {
    const res = await fetch('/api/profiles/' + profile.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: profile.revision, changes: { approval_state: 'approved' } }) });
    const body = await res.json();
    if (!res.ok) { errorEl.textContent = 'The action was not accepted.'; return; }
    applyUpdatedProfile(body);
  } catch (_) { errorEl.textContent = 'The request failed.'; }
  finally { finish(); }
}

async function toggleAssignable(profile, errorEl, trigger) {
  const finish = beginAction('assignable:' + profile.id, inspectorEl, trigger, errorEl, 'Updating eligibility…');
  if (!finish) return;
  try {
    const res = await fetch('/api/profiles/' + profile.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: profile.revision, changes: { assignable: !profile.assignable } }) });
    const body = await res.json();
    if (!res.ok) { errorEl.textContent = 'The update was not accepted.'; return; }
    applyUpdatedProfile(body);
  } catch (_) { errorEl.textContent = 'The request failed.'; }
  finally { finish(); }
}

async function associateRun(run, profileId, errorEl, trigger) {
  if (!profileId) { errorEl.textContent = 'Choose a profile from the list.'; return; }
  const finish = beginAction('associate:' + run.id, inspectorEl, trigger, errorEl, 'Associating run…');
  if (!finish) return;
  try {
    const res = await fetch('/api/runs/' + run.id + '/associate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId, expectedRevision: run.revision }) });
    const body = await res.json();
    if (!res.ok) {
      let message = 'The association was not accepted.';
      if (body.activeRuns && body.activeRuns.length) message += ' The profile already has an active run.';
      errorEl.textContent = message;
      return;
    }
    applyUpdatedRun(body);
  } catch (_) { errorEl.textContent = 'The request failed.'; }
  finally { finish(); }
}

async function dissociateRun(run, errorEl, trigger) {
  const finish = beginAction('dissociate:' + run.id, inspectorEl, trigger, errorEl, 'Removing association…');
  if (!finish) return;
  try {
    const res = await fetch('/api/runs/' + run.id + '/dissociate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: run.revision }) });
    const body = await res.json();
    if (!res.ok) { errorEl.textContent = 'The dissociation was not accepted.'; return; }
    applyUpdatedRun(body);
  } catch (_) { errorEl.textContent = 'The request failed.'; }
  finally { finish(); }
}

createProfileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pendingActionKeys.has('create-profile')) return;
  createProfileErrorEl.textContent = '';
  const name = createProfileNameInput.value.trim();
  if (!name) { createProfileErrorEl.textContent = 'Name is required.'; return; }
  const specialization = createProfileSpecializationInput.value.trim();
  const finish = beginAction('create-profile', createProfileForm, createProfileSubmitEl, createProfileErrorEl, 'Creating profile…');
  if (!finish) return;
  try {
    const res = await fetch('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, primarySpecialization: specialization || undefined }) });
    const body = await res.json();
    if (!res.ok) { createProfileErrorEl.textContent = 'The profile could not be created.'; return; }
    profiles.push(body);
    renderProfilesTable();
    renderSummary();
    createProfileNameInput.value = '';
    createProfileSpecializationInput.value = '';
  } catch (_) { createProfileErrorEl.textContent = 'The request failed.'; }
  finally { finish(); }
});

function drawerFocusableElements() {
  if (!operationsRailEl || typeof operationsRailEl.querySelectorAll !== 'function') return operationsCloseEl ? [operationsCloseEl] : [];
  const selector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
  return Array.from(operationsRailEl.querySelectorAll(selector)).filter((element) => {
    if (element.hidden || element.getAttribute('aria-hidden') === 'true' || (element.closest && element.closest('.hidden,[hidden]'))) return false;
    const closedDetails = element.closest && element.closest('details:not([open])');
    return !closedDetails || (element.tagName === 'SUMMARY' && element.parentElement === closedDetails);
  });
}
function setWorldInert(inert) {
  if (!worldSectionEl) return;
  worldSectionEl.inert = inert;
  if (inert) worldSectionEl.setAttribute('inert', '');
  else worldSectionEl.removeAttribute('inert');
}
function setDrawerOpen(open, options) {
  if (!operationsRailEl || !operationsToggleEl) return;
  operationsRailEl.classList.toggle('is-open', open);
  operationsRailEl.setAttribute('aria-hidden', open ? 'false' : 'true');
  operationsToggleEl.setAttribute('aria-expanded', open ? 'true' : 'false');
  setWorldInert(open);
  if (operationsBackdropEl) {
    operationsBackdropEl.classList.toggle('is-open', open);
    operationsBackdropEl.tabIndex = -1;
  }
  if (open) {
    const first = drawerFocusableElements()[0] || operationsCloseEl;
    if (first && (!options || options.focus !== false)) first.focus();
  } else if (!options || options.restoreFocus !== false) operationsToggleEl.focus();
}
if (operationsToggleEl) operationsToggleEl.addEventListener('click', () => setDrawerOpen(operationsToggleEl.getAttribute('aria-expanded') !== 'true'));
if (operationsCloseEl) operationsCloseEl.addEventListener('click', () => setDrawerOpen(false));
if (operationsBackdropEl) operationsBackdropEl.addEventListener('click', () => setDrawerOpen(false));
if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('keydown', (event) => {
  const drawerOpen = operationsToggleEl && operationsToggleEl.getAttribute('aria-expanded') === 'true';
  if (!drawerOpen) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    setDrawerOpen(false);
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = drawerFocusableElements();
  if (!focusable.length) {
    event.preventDefault();
    if (operationsRailEl.focus) operationsRailEl.focus();
    return;
  }
  const first = focusable[0], last = focusable[focusable.length - 1], active = document.activeElement;
  const focusInside = typeof operationsRailEl.contains === 'function' ? operationsRailEl.contains(active) : focusable.includes(active);
  if (event.shiftKey && (active === first || !focusInside)) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && (active === last || !focusInside)) {
    event.preventDefault(); first.focus();
  }
});

function setConnectionState(connected) {
  const message = connected ? 'connected' : 'disconnected · retrying';
  // In the browser, update only the label so the visual dot remains in the DOM.
  // The fallback preserves compatibility with the existing minimal sandbox.
  if (connectionLabelEl) connectionLabelEl.textContent = message;
  else connectionIndicatorEl.textContent = message;
  connectionIndicatorEl.classList.toggle('connection-connected', connected);
  connectionIndicatorEl.classList.toggle('connection-retrying', !connected);
}

async function pollOnce() {
  const myToken = ++requestToken;
  try {
    const [profilesRes, runsRes] = await Promise.all([fetch('/api/profiles'), fetch('/api/runs')]);
    if (!profilesRes.ok || !runsRes.ok) throw new Error('non-OK response');
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

// RF-K01c: one Pi request is the shared source for the panel and Canvas.
const piStatusEl = optionalElement('pi-source-status'), piDetailEl = optionalElement('pi-source-detail'), piMatrixEl = optionalElement('pi-matrix-body'), piTreeEl = optionalElement('pi-tree'), piCountEl = optionalElement('pi-tree-count'), piInspectorEl = optionalElement('pi-inspector');
const piRowsById = new Map(); let piSnapshot = null, piMissionBoard = null, piMissionId = null, piProofRef = null, piSelectedId = null, piInFlight = false;
function piAvailable() { return !!(piStatusEl && piMatrixEl && piTreeEl && piInspectorEl); }
function emitPi(type, detail) { if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') window.dispatchEvent(new CustomEvent(type, { detail })); }
function piNodeLabel(node, freshness) { return [node.role || 'role unavailable', node.rank, node.lifecycle, freshness, node.attention || 'no attention state'].join(' · '); }
function renderPiInspector() {
  if (!piInspectorEl) return;
  clearNode(piInspectorEl);
  const text = document.createElement('p');
  const mission = selectedMission();
  const proof = piProofRef && mission ? mission.proofs.find((item) => item.ref === piProofRef) : null;
  const node = piSnapshot && piSnapshot.nodes.find((entry) => entry.id === piSelectedId);
  if (proof) {
    text.textContent = 'Selected evidence · source: ' + proof.source + ' · type: ' + proof.kind +
      ' · status: ' + (proof.status || 'no status') + '. The private target is not exposed.';
  } else if (node) {
    text.textContent = piNodeLabel(node, piSnapshot.freshness) +
      (node.activity ? ' · activity: ' + node.activity : ' · activity unavailable');
  } else text.textContent = 'Select a Pawn or evidence for the inspector.';
  piInspectorEl.appendChild(text);
}
function selectPiNode(id, fromCanvas) {
  if (!piSnapshot || !piSnapshot.nodes.some((node) => node.id === id)) return;
  piSelectedId = id;
  piProofRef = null;
  renderPiTree();
  renderMissionBoard();
  renderPiInspector();
  if (!fromCanvas) emitPi('rpg:pi-node-selected', { nodeId: id });
}
function renderPiTree() { if (!piTreeEl || !piSnapshot) return; const scrollTop = piTreeEl.scrollTop, seen = new Set(); const nodes = piSnapshot.nodes.slice().sort((a, b) => (a.depth == null ? 999 : a.depth) - (b.depth == null ? 999 : b.depth) || a.id.localeCompare(b.id)); let previous = null; nodes.forEach((node) => { seen.add(node.id); let button = piRowsById.get(node.id); if (!button) { button = document.createElement('button'); button.type = 'button'; button.addEventListener('click', () => selectPiNode(node.id, false)); piRowsById.set(node.id, button); } button.textContent = piNodeLabel(node, piSnapshot.freshness); button.style.setProperty('--tree-depth', String(Math.max(0, node.depth || 0))); button.setAttribute('aria-pressed', node.id === piSelectedId ? 'true' : 'false'); const next = previous ? previous.nextSibling : piTreeEl.firstChild; if (next !== button) piTreeEl.insertBefore(button, next); previous = button; }); for (const [id, button] of piRowsById) if (!seen.has(id)) { button.remove(); piRowsById.delete(id); } piTreeEl.scrollTop = scrollTop; if (piCountEl) piCountEl.textContent = String(nodes.length); }
function renderPiMatrix() { if (!piMatrixEl || !piSnapshot) return; while (piMatrixEl.firstChild) piMatrixEl.removeChild(piMatrixEl.firstChild); ['coordinator', 'direct', 'descendant', 'unknown'].forEach((rank) => { const nodes = piSnapshot.nodes.filter((node) => node.rank === rank); const counts = [nodes.length, nodes.filter((n) => n.lifecycle === 'running').length, nodes.filter((n) => n.lifecycle === 'queued').length, nodes.filter((n) => n.lifecycle === 'paused').length, nodes.filter((n) => n.attention === 'needs_attention').length, nodes.filter((n) => n.lifecycle === 'unknown').length]; const row = document.createElement('tr'); setRowCells(row, [rank, ...counts]); piMatrixEl.appendChild(row); }); }
function renderPi() { if (!piSnapshot) return; const state = piSnapshot.availability === 'unavailable' ? 'unavailable' : piSnapshot.freshness === 'stale' ? 'stale' : 'ready'; piStatusEl.textContent = state; piDetailEl.textContent = state === 'unavailable' ? 'No Pi observation is available.' : piSnapshot.otherObservationCount ? 'Focused observation; other observations: ' + piSnapshot.otherObservationCount + '.' : 'Focused Pi observation.'; renderPiMatrix(); renderPiTree(); renderPiInspector(); }
async function pollPi() {
  if (!piAvailable() || piInFlight) return;
  piInFlight = true;
  try {
    const response = await fetch('/api/pi/mission-board');
    if (!response.ok) throw new Error();
    const board = await response.json();
    if (!board || !board.kingdom || !Array.isArray(board.kingdom.nodes) || !Array.isArray(board.missions)) throw new Error();
    piMissionBoard = board;
    piSnapshot = board.kingdom;
    if (piSelectedId && !piSnapshot.nodes.some((node) => node.id === piSelectedId)) piSelectedId = null;
    if (!piMissionId || !board.missions.some((mission) => mission.id === piMissionId)) piMissionId = board.missions[0] ? board.missions[0].id : null;
    const mission = selectedMission();
    if (piProofRef && (!mission || !mission.proofs.some((proof) => proof.ref === piProofRef))) piProofRef = null;
    renderPi();
    renderMissionBoard();
    renderPiInspector();
    emitPi('rpg:pi-mission-board', { board, missionId: piMissionId, proofRef: piProofRef });
  } catch (_) {
    if (piStatusEl) piStatusEl.textContent = 'disconnected';
    if (piDetailEl) piDetailEl.textContent = 'The Pi connection failed; the last snapshot remains visible.';
    const missionStatus = optionalElement('pi-mission-status');
    if (missionStatus) missionStatus.textContent = 'disconnected';
    emitPi('rpg:pi-disconnected', {});
  } finally {
    piInFlight = false;
    setTimeout(pollPi, POLL_INTERVAL_MS);
  }
}
const piMissionStatusEl = optionalElement('pi-mission-status'), piMissionSelectEl = optionalElement('pi-mission-select'), piMissionDetailEl = optionalElement('pi-mission-detail'), piMissionSummaryEl = optionalElement('pi-mission-summary'), piHandoffsEl = optionalElement('pi-handoffs'), piProofsEl = optionalElement('pi-proofs');
function selectedMission() { return piMissionBoard && piMissionBoard.missions.find((mission) => mission.id === piMissionId); }
function clearNode(element) { while (element && element.firstChild) element.removeChild(element.firstChild); }
function appendMissionNote(container, text) {
  if (!container) return;
  const note = document.createElement('p');
  note.textContent = text;
  container.appendChild(note);
}
function renderMissionBoard() {
  if (!piMissionBoard || !piMissionSelectEl) return;
  const mission = selectedMission();
  clearNode(piMissionSelectEl);
  piMissionBoard.missions.forEach((item, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = 'Mission ' + (index + 1) + ' · ' + item.status;
    option.selected = item.id === piMissionId;
    piMissionSelectEl.appendChild(option);
  });
  const available = piMissionBoard.missionAvailability === 'ready';
  piMissionSelectEl.disabled = !available || !piMissionBoard.missions.length;
  if (piMissionStatusEl) piMissionStatusEl.textContent = available ? (mission ? 'ready' : 'empty') : 'unavailable';
  if (piMissionDetailEl) piMissionDetailEl.textContent = !available
    ? 'The mission root is unavailable.'
    : !mission ? 'The registry is available, with no exposed missions.' : 'Opaque ID; private targets remain unexposed.';
  clearNode(piMissionSummaryEl);
  clearNode(piHandoffsEl);
  clearNode(piProofsEl);
  if (!available) {
    appendMissionNote(piHandoffsEl, 'The handoff route is unavailable.');
    appendMissionNote(piProofsEl, 'The Evidence Vault is unavailable.');
    return;
  }
  if (!mission) {
    appendMissionNote(piHandoffsEl, 'No mission is available for a route.');
    appendMissionNote(piProofsEl, 'No evidence is exposed.');
    return;
  }
  [['status', mission.status], ['goal', mission.goalStatus || 'unspecified'], ['runs', mission.runs.length],
    ['evidence', mission.proofs.length], ['open decisions', mission.openDecisionCount]].forEach(([label, value]) => {
    const item = document.createElement('span');
    item.textContent = label + ': ' + value;
    piMissionSummaryEl.appendChild(item);
  });
  if (!mission.runs.length) appendMissionNote(piHandoffsEl, 'No runs in the mission; zero handoffs.');
  mission.runs.forEach((run, index) => {
    const previous = index ? mission.runs[index - 1] : null;
    const handoff = previous && mission.handoffs.find((item) => item.fromRunId === previous.id && item.toRunId === run.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mission-run';
    button.dataset.confirmed = handoff ? 'true' : 'false';
    button.disabled = !run.linked;
    button.setAttribute('aria-pressed', run.id === piSelectedId ? 'true' : 'false');
    const transition = index === 0 ? 'route start' : handoff ? 'confirmed handoff' : 'unconfirmed handoff';
    button.textContent = transition + ' · ' + (run.role || 'role unavailable') + ' · ' + run.status +
      (run.linked ? '' : ' · uncorrelated Pawn');
    if (run.linked) button.addEventListener('click', () => selectPiNode(run.id, false));
    piHandoffsEl.appendChild(button);
  });
  if (!mission.proofs.length) appendMissionNote(piProofsEl, 'No evidence is exposed; zero gold on the map.');
  mission.proofs.forEach((proof) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mission-proof';
    button.textContent = [proof.source, proof.kind, proof.status || 'no status'].join(' · ');
    button.setAttribute('aria-pressed', proof.ref === piProofRef ? 'true' : 'false');
    button.addEventListener('click', () => selectProof(proof.ref, false));
    piProofsEl.appendChild(button);
  });
}
function selectProof(ref, fromCanvas) {
  const mission = selectedMission();
  const proof = mission && mission.proofs.find((item) => item.ref === ref);
  if (!proof) return;
  piProofRef = ref;
  piSelectedId = null;
  renderPiTree();
  renderMissionBoard();
  renderPiInspector();
  if (!fromCanvas) emitPi('rpg:proof-selected', { missionId: piMissionId, proofRef: ref });
}
if (piMissionSelectEl) piMissionSelectEl.addEventListener('change', () => { const mission = piMissionBoard && piMissionBoard.missions[Number(piMissionSelectEl.value)]; piMissionId = mission ? mission.id : null; piProofRef = null; renderMissionBoard(); emitPi('rpg:pi-mission-board', { board: piMissionBoard, missionId: piMissionId, proofRef: null }); });
if (typeof window !== 'undefined' && window.addEventListener) { window.addEventListener('rpg:world-pi-select', (event) => selectPiNode(event && event.detail && event.detail.nodeId, true)); window.addEventListener('rpg:world-proof-select', (event) => selectProof(event && event.detail && event.detail.proofRef, true)); }
if (piAvailable()) pollPi();
