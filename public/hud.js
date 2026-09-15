// hud.js — ecranul principal (RF-04): tabele de profiluri/sesiuni observate,
// inspector, acțiuni. Consumă exclusiv API-ul existent (RF-02b/RF-02c), fără
// rute noi.
//
// REGULA XSS (docs/AUDIT-13-09-2026.md, F04): orice text venit din date
// (nume, specializare, project, native_id etc.) se pune în DOM prin
// `textContent`/`createElement`, NICIODATĂ prin `innerHTML` cu un șablon de
// string care include acea valoare. Acest fișier nu folosește `innerHTML`
// nicăieri.

const POLL_INTERVAL_MS = 3000;

const profilesTbody = document.getElementById('profiles-tbody');
const runsTbody = document.getElementById('runs-tbody');
const connectionIndicatorEl = document.getElementById('connection-indicator');
const inspectorEl = document.getElementById('inspector');
const createProfileForm = document.getElementById('create-profile-form');
const createProfileNameInput = document.getElementById('create-profile-name');
const createProfileSpecializationInput = document.getElementById('create-profile-specialization');
const createProfileErrorEl = document.getElementById('create-profile-error');

// Ultimul snapshot cunoscut — înlocuit complet la fiecare ciclu de sondare
// reușit (nu se face merge parțial; server.js e sursa de adevăr).
let profiles = [];
let runs = [];

// Selecția curentă: { kind: 'profile' | 'run', id } sau null. Persistă după
// `id`, nu după poziția în listă — vezi `pruneSelection`.
let selection = null;

// Rânduri DOM ținute pe `id`, ca să nu reconstruim tabelul întreg la fiecare
// poll (spec.md §7: focus/scroll/selecție stabile, fără „clipit”).
const profileRowsById = new Map();
const runRowsById = new Map();

// Token de cerere: la fiecare pornire de ciclu se incrementează; un răspuns
// care ajunge după ce alt ciclu mai nou a pornit deja (myToken !== requestToken)
// nu se mai aplică peste starea curentă.
let requestToken = 0;

function findProfile(id) {
  return profiles.find((p) => p.id === id) || null;
}

function findRun(id) {
  return runs.find((r) => r.id === id) || null;
}

function isProfileSelected(id) {
  return !!selection && selection.kind === 'profile' && selection.id === id;
}

function isRunSelected(id) {
  return !!selection && selection.kind === 'run' && selection.id === id;
}

function selectProfile(id) {
  selection = { kind: 'profile', id };
  renderProfilesTable();
  renderRunsTable();
  renderInspector();
}

function selectRun(id) {
  selection = { kind: 'run', id };
  renderProfilesTable();
  renderRunsTable();
  renderInspector();
}

// Dacă elementul selectat a dispărut din ultimul snapshot (ex. între timp
// run-ul nu mai apare), selecția se golește explicit — inspectorul nu rămâne
// cu date vechi „agățate”.
function pruneSelection() {
  if (!selection) return;
  if (selection.kind === 'profile' && !findProfile(selection.id)) {
    selection = null;
  } else if (selection.kind === 'run' && !findRun(selection.id)) {
    selection = null;
  }
}

// Reconciliere generică: potrivește rândurile existente (după `id`) cu
// lista nouă, adaugă/șterge doar ce s-a schimbat, reordonează dacă e nevoie.
// `buildCells(tr, item)` scrie conținutul rândului (prin textContent).
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
    tr.classList.toggle('selected', isSelected(id));

    const expectedNext = previousEl === null ? tbody.firstChild : previousEl.nextSibling;
    if (expectedNext !== tr) {
      tbody.insertBefore(tr, expectedNext);
    }
    previousEl = tr;
  }

  for (const [id, tr] of rowMap) {
    if (!seen.has(id)) {
      tr.remove();
      rowMap.delete(id);
    }
  }
}

// Scrie exact `values.length` celule în `tr`, refolosind celulele existente
// și actualizând doar `textContent`-ul lor (nu recreează celulele la fiecare
// apel dacă numărul de coloane nu s-a schimbat).
function setRowCells(tr, values) {
  while (tr.children.length < values.length) {
    tr.appendChild(document.createElement('td'));
  }
  while (tr.children.length > values.length) {
    tr.removeChild(tr.lastChild);
  }
  values.forEach((value, i) => {
    if (tr.children[i].textContent !== value) {
      tr.children[i].textContent = value;
    }
  });
}

