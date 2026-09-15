// db.js — deschide baza de date SQLite (node:sqlite) și aplică migrațiile
// versionate din `migrations/`. RF-02a: fundația de stocare, alături de
// `state.js` (nu îl înlocuiește) — vezi docs/handoff/RF-02a-coder.md.
//
// Fără efecte secundare la require (aceeași regulă ca la RF-01/state.js):
// nimic nu se deschide până la apelul explicit al `openDatabase()`. Nicio
// cale de fișier nu e constantă de modul — totul e injectabil prin
// `options`, ca testele să poată folosi `:memory:` sau directoare temporare.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Numele unei migrații: trei cifre + descriere, ex. `001-profiluri.sql`.
const MIGRATION_NAME_RE = /^\d{3}-.+\.sql$/;

function listMigrationFiles(migrationsDir) {
  let entries;
  try {
    entries = fs.readdirSync(migrationsDir);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  // Ordinea numerică a numelui e și ordine alfabetică, fiindcă prefixul e
  // fixat la trei cifre — sortarea de string simplă e suficientă și
  // deterministă. Migrațiile lipsă din mijloc (001, 003 fără 002) nu sunt
  // o eroare: numărul e doar un ordonator stabil, nu o secvență obligatorie
  // fără goluri. Un număr poate fi rezervat sau retras înainte de a fi
  // aplicat oriunde, fără să blocheze restul.
  return entries.filter((name) => MIGRATION_NAME_RE.test(name)).sort();
}

function digestOf(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

// O migrație care își gestionează singură tranzacția (BEGIN/COMMIT/ROLLBACK/
// SAVEPOINT) închide sau perturbă tranzacția exterioară deschisă de
// applyMigrations — un COMMIT din conținut poate face ca schimbările să
// persiste înainte ca eroarea reală (COMMIT-ul din applyMigrations, fără
// tranzacție activă de închis) să fie aruncată, lăsând baza pe jumătate
// migrată deși openDatabase raportează eșec. Respingem înainte de a executa
// orice, pe bază de căutare textuală — nu e un parser SQL, doar eliminăm
// comentariile pe o linie (`-- ...`) ca să reducem fals-pozitivele evidente;
// comentariile pe blocuri și literalele de șir nu sunt tratate special.
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

// Aplică migrațiile neaplicate încă, în ordine, fiecare în tranzacția ei.
// Dacă o migrație deja aplicată are alt digest decât cel înregistrat,
// eșuează zgomotos — fișierul a fost editat după ce a fost aplicat, iar
// baza de pe disc nu mai corespunde cu ce descrie fișierul.
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
          'db.js: migrația "' + file + '" a fost deja aplicată, dar conținutul ei de pe ' +
          'disc nu mai corespunde digestului înregistrat în schema_migrations. Cineva a ' +
          'editat o migrație aplicată — baza de date nu mai corespunde cu fișierele. Nu ' +
          'continuăm automat; corectează fișierul la conținutul original sau adaugă o ' +
          'migrație nouă pentru schimbarea dorită.'
        );
      }
      continue;
    }

    if (hasTransactionControlStatement(content)) {
      throw new Error(
        'db.js: migrația "' + file + '" conține o instrucțiune de control al tranzacției ' +
        '(BEGIN/COMMIT/ROLLBACK/SAVEPOINT). Tranzacția e gestionată automat de applyMigrations ' +
        '— o migrație care o controlează singură poate închide tranzacția la mijloc și lăsa ' +
        'baza pe jumătate migrată deși pornirea raportează eșec. Elimină instrucțiunea din fișier.'
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

  // Dacă orice pas de mai jos (pragme sau migrații) aruncă, handle-ul
  // trebuie închis înainte ca eroarea să se propage — altfel rămâne deschis
  // până la ieșirea procesului. Pe Windows, un fișier deschis nu poate fi
  // șters, deci o pornire eșuată ar lăsa și un fișier blocat. Eroarea
  // originală trebuie să iasă neschimbată; o eventuală eroare la închidere
  // nu are voie s-o mascheze.
  try {
    // Explicit, chiar dacă SQLite îl are deja implicit — nu depindem tacit
    // de un implicit care se poate schimba între versiuni.
    db.exec('PRAGMA foreign_keys = ON');

    if (!isMemory) {
      // WAL n-are sens pe `:memory:` (nu există fișier de jurnal separat de
      // bază); pe fișier, SQLite poate refuza tăcut trecerea la WAL în unele
      // situații (ex. sistem de fișiere fără suport pentru shared memory) —
      // nu tratăm asta ca eroare, doar citim înapoi valoarea reală.
      db.prepare('PRAGMA journal_mode = WAL').get();
    }
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA synchronous = NORMAL');

    applyMigrations(db, migrationsDir, now);
  } catch (e) {
    try {
      db.close();
    } catch (closeErr) {
      // ignorăm — eroarea originală e cea relevantă pentru apelant.
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
