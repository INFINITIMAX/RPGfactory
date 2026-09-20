// profiles.js — CRUD over the RF-02a schema (`agent_profiles`,
// `configuration_versions`, `profile_history`), injectable like `db.js`/
// `state.js`. RF-02b makes the schema usable without exposing it directly over
// HTTP; `server.js`, which calls this module, owns that responsibility.
//
// No side effects on require OR `createProfilesStore(options)`: the database
// opens lazily on the first function that needs it and is memoized for later
// calls. The reason matches `state.js`: `server.js` constructs the store inside
// `createServer(...)`, which must not touch disk before a real HTTP request.

const crypto = require('crypto');
const { openDatabase } = require('./db');

// Fields changeable through `updateProfile`. Identity (`id`), `created_at`,
// and `revision` never change through this path; `revision` increases only as
// a side effect of a successful write.
const ALLOWED_CHANGE_KEYS = new Set([
  'name',
  'primary_specialization',
  'approval_state',
  'assignable',
  'last_project',
  'last_post',
]);

// Module error with an explicit `code` so server.js can translate directly to
// an HTTP status without parsing messages: 'VALIDATION' -> 400, 'NOT_FOUND'
// -> 404, 'CONFLICT' -> 409 with `current` attached as the profile actually in
// the database at conflict time. Any error without `code` is unexpected, such
// as a disk error, and server.js treats it as 500 as in `state.js`.
function fail(code, message, extra) {
  const e = new Error(message);
  e.code = code;
  if (extra) Object.assign(e, extra);
  return e;
}

// Validates and normalizes `changes` received by `updateProfile`. Rejects any
// key outside `ALLOWED_CHANGE_KEYS`; the module must be safe when used directly,
// not only through `server.js`.
function validateChanges(changes) {
  if (typeof changes !== 'object' || changes === null || Array.isArray(changes)) {
    throw fail('VALIDATION', 'changes must be an object');
  }

  const keys = Object.keys(changes);
  if (keys.length === 0) {
    throw fail('VALIDATION', 'changes cannot be empty');
  }
  for (const key of keys) {
    if (!ALLOWED_CHANGE_KEYS.has(key)) {
      throw fail('VALIDATION', 'unknown field in changes: ' + key);
    }
  }

  const normalized = {};

  if ('name' in changes) {
    if (typeof changes.name !== 'string' || !changes.name.trim()) {
      throw fail('VALIDATION', 'name must be a non-empty string');
    }
    normalized.name = changes.name;
  }

  if ('primary_specialization' in changes) {
    if (typeof changes.primary_specialization !== 'string') {
      throw fail('VALIDATION', 'primary_specialization must be a string');
    }
    normalized.primary_specialization = changes.primary_specialization;
  }

  if ('approval_state' in changes) {
    if (changes.approval_state !== 'proposed' && changes.approval_state !== 'approved') {
      throw fail('VALIDATION', "approval_state must be 'proposed' or 'approved'");
    }
    normalized.approval_state = changes.approval_state;
  }

  if ('assignable' in changes) {
    let value = changes.assignable;
    if (value === true) value = 1;
    else if (value === false) value = 0;
    if (value !== 0 && value !== 1) {
      throw fail('VALIDATION', 'assignable must be 0, 1, true, or false');
    }
    normalized.assignable = value;
  }

  if ('last_project' in changes) {
    if (changes.last_project !== null && typeof changes.last_project !== 'string') {
      throw fail('VALIDATION', 'last_project must be a string or null');
    }
    normalized.last_project = changes.last_project;
  }

  if ('last_post' in changes) {
    if (changes.last_post !== null && typeof changes.last_post !== 'string') {
      throw fail('VALIDATION', 'last_post must be a string or null');
    }
    normalized.last_post = changes.last_post;
  }

  return normalized;
}

