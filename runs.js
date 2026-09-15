// runs.js — CRUD peste schema RF-02c (`runs`), injectabil ca `profiles.js`.
// Entitatea Run (spec.md §3): o sesiune observată dintr-un harness oarecare,
// cu identitate nativă a ei, opțional legată de un profil, cu propria stare
// de lifecycle.
//
// Fără efecte secundare la require ȘI la `createRunsStore(options)`: baza de
// date nu se deschide decât lazy, la prima funcție care are nevoie de ea
// (memoizat). Handle propriu, independent de `profiles.js` — fiecare modul
// care deschide un handle SQLite răspunde de închiderea lui (lecția
// RF-02b-b/c); WAL (deja configurat la RF-02a) permite ca ambele handle-uri
// să fie deschise simultan pe același fișier.
//
// IMPORTANT: acest modul NU citește nimic real din Pi/Claude Code.
// `observeRun` e chemat doar din teste/API cu date sintetice — un adaptor
// real care sondează harness-urile vine în RF-03.

const { openDatabase } = require('./db');

const LIFECYCLES = new Set([
  'queued',
  'running',
  'completed',
  'failed',
  'stopped',
  'paused',
  'unknown',
]);

// Lifecycle-urile care înseamnă "sesiune activă" — folosite atât de I24
// (conflict de execuție), cât și de `getActiveRunsForProfile`.
const ACTIVE_LIFECYCLES = new Set(['queued', 'running', 'paused']);

// Eroare de modul, cu `code` explicit ca server.js să poată traduce direct
// în status HTTP, fără să parseze mesaje: 'VALIDATION' -> 400,
// 'NOT_FOUND' -> 404, 'CONFLICT' -> 409 (cu `activeRuns`/`current` atașat).
// Ca la profiles.js.
function fail(code, message, extra) {
  const e = new Error(message);
  e.code = code;
  if (extra) Object.assign(e, extra);
  return e;
}

function buildRunId(sourceHarness, nativeId) {
  return sourceHarness + ':' + nativeId;
}

