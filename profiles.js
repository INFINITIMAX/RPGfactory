// profiles.js — CRUD peste schema RF-02a (`agent_profiles`,
// `configuration_versions`, `profile_history`), injectabil ca `db.js`/
// `state.js`. RF-02b: face schema utilizabilă, fără s-o expună încă prin
// HTTP (asta e treaba `server.js`, care cheamă acest modul).
//
// Fără efecte secundare la require ȘI la `createProfilesStore(options)`:
// baza de date nu se deschide decât lazy, la prima funcție care are nevoie
// de ea (memoizat — o singură deschidere, refolosită la apelurile
// următoare). Motivul e identic cu `state.js`: `server.js` construiește
// store-ul din interiorul `createServer(...)`, care nu are voie să atingă
// discul până la o cerere HTTP reală.

const crypto = require('crypto');
const { openDatabase } = require('./db');

// Câmpurile care pot fi schimbate prin `updateProfile`. Identitatea (`id`),
// `created_at` și `revision` nu se schimbă niciodată pe această cale —
// `revision` crește doar ca efect secundar al unei scrieri reușite.
const ALLOWED_CHANGE_KEYS = new Set([
  'name',
  'primary_specialization',
  'approval_state',
  'assignable',
  'last_project',
  'last_post',
]);

// Eroare de modul, cu `code` explicit ca server.js să poată traduce direct
// în status HTTP, fără să parseze mesaje: 'VALIDATION' -> 400,
// 'NOT_FOUND' -> 404, 'CONFLICT' -> 409 (cu `current` atașat, profilul
// aflat efectiv în bază la momentul conflictului). Orice eroare fără `code`
// e neașteptată (ex. eroare de disc) — server.js o tratează ca 500, ca la
// `state.js`.
function fail(code, message, extra) {
  const e = new Error(message);
  e.code = code;
  if (extra) Object.assign(e, extra);
  return e;
}

// Validează și normalizează `changes` primit de `updateProfile`. Respinge
// orice cheie din afara `ALLOWED_CHANGE_KEYS` — modulul trebuie să fie sigur
// folosit direct, nu doar prin `server.js`.
function validateChanges(changes) {
  if (typeof changes !== 'object' || changes === null || Array.isArray(changes)) {
    throw fail('VALIDATION', 'changes trebuie să fie un obiect');
  }

  const keys = Object.keys(changes);
  if (keys.length === 0) {
    throw fail('VALIDATION', 'changes nu poate fi gol');
  }
  for (const key of keys) {
    if (!ALLOWED_CHANGE_KEYS.has(key)) {
      throw fail('VALIDATION', 'câmp necunoscut în changes: ' + key);
    }
  }

  const normalized = {};

  if ('name' in changes) {
    if (typeof changes.name !== 'string' || !changes.name.trim()) {
      throw fail('VALIDATION', 'name trebuie să fie un șir nevid');
    }
    normalized.name = changes.name;
  }

  if ('primary_specialization' in changes) {
    if (typeof changes.primary_specialization !== 'string') {
      throw fail('VALIDATION', 'primary_specialization trebuie să fie un șir');
    }
    normalized.primary_specialization = changes.primary_specialization;
  }

  if ('approval_state' in changes) {
    if (changes.approval_state !== 'proposed' && changes.approval_state !== 'approved') {
      throw fail('VALIDATION', "approval_state trebuie să fie 'proposed' sau 'approved'");
    }
    normalized.approval_state = changes.approval_state;
  }

  if ('assignable' in changes) {
    let value = changes.assignable;
    if (value === true) value = 1;
    else if (value === false) value = 0;
    if (value !== 0 && value !== 1) {
      throw fail('VALIDATION', 'assignable trebuie să fie 0, 1, true sau false');
    }
    normalized.assignable = value;
  }

  if ('last_project' in changes) {
    if (changes.last_project !== null && typeof changes.last_project !== 'string') {
      throw fail('VALIDATION', 'last_project trebuie să fie un șir sau null');
    }
    normalized.last_project = changes.last_project;
  }

  if ('last_post' in changes) {
    if (changes.last_post !== null && typeof changes.last_post !== 'string') {
      throw fail('VALIDATION', 'last_post trebuie să fie un șir sau null');
    }
    normalized.last_post = changes.last_post;
  }

  return normalized;
}