function renderProfilesTable() {
  reconcileTable(
    profilesTbody,
    profileRowsById,
    profiles,
    (p) => p.id,
    (tr, p) => {
      setRowCells(tr, [
        p.name,
        p.primary_specialization || '—',
        p.approval_state,
        p.assignable ? 'da' : 'nu',
        p.last_project || '—',
      ]);
    },
    isProfileSelected,
    selectProfile
  );
}

function renderRunsTable() {
  reconcileTable(
    runsTbody,
    runRowsById,
    runs,
    (r) => r.id,
    (tr, r) => {
      const profile = r.profile_id ? findProfile(r.profile_id) : null;
      setRowCells(tr, [
        r.source_harness,
        r.project || '—',
        r.lifecycle,
        profile ? profile.name : 'neasociat',
      ]);
    },
    isRunSelected,
    selectRun
  );
}

function clearInspector() {
  while (inspectorEl.firstChild) {
    inspectorEl.removeChild(inspectorEl.firstChild);
  }
}

function addInspectorField(label, value) {
  const row = document.createElement('div');
  row.className = 'field';
  const labelEl = document.createElement('span');
  labelEl.className = 'label';
  labelEl.textContent = label;
  row.appendChild(labelEl);
  row.appendChild(document.createTextNode(value));
  inspectorEl.appendChild(row);
}

// Ultima combinație (kind, id, revision) reconstruită efectiv în inspector.
// Evită să reconstruim tot panoul la fiecare poll de 3s dacă elementul
// selectat nu s-a schimbat — o reconstrucție necondiționată strica orice
// interacțiune în curs (ex. dropdown deschis, opțiune aleasă).
let lastRenderedInspector = null;

function renderInspector() {
  inspectorEl.classList.toggle('hidden', !selection);
  if (!selection) {
    clearInspector();
    lastRenderedInspector = null;
    return;
  }
  if (selection.kind === 'profile') {
    const profile = findProfile(selection.id);
    if (!profile) return; // pruneSelection ar fi trebuit deja să golească asta
    if (
      lastRenderedInspector &&
      lastRenderedInspector.kind === 'profile' &&
      lastRenderedInspector.id === profile.id &&
      lastRenderedInspector.revision === profile.revision
    ) {
      return; // niciun `id` sau `revision` schimbat — nu reconstruim
    }
    renderProfileInspector(profile);
    lastRenderedInspector = { kind: 'profile', id: profile.id, revision: profile.revision };
  } else {
    const run = findRun(selection.id);
    if (!run) return;
    if (
      lastRenderedInspector &&
      lastRenderedInspector.kind === 'run' &&
      lastRenderedInspector.id === run.id &&
      lastRenderedInspector.revision === run.revision
    ) {
      return; // niciun `id` sau `revision` schimbat — nu reconstruim
    }
    renderRunInspector(run);
    lastRenderedInspector = { kind: 'run', id: run.id, revision: run.revision };
  }
}

function renderProfileInspector(profile) {
  clearInspector();

  const title = document.createElement('h2');
  title.textContent = 'Profil';
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

  if (profile.approval_state === 'proposed') {
    const approveBtn = document.createElement('button');
    approveBtn.textContent = 'Aprobă profilul';
    approveBtn.addEventListener('click', () => approveProfile(profile, errorEl));
    actions.appendChild(approveBtn);
  }

  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = profile.assignable ? 'Dezactivează eligibilitatea' : 'Activează eligibilitatea';
  toggleBtn.addEventListener('click', () => toggleAssignable(profile, errorEl));
  actions.appendChild(toggleBtn);

  actions.appendChild(errorEl);
  inspectorEl.appendChild(actions);
}

function renderRunInspector(run) {
  clearInspector();

  const title = document.createElement('h2');
  title.textContent = 'Sesiune observată';
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
    associateBtn.addEventListener('click', () => associateRun(run, select.value, errorEl));
    actions.appendChild(select);
    actions.appendChild(associateBtn);
  } else {
    const dissociateBtn = document.createElement('button');
    dissociateBtn.textContent = 'Dezasociază';
    dissociateBtn.addEventListener('click', () => dissociateRun(run, errorEl));
    actions.appendChild(dissociateBtn);
  }

  actions.appendChild(errorEl);
  inspectorEl.appendChild(actions);
}

function applyUpdatedProfile(updated) {
  const idx = profiles.findIndex((p) => p.id === updated.id);
  if (idx >= 0) profiles[idx] = updated;
  else profiles.push(updated);
  renderProfilesTable();
  renderRunsTable(); // numele profilului poate apărea în tabelul de sesiuni
  renderInspector();
}

function applyUpdatedRun(updated) {
  const idx = runs.findIndex((r) => r.id === updated.id);
  if (idx >= 0) runs[idx] = updated;
  else runs.push(updated);
  renderRunsTable();
  renderInspector();
}