function createRunsStore(options = {}) {
  const dbPath = options.dbPath;
  const migrationsDir = options.migrationsDir;
  const now = options.now || (() => Date.now());

  // Memoizare: deschidem baza o singură dată, la prima nevoie reală — ca la
  // `profiles.js`, dar cu handle propriu (nu partajăm cu profilesStore).
  let dbHandle = null;
  function getDb() {
    if (!dbHandle) {
      dbHandle = openDatabase({ path: dbPath, migrationsDir, now });
    }
    return dbHandle.db;
  }

  function close() {
    if (dbHandle) {
      dbHandle.close();
      dbHandle = null;
    }
  }

  function getRun(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM runs WHERE id = ?').get(id) || null;
  }

  function listRuns() {
    const db = getDb();
    return db.prepare('SELECT * FROM runs ORDER BY created_at ASC, id ASC').all();
  }

  function listRunsForProfile(profileId) {
    const db = getDb();
    return db
      .prepare('SELECT * FROM runs WHERE profile_id = ? ORDER BY created_at ASC, id ASC')
      .all(profileId);
  }

  // Citire simplă, expusă și public (utilă mai târziu pentru HUD, RF-04, și
  // pentru a detecta manual un conflict deja existent în date) — vezi
  // §2.6 din brief.
  function getActiveRunsForProfile(profileId) {
    const db = getDb();
    return db
      .prepare(
        "SELECT * FROM runs WHERE profile_id = ? AND lifecycle IN ('queued', 'running', 'paused') " +
          'ORDER BY created_at ASC, id ASC'
      )
      .all(profileId);
  }

  // Upsert idempotent, chemat de un viitor adaptor (RF-03) la fiecare poll.
  //
  // DE CE NU ARE CAS (`expectedRevision`), spre deosebire de
  // `updateProfile`/`associateProfile`: acolo revizia protejează o schimbare
  // INTENȚIONATĂ de utilizator/planner împotriva unei scrieri concurente pe
  // baza unei stări vechi citite anterior. `observeRun` nu e o intenție de
  // schimbare — e un flux automat de ingestie ("am văzut din nou sesiunea
  // asta, cam așa arată acum"), fără citire prealabilă de care apelantul să
  // țină cont. Un adaptor care sondează la fiecare câteva secunde n-ar putea
  // ține evidența unei revizii doar ca să raporteze ce a văzut deja — asta
  // ar transforma un simplu "heartbeat" într-un protocol cu stare pe partea
  // adaptorului, fără niciun beneficiu (nu există altă sursă care ar putea
  // "intra peste" o observare cu o schimbare concurentă a acelorași câmpuri:
  // doar adaptorul respectiv scrie lifecycle-ul de observare pentru acel
  // native_id anume). Revizia tot crește la fiecare observare (e o scriere
  // reală), dar fără verificare optimistă la intrare.
  function observeRun({ sourceHarness, nativeId, project, lifecycle } = {}) {
    if (typeof sourceHarness !== 'string' || !sourceHarness.trim()) {
      throw fail('VALIDATION', 'sourceHarness este obligatoriu și nu poate fi gol');
    }
    if (typeof nativeId !== 'string' || !nativeId.trim()) {
      throw fail('VALIDATION', 'nativeId este obligatoriu și nu poate fi gol');
    }
    if (project !== undefined && project !== null && typeof project !== 'string') {
      throw fail('VALIDATION', 'project trebuie să fie un șir sau lipsă/null');
    }
    if (lifecycle !== undefined && !LIFECYCLES.has(lifecycle)) {
      throw fail('VALIDATION', 'lifecycle invalid: ' + lifecycle);
    }

    const db = getDb();
    const id = buildRunId(sourceHarness, nativeId);
    const ts = now();

    const existing = db.prepare('SELECT * FROM runs WHERE id = ?').get(id);

    if (!existing) {
      db.prepare(
        'INSERT INTO runs ' +
          '(id, source_harness, native_id, profile_id, project, lifecycle, ' +
          'first_observed_at, last_observed_at, created_at, updated_at, revision) ' +
          'VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 1)'
      ).run(
        id,
        sourceHarness,
        nativeId,
        project === undefined ? null : project,
        lifecycle === undefined ? 'unknown' : lifecycle,
        ts,
        ts,
        ts,
        ts
      );
      return getRun(id);
    }

    // UPDATE — NU atinge profile_id: o observare nouă nu poate desface o
    // asociere existentă. `lifecycle`/`project` se actualizează doar dacă
    // vin în apel, altfel păstrează valoarea existentă (nu suprascrie cu
    // 'unknown'/null din greșeală).
    const newLifecycle = lifecycle === undefined ? existing.lifecycle : lifecycle;
    const newProject = project === undefined ? existing.project : project;

    db.prepare(
      'UPDATE runs SET project = ?, lifecycle = ?, last_observed_at = ?, updated_at = ?, ' +
        'revision = revision + 1 WHERE id = ?'
    ).run(newProject, newLifecycle, ts, ts, id);

    return getRun(id);
  }

  // associateProfile — regula I24 ("o execuție activă per specialist
  // global"): asocierea manuală la un profil deja ocupat de ALT run activ
  // se refuză cu 409/CONFLICT, nu se forțează. Nu există parametru de
  // "forțează oricum" în acest lot.
  function associateProfile(runId, { profileId, expectedRevision } = {}) {
    if (typeof runId !== 'string' || !runId) {
      throw fail('VALIDATION', 'runId este obligatoriu');
    }
    if (typeof profileId !== 'string' || !profileId) {
      throw fail('VALIDATION', 'profileId este obligatoriu');
    }
    if (typeof expectedRevision !== 'number' || !Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw fail('VALIDATION', 'expectedRevision este obligatoriu și trebuie să fie un întreg >= 1');
    }

    const db = getDb();
    db.exec('BEGIN');

    const current = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
    if (!current) {
      db.exec('ROLLBACK');
      throw fail('NOT_FOUND', 'run-ul ' + runId + ' nu există');
    }
    if (current.revision !== expectedRevision) {
      db.exec('ROLLBACK');
      throw fail(
        'CONFLICT',
        'revizia așteptată (' + expectedRevision + ') nu se potrivește cu revizia curentă (' + current.revision + ')',
        { current }
      );
    }

    const profile = db.prepare('SELECT id FROM agent_profiles WHERE id = ?').get(profileId);
    if (!profile) {
      db.exec('ROLLBACK');
      throw fail('NOT_FOUND', 'profilul ' + profileId + ' nu există');
    }

    // I24: dacă profileId are deja alt run activ (queued/running/paused),
    // altul decât runId însuși, asocierea se refuză — nu forțăm. Returnăm
    // TOATE run-urile active care blochează, nu doar primul găsit (I24:
    // "observatorul nu ascunde execuții care încalcă regula: păstrează
    // dovezile și semnalează conflictul").
    const activeRuns = db
      .prepare(
        "SELECT * FROM runs WHERE profile_id = ? AND lifecycle IN ('queued', 'running', 'paused') AND id != ? " +
          'ORDER BY created_at ASC, id ASC'
      )
      .all(profileId, runId);
    if (activeRuns.length > 0) {
      db.exec('ROLLBACK');
      throw fail(
        'CONFLICT',
        'profilul ' + profileId + ' are deja ' + activeRuns.length + ' execuție/execuții activă/active (I24)',
        { activeRuns }
      );
    }

    const ts = now();
    // Re-asociere (runId era deja legat de alt profil): permisă atâta timp
    // cât profilul NOU nu are deja alt run activ (verificat mai sus) —
    // spec.md nu interzice realocarea, doar refuză asocierea la un profil
    // OCUPAT. Decizia e documentată în raport.
    const result = db
      .prepare('UPDATE runs SET profile_id = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?')
      .run(profileId, ts, runId, expectedRevision);

    if (result.changes !== 1) {
      db.exec('ROLLBACK');
      throw new Error('associateProfile: UPDATE nu a afectat exact un rând (stare neașteptată)');
    }

    db.exec('COMMIT');
    return getRun(runId);
  }

  function dissociateProfile(runId, { expectedRevision } = {}) {
    if (typeof runId !== 'string' || !runId) {
      throw fail('VALIDATION', 'runId este obligatoriu');
    }
    if (typeof expectedRevision !== 'number' || !Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw fail('VALIDATION', 'expectedRevision este obligatoriu și trebuie să fie un întreg >= 1');
    }

    const db = getDb();
    db.exec('BEGIN');

    const current = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
    if (!current) {
      db.exec('ROLLBACK');
      throw fail('NOT_FOUND', 'run-ul ' + runId + ' nu există');
    }
    if (current.revision !== expectedRevision) {
      db.exec('ROLLBACK');
      throw fail(
        'CONFLICT',
        'revizia așteptată (' + expectedRevision + ') nu se potrivește cu revizia curentă (' + current.revision + ')',
        { current }
      );
    }

    const ts = now();
    // Eliberarea unui profil nu poate crea conflict, doar rezolva unul — nu
    // se verifică nimic legat de I24 aici.
    const result = db
      .prepare('UPDATE runs SET profile_id = NULL, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?')
      .run(ts, runId, expectedRevision);

    if (result.changes !== 1) {
      db.exec('ROLLBACK');
      throw new Error('dissociateProfile: UPDATE nu a afectat exact un rând (stare neașteptată)');
    }

    db.exec('COMMIT');
    return getRun(runId);
  }

  return {
    observeRun,
    associateProfile,
    dissociateProfile,
    getRun,
    listRuns,
    listRunsForProfile,
    getActiveRunsForProfile,
    close,
  };
}

module.exports = { createRunsStore };
