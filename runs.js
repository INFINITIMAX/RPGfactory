// runs.js — CRUD over the RF-02c schema (`runs`), injectable like profiles.js.
// The Run entity (spec.md §3) is an observed run from any harness, with its own
// native identity, optional profile association, and lifecycle state.
//
// No side effects on require OR `createRunsStore(options)`: the database opens
// lazily on the first function that needs it and is memoized. It owns a handle
// independent from profiles.js; each module opening a SQLite handle is
// responsible for closing it (RF-02b-b/c), and WAL, configured in RF-02a,
// permits both handles to remain open on the same file simultaneously.
//
// IMPORTANT: this module reads no real Pi/Claude Code data. `observeRun` is
// called only from tests/API with synthetic data; a real harness-polling
// adapter arrives in RF-03.

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

// Lifecycles that mean "active run", used by both I24 conflict detection and
// `getActiveRunsForProfile`.
const ACTIVE_LIFECYCLES = new Set(['queued', 'running', 'paused']);

// Module error with explicit `code` so server.js can translate directly to an
// HTTP status without parsing messages: 'VALIDATION' -> 400, 'NOT_FOUND' ->
// 404, 'CONFLICT' -> 409 with `activeRuns`/`current` attached, as in profiles.js.
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

  // Memoize the database opened on first real use, as in profiles.js, but
  // retain an independently owned handle rather than sharing profilesStore.
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

  // Simple public read, useful later for the RF-04 HUD and for manually
  // detecting a conflict already present in data; see brief §2.6.
  function getActiveRunsForProfile(profileId) {
    const db = getDb();
    return db
      .prepare(
        "SELECT * FROM runs WHERE profile_id = ? AND lifecycle IN ('queued', 'running', 'paused') " +
          'ORDER BY created_at ASC, id ASC'
      )
      .all(profileId);
  }

  // Idempotent upsert called by a future RF-03 adapter on every poll.
  //
  // WHY THERE IS NO CAS (`expectedRevision`), unlike `updateProfile`/
  // `associateProfile`: there, revision protects an INTENTIONAL user/planner
  // change against a concurrent write based on previously read stale state.
  // `observeRun` is not change intent; it is an automatic ingestion stream
  // ("I observed this run again and this is roughly its current state") with
  // no prior read the caller must honor. An adapter polling every few seconds
  // cannot track a revision merely to report what it already observed. That
  // would turn a simple heartbeat into a stateful adapter protocol without
  // benefit: no other source can overwrite an observation with concurrent
  // changes to these fields, because only this adapter writes observed
  // lifecycle for that native_id. Revision still increases on every real
  // observation write, but no optimistic check occurs on input.
  function observeRun({ sourceHarness, nativeId, project, lifecycle } = {}) {
    if (typeof sourceHarness !== 'string' || !sourceHarness.trim()) {
      throw fail('VALIDATION', 'sourceHarness is required and cannot be empty');
    }
    if (typeof nativeId !== 'string' || !nativeId.trim()) {
      throw fail('VALIDATION', 'nativeId is required and cannot be empty');
    }
    if (project !== undefined && project !== null && typeof project !== 'string') {
      throw fail('VALIDATION', 'project must be a string, omitted, or null');
    }
    if (lifecycle !== undefined && !LIFECYCLES.has(lifecycle)) {
      throw fail('VALIDATION', 'invalid lifecycle: ' + lifecycle);
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

    // UPDATE does NOT touch profile_id: a new observation cannot undo an
    // existing association. `lifecycle`/`project` update only when supplied;
    // otherwise they retain existing values rather than accidentally being
    // overwritten with 'unknown'/null.
    const newLifecycle = lifecycle === undefined ? existing.lifecycle : lifecycle;
    const newProject = project === undefined ? existing.project : project;

    db.prepare(
      'UPDATE runs SET project = ?, lifecycle = ?, last_observed_at = ?, updated_at = ?, ' +
        'revision = revision + 1 WHERE id = ?'
    ).run(newProject, newLifecycle, ts, ts, id);

    return getRun(id);
  }

  // associateProfile — I24 rule ("one active run per specialist globally"):
  // manual association with a profile already occupied by ANOTHER active run
  // is rejected with 409/CONFLICT rather than forced. This batch provides no
  // "force anyway" parameter.
  function associateProfile(runId, { profileId, expectedRevision } = {}) {
    if (typeof runId !== 'string' || !runId) {
      throw fail('VALIDATION', 'runId is required');
    }
    if (typeof profileId !== 'string' || !profileId) {
      throw fail('VALIDATION', 'profileId is required');
    }
    if (typeof expectedRevision !== 'number' || !Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw fail('VALIDATION', 'expectedRevision is required and must be an integer >= 1');
    }

    const db = getDb();
    db.exec('BEGIN');

    const current = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
    if (!current) {
      db.exec('ROLLBACK');
      throw fail('NOT_FOUND', 'run ' + runId + ' does not exist');
    }
    if (current.revision !== expectedRevision) {
      db.exec('ROLLBACK');
      throw fail(
        'CONFLICT',
        'expected revision (' + expectedRevision + ') does not match current revision (' + current.revision + ')',
        { current }
      );
    }

    const profile = db.prepare('SELECT id FROM agent_profiles WHERE id = ?').get(profileId);
    if (!profile) {
      db.exec('ROLLBACK');
      throw fail('NOT_FOUND', 'profile ' + profileId + ' does not exist');
    }

    // I24: when profileId already has another active run (queued/running/paused)
    // other than runId itself, reject rather than force the association. Return
    // ALL blocking active runs, not only the first (I24: the observer does not
    // hide runs that violate the rule; it preserves evidence and reports conflict).
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
        'profile ' + profileId + ' already has ' + activeRuns.length + ' active run(s) (I24)',
        { activeRuns }
      );
    }

    const ts = now();
    // Reassociation when runId was linked to another profile is allowed while
    // the NEW profile has no other active run, checked above. spec.md does not
    // prohibit reassignment; it only rejects association with an OCCUPIED
    // profile. The decision is documented in the report.
    const result = db
      .prepare('UPDATE runs SET profile_id = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?')
      .run(profileId, ts, runId, expectedRevision);

    if (result.changes !== 1) {
      db.exec('ROLLBACK');
      throw new Error('associateProfile: UPDATE did not affect exactly one row (unexpected state)');
    }

    db.exec('COMMIT');
    return getRun(runId);
  }

  function dissociateProfile(runId, { expectedRevision } = {}) {
    if (typeof runId !== 'string' || !runId) {
      throw fail('VALIDATION', 'runId is required');
    }
    if (typeof expectedRevision !== 'number' || !Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw fail('VALIDATION', 'expectedRevision is required and must be an integer >= 1');
    }

    const db = getDb();
    db.exec('BEGIN');

    const current = db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
    if (!current) {
      db.exec('ROLLBACK');
      throw fail('NOT_FOUND', 'run ' + runId + ' does not exist');
    }
    if (current.revision !== expectedRevision) {
      db.exec('ROLLBACK');
      throw fail(
        'CONFLICT',
        'expected revision (' + expectedRevision + ') does not match current revision (' + current.revision + ')',
        { current }
      );
    }

    const ts = now();
    // Releasing a profile cannot create a conflict, only resolve one, so no
    // I24 check is needed here.
    const result = db
      .prepare('UPDATE runs SET profile_id = NULL, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?')
      .run(ts, runId, expectedRevision);

    if (result.changes !== 1) {
      db.exec('ROLLBACK');
      throw new Error('dissociateProfile: UPDATE did not affect exactly one row (unexpected state)');
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
