// slot-store.js — CRUD over `profile_slots` (RF-05c,
// migrations/004-sloturi.sql), injectable like `layout.js`. Persists
// `assignSlots` memory (world.js) across requests and server restarts so a
// specialist does not change slots merely because the server restarted.
//
// No side effects on require OR `createSlotStore(options)`: the database opens
// lazily on the first method call and is memoized, following the same rule as
// `profiles.js`/`runs.js`/`layout.js`. It owns a handle independent from other
// stores; each module that opens a SQLite handle is responsible for closing it
// (RF-02b-b/c), and WAL permits all handles to remain open on the same file.
//
// WHY THERE IS NO CAS (`expectedRevision`), unlike `agent_profiles`/`runs`:
// only the server writes this data, from one place (GET /api/world in
// server.js), never an external client through an exposed mutation API. There
// is no POST/PUT endpoint for slots. No two-user write race requires an
// optimistic check. The only risk is benign: two simultaneous HTTP requests
// may recalculate from the same `previous` value at almost the same time and
// both produce equally valid results, as with `observeRun` in runs.js and
// `layout.js`. This is an automatic recalculation stream, not a user's change
// intent vulnerable to a concurrent write based on previously read stale state.

const { openDatabase } = require('./db');

function createSlotStore(options = {}) {
  const dbPath = options.dbPath;
  const migrationsDir = options.migrationsDir;
  const now = options.now || (() => Date.now());

  // Memoize the database opened on first real use, like layout.js, while
  // retaining an independently owned handle.
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

  // getSlots() -> Map<project, Map<profileId, slotIndex>>, empty when the
  // table is empty.
  function getSlots() {
    const db = getDb();
    const rows = db.prepare('SELECT profile_id, project, slot_index FROM profile_slots').all();
    const byProject = new Map();
    for (const row of rows) {
      if (!byProject.has(row.project)) byProject.set(row.project, new Map());
      byProject.get(row.project).set(row.profile_id, row.slot_index);
    }
    return byProject;
  }

  // saveSlots(project, assignment) replaces EVERYTHING stored for THAT
  // project so it exactly matches `assignment`. Unlike saveLayout in
  // layout.js, which replaces all table content, slots are recalculated one
  // project at a time on every /api/world request because each zone has its
  // own capacity. Rows in `project` absent from `assignment` are deleted and
  // the rest are upserted in one transaction so the change is visible atomically.
  function saveSlots(project, assignment) {
    const db = getDb();
    const ts = now();

    db.exec('BEGIN');
    try {
      const existingRows = db
        .prepare('SELECT profile_id, revision FROM profile_slots WHERE project = ?')
        .all(project);
      const existingRevisions = new Map(existingRows.map((row) => [row.profile_id, row.revision]));

      const keepProfileIds = Array.from(assignment.keys());
      const toDelete = existingRows
        .map((row) => row.profile_id)
        .filter((profileId) => !assignment.has(profileId));

      if (toDelete.length) {
        const del = db.prepare('DELETE FROM profile_slots WHERE profile_id = ?');
        for (const profileId of toDelete) del.run(profileId);
      }

      const upsert = db.prepare(
        'INSERT INTO profile_slots (profile_id, project, slot_index, updated_at, revision) ' +
          'VALUES (?, ?, ?, ?, ?) ' +
          'ON CONFLICT(profile_id) DO UPDATE SET project = excluded.project, ' +
          'slot_index = excluded.slot_index, updated_at = excluded.updated_at, ' +
          'revision = excluded.revision'
      );
      for (const profileId of keepProfileIds) {
        const slotIndex = assignment.get(profileId);
        const nextRevision = (existingRevisions.get(profileId) || 0) + 1;
        upsert.run(profileId, project, slotIndex, ts, nextRevision);
      }

      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  return { getSlots, saveSlots, close };
}

module.exports = { createSlotStore };
