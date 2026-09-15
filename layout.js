// layout.js — CRUD peste `hex_layout` (RF-05b, migrations/003-layout.sql),
// injectabil ca `profiles.js`/`runs.js`. Persistă memoria lui
// `allocateCells` (hex-layout.js) între cereri și între restart-uri ale
// serverului.
//
// Fără efecte secundare la require ȘI la `createLayoutStore(options)`: baza
// de date nu se deschide decât lazy, la prima metodă apelată (memoizat) —
// aceeași regulă ca `profiles.js`/`runs.js`. Handle propriu, independent de
// `profilesStore`/`runsStore` — fiecare modul care deschide un handle SQLite
// răspunde de închiderea lui (lecția RF-02b-b/c), WAL permite ca toate trei
// să fie deschise simultan pe același fișier.
//
// DE CE NU ARE CAS (`expectedRevision`), spre deosebire de `agent_profiles`/
// `runs`: scrie DOAR serverul însuși, dintr-un singur loc (ruta
// GET /api/world din server.js), niciodată un client extern printr-un API
// de mutație expus — nu există niciun endpoint POST/PUT pe layout. Nu există
// concurs de scriere de la doi utilizatori care ar avea nevoie de o verificare
// optimistă: există doar riscul benign ca două cereri HTTP simultane să
// recalculeze aproape simultan din același `previous`, ambele producând un
// rezultat la fel de valid (ca la `observeRun` din runs.js — un flux automat
// de recalculare, nu o intenție de schimbare a unui utilizator care ar putea
// fi lovită de o scriere concurentă bazată pe o stare veche citită anterior).

const { openDatabase } = require('./db');

function createLayoutStore(options = {}) {
  const dbPath = options.dbPath;
  const migrationsDir = options.migrationsDir;
  const now = options.now || (() => Date.now());

  // Memoizare: deschidem baza o singură dată, la prima nevoie reală — ca la
  // `profiles.js`/`runs.js`, cu handle propriu.
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

  // getLayout() -> Map<project, [{q,r}, ...]>, gol dacă tabela e goală.
  function getLayout() {
    const db = getDb();
    const rows = db.prepare('SELECT project, cells FROM hex_layout').all();
    const layout = new Map();
    for (const row of rows) {
      layout.set(row.project, JSON.parse(row.cells));
    }
    return layout;
  }

  // saveLayout(layoutMap) — înlocuiește TOT conținutul tabelei ca să
  // corespundă exact cu layoutMap: proiectele dispărute din layoutMap sunt
  // șterse din tabelă, cele prezente sunt upsertate, cu revizie incrementată.
  // Totul sub o singură tranzacție — ca schimbarea să se vadă atomic, nu
  // parțial dacă apelul următor citește exact în timp ce se scrie.
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