async function approveProfile(profile, errorEl) {
  errorEl.textContent = '';
  try {
    const res = await fetch('/api/profiles/' + profile.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedRevision: profile.revision,
        changes: { approval_state: 'approved' },
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      errorEl.textContent = body.error || ('eroare ' + res.status);
      return;
    }
    applyUpdatedProfile(body);
  } catch (e) {
    errorEl.textContent = 'cererea a eșuat';
  }
}

async function toggleAssignable(profile, errorEl) {
  errorEl.textContent = '';
  try {
    const res = await fetch('/api/profiles/' + profile.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedRevision: profile.revision,
        changes: { assignable: !profile.assignable },
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      errorEl.textContent = body.error || ('eroare ' + res.status);
      return;
    }
    applyUpdatedProfile(body);
  } catch (e) {
    errorEl.textContent = 'cererea a eșuat';
  }
}

async function associateRun(run, profileId, errorEl) {
  errorEl.textContent = '';
  if (!profileId) {
    errorEl.textContent = 'alege un profil din listă';
    return;
  }
  try {
    const res = await fetch('/api/runs/' + run.id + '/associate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, expectedRevision: run.revision }),
    });
    const body = await res.json();
    if (!res.ok) {
      let message = body.error || ('eroare ' + res.status);
      if (body.activeRuns && body.activeRuns.length) {
        message += ' — blocat de: ' + body.activeRuns.map((r) => r.id).join(', ');
      }
      errorEl.textContent = message;
      return;
    }
    applyUpdatedRun(body);
  } catch (e) {
    errorEl.textContent = 'cererea a eșuat';
  }
}

async function dissociateRun(run, errorEl) {
  errorEl.textContent = '';
  try {
    const res = await fetch('/api/runs/' + run.id + '/dissociate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: run.revision }),
    });
    const body = await res.json();
    if (!res.ok) {
      errorEl.textContent = body.error || ('eroare ' + res.status);
      return;
    }
    applyUpdatedRun(body);
  } catch (e) {
    errorEl.textContent = 'cererea a eșuat';
  }
}

createProfileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  createProfileErrorEl.textContent = '';
  const name = createProfileNameInput.value.trim();
  if (!name) {
    createProfileErrorEl.textContent = 'numele este obligatoriu';
    return;
  }
  const specialization = createProfileSpecializationInput.value.trim();
  try {
    const res = await fetch('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        primarySpecialization: specialization || undefined,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      createProfileErrorEl.textContent = body.error || ('eroare ' + res.status);
      return;
    }
    // Actualizare optimistă locală — apare imediat în tabel, fără să aștepte
    // următorul ciclu de sondare (confirmat/corectat oricum la poll-ul următor).
    profiles.push(body);
    renderProfilesTable();
    createProfileNameInput.value = '';
    createProfileSpecializationInput.value = '';
  } catch (e) {
    createProfileErrorEl.textContent = 'cererea a eșuat';
  }
});

function setConnectionState(connected) {
  connectionIndicatorEl.textContent = connected ? 'conectat' : 'reîncercăm...';
  connectionIndicatorEl.classList.toggle('connection-connected', connected);
  connectionIndicatorEl.classList.toggle('connection-retrying', !connected);
}

// Ciclu de sondare single-flight: următorul ciclu se programează abia după
// ce cel curent s-a terminat (succes sau eșec) — niciodată suprapus. Token-ul
// de cerere e o gardă suplimentară, explicită: dacă un răspuns ajunge după ce
// alt ciclu mai nou a pornit deja, nu se mai aplică peste starea curentă.
async function pollOnce() {
  const myToken = ++requestToken;
  try {
    const [profilesRes, runsRes] = await Promise.all([
      fetch('/api/profiles'),
      fetch('/api/runs'),
    ]);
    if (!profilesRes.ok || !runsRes.ok) {
      throw new Error('răspuns non-OK de la /api/profiles sau /api/runs');
    }
    const [newProfiles, newRuns] = await Promise.all([profilesRes.json(), runsRes.json()]);

    if (myToken !== requestToken) return; // răspuns vechi — un ciclu mai nou a preluat deja

    profiles = newProfiles;
    runs = newRuns;
    pruneSelection();
    setConnectionState(true);
    renderProfilesTable();
    renderRunsTable();
    renderInspector();
  } catch (e) {
    if (myToken === requestToken) setConnectionState(false);
  } finally {
    setTimeout(pollOnce, POLL_INTERVAL_MS);
  }
}

pollOnce();