function createProfilesStore(options = {}) {
  const dbPath = options.dbPath;
  const migrationsDir = options.migrationsDir;
  const now = options.now || (() => Date.now());

  // Memoizare: deschidem baza o singură dată, la prima nevoie reală, și
  // refolosim același handle la apelurile următoare — la fel ca
  // `createStateStore`, dar aici cu adevărat lazy (state.js nu ține un
  // handle deschis, citește/scrie fișierul la fiecare cerere; aici avem un
  // handle SQLite care chiar trebuie deschis o singură dată).
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

  function getProfile(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM agent_profiles WHERE id = ?').get(id) || null;
  }

  function listProfiles() {
    const db = getDb();
    return db.prepare('SELECT * FROM agent_profiles ORDER BY created_at ASC, id ASC').all();
  }

  function getProfileHistory(id) {
    const db = getDb();
    return db
      .prepare('SELECT * FROM profile_history WHERE profile_id = ? ORDER BY changed_at ASC, id ASC')
      .all(id);
  }

  function createProfile({ name, primarySpecialization } = {}) {
    if (typeof name !== 'string' || !name.trim()) {
      throw fail('VALIDATION', 'name este obligatoriu și nu poate fi gol');
    }
    if (primarySpecialization !== undefined && typeof primarySpecialization !== 'string') {
      throw fail('VALIDATION', 'primarySpecialization trebuie să fie un șir');
    }

    const db = getDb();
    const id = crypto.randomUUID();
    const ts = now();
    const spec = primarySpecialization !== undefined ? primarySpecialization : '';

    // approval_state/assignable/revision rămân pe implicitul din schemă
    // ('proposed', 0, 1) — nu există parametru pentru ele aici (I26: se
    // schimbă doar prin `updateProfile`, ca acțiune separată de aprobare).
    db.exec('BEGIN');
    try {
      db.prepare(
        'INSERT INTO agent_profiles (id, name, primary_specialization, created_at, updated_at) ' +
          'VALUES (?, ?, ?, ?, ?)'
      ).run(id, name, spec, ts, ts);

      // I27/I35: evoluția unui profil trebuie să se vadă de la început, nu
      // doar de la prima modificare.
      db.prepare(
        'INSERT INTO profile_history (profile_id, changed_at, field, old_value, new_value) ' +
          'VALUES (?, ?, ?, ?, ?)'
      ).run(id, ts, 'created', null, name);

      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    return getProfile(id);
  }

  function updateProfile(id, { expectedRevision, changes } = {}) {
    if (typeof id !== 'string' || !id) {
      throw fail('VALIDATION', 'id este obligatoriu');
    }
    // Spre deosebire de state.js (unde baseUpdatedAt=0 însemna "primă
    // scriere"), aici un profil există dintotdeauna cu revision=1 — nu
    // există stare "nescrisă" de tratat special, deci expectedRevision e
    // întotdeauna obligatoriu.
    if (typeof expectedRevision !== 'number' || !Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw fail('VALIDATION', 'expectedRevision este obligatoriu și trebuie să fie un întreg >= 1');
    }
    const normalized = validateChanges(changes);

    const db = getDb();
    db.exec('BEGIN');

    const current = db.prepare('SELECT * FROM agent_profiles WHERE id = ?').get(id);
    if (!current) {
      db.exec('ROLLBACK');
      throw fail('NOT_FOUND', 'profilul ' + id + ' nu există');
    }
    if (current.revision !== expectedRevision) {
      db.exec('ROLLBACK');
      throw fail(
        'CONFLICT',
        'revizia așteptată (' + expectedRevision + ') nu se potrivește cu revizia curentă (' + current.revision + ')',
        { current }
      );
    }

    try {
      const fields = Object.keys(normalized);
      const setClauses = fields.map((f) => f + ' = ?').join(', ');
      const params = fields.map((f) => normalized[f]);
      const ts = now();

      // Actualizare + incrementare revizie într-o singură instrucțiune, sub
      // tranzacție (ca la RF-02a). WHERE-ul pe revision e o plasă de
      // siguranță redundantă cu verificarea de mai sus (node:sqlite e
      // sincron — nimic nu se poate strecura între SELECT și UPDATE în
      // aceeași tranzacție), nu calea principală de detectare a conflictului.
      const result = db
        .prepare(
          'UPDATE agent_profiles SET ' +
            setClauses +
            ', revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?'
        )
        .run(...params, ts, id, expectedRevision);

      if (result.changes !== 1) {
        // Nu ar trebui să se întâmple, dat fiind SELECT-ul de mai sus în
        // aceeași tranzacție — dacă totuși se întâmplă, e o stare
        // neașteptată a bazei, nu un conflict normal de revizie (fără
        // `code`, server.js o tratează ca 500).
        throw new Error('updateProfile: UPDATE nu a afectat exact un rând (stare neașteptată)');
      }

      // Un rând de istoric per câmp schimbat EFECTIV — dacă valoarea nouă
      // e identică cu cea veche, nu scriem rând (nicio schimbare reală de
      // urmărit, deși revizia tot crește, fiindcă apelul a fost onorat).
      const insertHistory = db.prepare(
        'INSERT INTO profile_history (profile_id, changed_at, field, old_value, new_value) ' +
          'VALUES (?, ?, ?, ?, ?)'
      );
      for (const field of fields) {
        const oldValue = current[field];
        const newValue = normalized[field];
        if (oldValue === newValue) continue;
        insertHistory.run(
          id,
          ts,
          field,
          oldValue === null || oldValue === undefined ? null : String(oldValue),
          newValue === null || newValue === undefined ? null : String(newValue)
        );
      }

      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    return getProfile(id);
  }

  function createConfigurationVersion(
    profileId,
    { harness, provider, model, instructionsRef, skillsRef, memoryRef } = {}
  ) {
    if (typeof profileId !== 'string' || !profileId) {
      throw fail('VALIDATION', 'profileId este obligatoriu');
    }
    if (typeof harness !== 'string' || !harness.trim()) {
      throw fail('VALIDATION', 'harness este obligatoriu');
    }
    if (typeof provider !== 'string' || !provider.trim()) {
      throw fail('VALIDATION', 'provider este obligatoriu');
    }
    if (typeof model !== 'string' || !model.trim()) {
      throw fail('VALIDATION', 'model este obligatoriu');
    }
    for (const [key, value] of [
      ['instructionsRef', instructionsRef],
      ['skillsRef', skillsRef],
      ['memoryRef', memoryRef],
    ]) {
      if (value !== undefined && value !== null && typeof value !== 'string') {
        throw fail('VALIDATION', key + ' trebuie să fie un șir sau lipsă');
      }
    }

    const db = getDb();
    const id = crypto.randomUUID();
    const ts = now();

    // INTERDICȚIE ABSOLUTĂ (ca în migrations/001-profiluri.sql):
    // instructionsRef/skillsRef/memoryRef sunt referințe/digesturi, NU
    // conținut — niciodată secrete, chei, tokenuri sau text de configurare
    // brut. Modulul nu poate valida semantic ce trimite apelantul; orice
    // apelator nou trebuie să respecte regula asta singur.
    try {
      db.prepare(
        'INSERT INTO configuration_versions ' +
          '(id, profile_id, harness, provider, model, instructions_ref, skills_ref, memory_ref, created_at) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id,
        profileId,
        harness,
        provider,
        model,
        instructionsRef === undefined ? null : instructionsRef,
        skillsRef === undefined ? null : skillsRef,
        memoryRef === undefined ? null : memoryRef,
        ts
      );
    } catch (e) {
      // FOREIGN KEY din schemă respinge oricum inserția dacă profileId nu
      // există — prindem eroarea nativă SQLite și o transformăm într-un
      // rezultat clar, ca server.js să poată răspunde 404, nu 500.
      if (e && typeof e.message === 'string' && /FOREIGN KEY/i.test(e.message)) {
        throw fail('NOT_FOUND', 'profilul ' + profileId + ' nu există');
      }
      throw e;
    }

    return db.prepare('SELECT * FROM configuration_versions WHERE id = ?').get(id);
  }

  function listConfigurationVersions(profileId) {
    const db = getDb();
    return db
      .prepare('SELECT * FROM configuration_versions WHERE profile_id = ? ORDER BY created_at ASC, id ASC')
      .all(profileId);
  }

  return {
    createProfile,
    getProfile,
    listProfiles,
    updateProfile,
    getProfileHistory,
    createConfigurationVersion,
    listConfigurationVersions,
    close,
  };
}

module.exports = { createProfilesStore };
