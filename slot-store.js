// slot-store.js — CRUD peste `profile_slots` (RF-05c, migrations/004-sloturi.sql),
// injectabil ca `layout.js`. Persistă memoria lui `assignSlots` (world.js)
// între cereri și între restart-uri ale serverului — un specialist nu sare
// din slot doar pentru că serverul a repornit.
//
// Fără efecte secundare la require ȘI la `createSlotStore(options)`: baza de
// date nu se deschide decât lazy, la prima metodă apelată (memoizat) —
// aceeași regulă ca `profiles.js`/`runs.js`/`layout.js`. Handle propriu,
// independent de celelalte store-uri — fiecare modul care deschide un handle
// SQLite răspunde de închiderea lui (lecția RF-02b-b/c), WAL permite ca toate
// să fie deschise simultan pe același fișier.
//
// DE CE NU ARE CAS (`expectedRevision`), spre deosebire de `agent_profiles`/
// `runs`: scrie DOAR serverul însuși, dintr-un singur loc (ruta GET /api/world
// din server.js), niciodată un client extern printr-un API de mutație expus
// — nu există niciun endpoint POST/PUT pe sloturi. Nu există concurs de
// scriere de la doi utilizatori care ar avea nevoie de o verificare
// optimistă: există doar riscul benign ca două cereri HTTP simultane să
// recalculeze aproape simultan din același `previous`, ambele producând un
// rezultat la fel de valid (ca la `observeRun` din runs.js și la `layout.js`
// — un flux automat de recalculare, nu o intenție de schimbare a unui
// utilizator care ar putea fi lovită de o scriere concurentă bazată pe o
// stare veche citită anterior).

const { openDatabase } = require('./db');

function createSlotStore(options = {}) {
  const dbPath = options.dbPath;
  const migrationsDir = options.migrationsDir;
  const now = options.now || (() => Date.now());

  // Memoizare: deschidem baza o singură dată, la prima nevoie reală — ca la
  // `layout.js`, cu handle propriu.
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

  // getSlots() -> Map<project, Map<profileId, slotIndex>>, gol dacă tabela
  // e goală.
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

  // saveSlots(project, assignment) — înlocuiește TOT ce ține baza pentru
  // ACEL proiect, ca să corespundă exact cu `assignment` (spre deosebire de
  // `saveLayout` din layout.js, care înlocuia tot conținutul tabelei —
  // sloturile se recalculează proiect cu proiect la fiecare /api/world,
  // fiecare zonă având propria capacitate). Rândurile din `project` care nu
  // mai apar în `assignment` sunt șterse, restul sunt upsertate, sub o
  // singură tranzacție — ca schimbarea să se vadă atomic.
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
