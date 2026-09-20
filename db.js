// db.js — opens the SQLite database (node:sqlite) and applies versioned
// migrations from `migrations/`. RF-02a storage foundation alongside, not in
// place of, `state.js`; see docs/handoff/RF-02a-coder.md.
//
// No side effects on require, following the RF-01/state.js rule: nothing opens
// until `openDatabase()` is explicitly called. No file path is a module
// constant; all paths are injectable through `options` so tests can use
// `:memory:` or temporary directories.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Migration name: three digits plus description, e.g. `001-profiluri.sql`.
const MIGRATION_NAME_RE = /^\d{3}-.+\.sql$/;

function listMigrationFiles(migrationsDir) {
  let entries;
  try {
    entries = fs.readdirSync(migrationsDir);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  // Numeric name order also matches alphabetical order because the prefix is
  // fixed at three digits, making simple string sorting sufficient and
  // deterministic. Missing intermediate migrations (001, 003 without 002)
  // are not errors: the number is only a stable ordering key, not a mandatory
  // gapless sequence. A number may be reserved or withdrawn before being
  // applied anywhere without blocking the rest.
  return entries.filter((name) => MIGRATION_NAME_RE.test(name)).sort();
}

function digestOf(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

// A migration that manages its own transaction (BEGIN/COMMIT/ROLLBACK/
// SAVEPOINT) closes or disrupts the outer transaction opened by
// applyMigrations. An embedded COMMIT can persist changes before the real error
// (applyMigrations COMMIT with no active transaction) is thrown, leaving a
// half-migrated database despite openDatabase reporting failure. Reject before
// execution through text search. This is not a SQL parser; it only removes
// single-line comments (`-- ...`) to reduce obvious false positives. Block
// comments and string literals receive no special handling.
const TRANSACTION_CONTROL_RE = /\b(BEGIN|COMMIT|ROLLBACK|SAVEPOINT)\b/i;

function hasTransactionControlStatement(content) {
  const withoutLineComments = content.replace(/--[^\n]*/g, '');
  return TRANSACTION_CONTROL_RE.test(withoutLineComments);
}

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL,
      digest     TEXT NOT NULL
    )
  `);
}

// Applies pending migrations in order, each in its own transaction. If an
// already applied migration has a different digest from the recorded value,
// fail loudly: the file changed after application and no longer describes the
// on-disk database.
function applyMigrations(db, migrationsDir, now) {
  ensureMigrationsTable(db);

  const files = listMigrationFiles(migrationsDir);
  const appliedRows = db.prepare('SELECT name, digest FROM schema_migrations').all();
  const applied = new Map(appliedRows.map((row) => [row.name, row.digest]));

  const recordApplied = db.prepare(
    'INSERT INTO schema_migrations (name, applied_at, digest) VALUES (?, ?, ?)'
  );

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const digest = digestOf(content);

    if (applied.has(file)) {
      if (applied.get(file) !== digest) {
        throw new Error(
          'db.js: migration "' + file + '" was already applied, but its on-disk content ' +
          'no longer matches the digest recorded in schema_migrations. An applied migration ' +
          'was edited, so the database no longer matches the files. Automatic startup cannot ' +
          'continue; restore the original file content or add a new migration for the change.'
        );
      }
      continue;
    }

    if (hasTransactionControlStatement(content)) {
      throw new Error(
        'db.js: migration "' + file + '" contains a transaction-control statement ' +
        '(BEGIN/COMMIT/ROLLBACK/SAVEPOINT). applyMigrations manages the transaction automatically. ' +
        'A self-managed transaction can close midway and leave the database half-migrated even ' +
        'though startup reports failure. Remove the statement from the file.'
      );
    }

    db.exec('BEGIN');
    try {
      db.exec(content);
      recordApplied.run(file, now(), digest);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

function openDatabase(options = {}) {
  const dbPath = options.path || path.join(__dirname, 'data', 'rpgfactory.db');
  const migrationsDir = options.migrationsDir || MIGRATIONS_DIR;
  const now = options.now || (() => Date.now());
  const isMemory = dbPath === ':memory:';

  if (!isMemory) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  // If any step below (pragmas or migrations) throws, close the handle before
  // propagating the error or it stays open until process exit. On Windows, an
  // open file cannot be deleted, so failed startup would also leave a locked
  // file. The original error must propagate unchanged; a close error must not
  // mask it.
  try {
    // Explicit even though SQLite already defaults to it; do not rely silently
    // on a default that may change between versions.
    db.exec('PRAGMA foreign_keys = ON');

    if (!isMemory) {
      // WAL does not apply to `:memory:` because there is no separate journal
      // file. For a file database, SQLite may silently refuse WAL in some
      // situations (such as a filesystem without shared-memory support). Do
      // not treat that as an error; simply read back the actual value.
      db.prepare('PRAGMA journal_mode = WAL').get();
    }
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA synchronous = NORMAL');

    applyMigrations(db, migrationsDir, now);
  } catch (e) {
    try {
      db.close();
    } catch (closeErr) {
      // Ignore it; the original error is what matters to the caller.
    }
    throw e;
  }

  function appliedMigrations() {
    const rows = db.prepare('SELECT name FROM schema_migrations ORDER BY name ASC').all();
    return rows.map((row) => row.name);
  }

  function close() {
    db.close();
  }

  return { db, close, appliedMigrations };
}

module.exports = { openDatabase, MIGRATIONS_DIR };
