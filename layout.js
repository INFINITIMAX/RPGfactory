// layout.js — CRUD over `hex_layout` (RF-05b, migrations/003-layout.sql),
// injectable like `profiles.js`/`runs.js`. Persists `allocateCells` memory
// (hex-layout.js) across requests and server restarts.
//
// No side effects on require OR `createLayoutStore(options)`: the database is
// opened lazily on the first method call and memoized, following the same rule
// as `profiles.js`/`runs.js`. It owns a handle independent from
// `profilesStore`/`runsStore`; each module that opens a SQLite handle is
// responsible for closing it (RF-02b-b/c), and WAL permits all three handles
// to remain open on the same file simultaneously.
//
// WHY THERE IS NO CAS (`expectedRevision`), unlike `agent_profiles`/`runs`:
// only the server writes this data, from one place (GET /api/world in
// server.js), never an external client through an exposed mutation API. There
// is no POST/PUT endpoint for layout. No two-user write race requires an
// optimistic check. The only risk is benign: two simultaneous HTTP requests
// may recalculate from the same `previous` value at almost the same time and
// both produce equally valid results, as with `observeRun` in runs.js. This is
// an automatic recalculation stream, not a user's change intent vulnerable to
// a concurrent write based on previously read stale state.

const { openDatabase } = require('./db');

function createLayoutStore(options = {}) {
  const dbPath = options.dbPath;
  const migrationsDir = options.migrationsDir;
  const now = options.now || (() => Date.now());

  // Memoize the database opened on first real use, like profiles.js/runs.js,
  // while retaining an independently owned handle.
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

  // getLayout() -> Map<project, [{q,r}, ...]>, empty when the table is empty.
  function getLayout() {
    const db = getDb();
    const rows = db.prepare('SELECT project, cells FROM hex_layout').all();
    const layout = new Map();
    for (const row of rows) {
      layout.set(row.project, JSON.parse(row.cells));
    }
    return layout;
  }

  // saveLayout(layoutMap) replaces ALL table content to exactly match
  // layoutMap. Projects absent from layoutMap are deleted; present projects
  // are upserted with incremented revisions. A single transaction makes the
  // change visible atomically rather than partially if the next read occurs
  // during the write.
  function saveLayout(layoutMap) {
    const db = getDb();
    const ts = now();

    db.exec('BEGIN');
    try {
      const existingRows = db.prepare('SELECT project, revision FROM hex_layout').all();
      const existingRevisions = new Map(existingRows.map((row) => [row.project, row.revision]));

      const keepProjects = Array.from(layoutMap.keys());
      const toDelete = existingRows
        .map((row) => row.project)
        .filter((project) => !layoutMap.has(project));

      if (toDelete.length) {
        const del = db.prepare('DELETE FROM hex_layout WHERE project = ?');
        for (const project of toDelete) del.run(project);
      }

      const upsert = db.prepare(
        'INSERT INTO hex_layout (project, cells, updated_at, revision) VALUES (?, ?, ?, ?) ' +
          'ON CONFLICT(project) DO UPDATE SET cells = excluded.cells, updated_at = excluded.updated_at, ' +
          'revision = excluded.revision'
      );
      for (const project of keepProjects) {
        const cells = layoutMap.get(project);
        const nextRevision = (existingRevisions.get(project) || 0) + 1;
        upsert.run(project, JSON.stringify(cells), ts, nextRevision);
      }

      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  return { getLayout, saveLayout, close };
}

module.exports = { createLayoutStore };