function createProfilesStore(options = {}) {
  const dbPath = options.dbPath;
  const migrationsDir = options.migrationsDir;
  const now = options.now || (() => Date.now());

  // Memoize the database opened on first real use and reuse the same handle on
  // later calls. This resembles `createStateStore` but is truly lazy here:
  // state.js keeps no open handle and reads/writes the file per request, while
  // this SQLite handle genuinely must be opened only once.
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
      throw fail('VALIDATION', 'name is required and cannot be empty');
    }
    if (primarySpecialization !== undefined && typeof primarySpecialization !== 'string') {
      throw fail('VALIDATION', 'primarySpecialization must be a string');
    }

    const db = getDb();
    const id = crypto.randomUUID();
    const ts = now();
    const spec = primarySpecialization !== undefined ? primarySpecialization : '';

    // approval_state/assignable/revision retain schema defaults
    // ('proposed', 0, 1). No parameter exists for them here (I26); they change
    // only through `updateProfile` as a separate approval action.
    db.exec('BEGIN');
    try {
      db.prepare(
        'INSERT INTO agent_profiles (id, name, primary_specialization, created_at, updated_at) ' +
          'VALUES (?, ?, ?, ?, ?)'
      ).run(id, name, spec, ts, ts);

      // I27/I35: profile evolution must be visible from creation, not only
      // from the first later change.
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
      throw fail('VALIDATION', 'id is required');
    }
    // Unlike state.js, where baseUpdatedAt=0 meant "first write", a profile
    // always exists here with revision=1. There is no "unwritten" state to
    // handle specially, so expectedRevision is always required.
    if (typeof expectedRevision !== 'number' || !Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw fail('VALIDATION', 'expectedRevision is required and must be an integer >= 1');
    }
    const normalized = validateChanges(changes);

    const db = getDb();
    db.exec('BEGIN');

    const current = db.prepare('SELECT * FROM agent_profiles WHERE id = ?').get(id);
    if (!current) {
      db.exec('ROLLBACK');
      throw fail('NOT_FOUND', 'profile ' + id + ' does not exist');
    }
    if (current.revision !== expectedRevision) {
      db.exec('ROLLBACK');
      throw fail(
        'CONFLICT',
        'expected revision (' + expectedRevision + ') does not match current revision (' + current.revision + ')',
        { current }
      );
    }

    try {
      const fields = Object.keys(normalized);
      const setClauses = fields.map((f) => f + ' = ?').join(', ');
      const params = fields.map((f) => normalized[f]);
      const ts = now();

      // Update and increment revision in one statement under a transaction, as
      // in RF-02a. The revision WHERE clause is a safety net redundant with the
      // check above: node:sqlite is synchronous, so nothing can slip between
      // SELECT and UPDATE in the same transaction. It is not the primary
      // conflict-detection path.
      const result = db
        .prepare(
          'UPDATE agent_profiles SET ' +
            setClauses +
            ', revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?'
        )
        .run(...params, ts, id, expectedRevision);

      if (result.changes !== 1) {
        // This should not happen given the SELECT above in the same transaction.
        // If it does, it is an unexpected database state rather than a normal
        // revision conflict; without `code`, server.js treats it as 500.
        throw new Error('updateProfile: UPDATE did not affect exactly one row (unexpected state)');
      }

      // One history row per field ACTUALLY changed. When the new value equals
      // the old one, write no row because no real change exists to track,
      // although revision still increases because the call was honored.
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
      throw fail('VALIDATION', 'profileId is required');
    }
    if (typeof harness !== 'string' || !harness.trim()) {
      throw fail('VALIDATION', 'harness is required');
    }
    if (typeof provider !== 'string' || !provider.trim()) {
      throw fail('VALIDATION', 'provider is required');
    }
    if (typeof model !== 'string' || !model.trim()) {
      throw fail('VALIDATION', 'model is required');
    }
    for (const [key, value] of [
      ['instructionsRef', instructionsRef],
      ['skillsRef', skillsRef],
      ['memoryRef', memoryRef],
    ]) {
      if (value !== undefined && value !== null && typeof value !== 'string') {
        throw fail('VALIDATION', key + ' must be a string or omitted');
      }
    }

    const db = getDb();
    const id = crypto.randomUUID();
    const ts = now();

    // ABSOLUTE PROHIBITION (as in migrations/001-profiluri.sql):
    // instructionsRef/skillsRef/memoryRef are references/digests, NOT content.
    // They must never contain secrets, keys, tokens, or raw configuration text.
    // The module cannot semantically validate caller input; every new caller
    // must independently follow this rule.
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
      // The schema FOREIGN KEY already rejects insertion when profileId does
      // not exist. Convert the native SQLite error into a clear result so
      // server.js can respond with 404 rather than 500.
      if (e && typeof e.message === 'string' && /FOREIGN KEY/i.test(e.message)) {
        throw fail('NOT_FOUND', 'profile ' + profileId + ' does not exist');
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
