// Teste pentru db.js și migrations/001-profiluri.sql (RF-02a).
//
// Oracolul planner-ului (7/7 sonde) a confirmat deja mecanica de bază —
// deschidere, aplicare migrații, pragme, FK. Nu redescoperim asta aici; ne
// concentrăm pe fixarea ei durabilă în suită, plus ce oracolul nu a putut
// acoperi: persistența reală peste close/reopen (coloane obligatorii ale
// schemei), verificarea optimistă pe `revision`, cele două capcane din §2.3
// ale brief-ului (nume de migrație ignorate tăcut, tranzacții imbricate) și
// constrângerile reale ale schemei din 001-profiluri.sql.
//
// Fiecare test își face propriul director/fișier temporar sau `:memory:` —
// zero stare împărtășită, zero dependență de ordine (vezi C2 din raportul
// reviewer-ului RF-01 pentru test/state.test.mjs — nu repetăm greșeala aici).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { openDatabase, MIGRATIONS_DIR } = require('../db.js');

// -----------------------------------------------------------------------
// Utilitare — fiecare test își cere propriul director, niciodată partajat.
// -----------------------------------------------------------------------

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-'));
}

// Creează un director de migrații sintetic cu conținutul dat.
// `files` e un obiect { 'numefisier.sql': 'conținut SQL' }.
function makeMigrationsDir(files) {
  const dir = tmpDir('rf02a-migrations');
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content, 'utf8');
  }
  return dir;
}

// Un director propriu pentru fișierul de bază (WAL lasă .db-wal/.db-shm
// lângă el — curățăm tot directorul, nu doar fișierul).
function makeDbPath() {
  const dir = tmpDir('rf02a-db');
  return path.join(dir, 'test.db');
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function dirOf(filePath) {
  return path.dirname(filePath);
}

// =========================================================================
// 2.1 — Contractul openDatabase
// =========================================================================

test('2.1 MIGRATIONS_DIR exportat e path.join(__dirname, "migrations") — pin al implicitului', () => {
  // Nu deschidem nicio bază aici (nu atingem data/) — verificăm doar
  // constanta exportată, care e folosită ca implicit pentru migrationsDir.
  assert.ok(MIGRATIONS_DIR.endsWith(path.join('RPGfactory', 'migrations')) || MIGRATIONS_DIR.endsWith(path.sep + 'migrations'));
  assert.ok(path.isAbsolute(MIGRATIONS_DIR), 'MIGRATIONS_DIR trebuie să fie o cale absolută');
});

test('2.1 opțiunea `now` implicită produce un applied_at plauzibil (aproape de Date.now())', () => {
  const migrationsDir = makeMigrationsDir({ '001-a.sql': 'CREATE TABLE a(x INTEGER);' });
  const dbPath = makeDbPath();
  const before = Date.now();
  const { db, close } = openDatabase({ path: dbPath, migrationsDir });
  try {
    const row = db.prepare('SELECT applied_at FROM schema_migrations WHERE name = ?').get('001-a.sql');
    const after = Date.now();
    assert.equal(typeof row.applied_at, 'number');
    assert.ok(row.applied_at >= before && row.applied_at <= after, `applied_at (${row.applied_at}) ar trebui să fie între ${before} și ${after} — implicitul e Date.now()`);
  } finally {
    close();
    rmrf(dirOf(dbPath));
    rmrf(migrationsDir);
  }
});

test('2.1 opțiunea `now` injectată e folosită exact, nu Date.now()', () => {
  const migrationsDir = makeMigrationsDir({ '001-a.sql': 'CREATE TABLE a(x INTEGER);' });
  const dbPath = makeDbPath();
  const { db, close } = openDatabase({ path: dbPath, migrationsDir, now: () => 424242 });
  try {
    const row = db.prepare('SELECT applied_at FROM schema_migrations WHERE name = ?').get('001-a.sql');
    assert.equal(row.applied_at, 424242);
  } finally {
    close();
    rmrf(dirOf(dbPath));
    rmrf(migrationsDir);
  }
});

test('2.1 appliedMigrations() întoarce numele în ordine crescătoare', () => {
  const migrationsDir = makeMigrationsDir({
    '003-c.sql': 'CREATE TABLE c(x INTEGER);',
    '001-a.sql': 'CREATE TABLE a(x INTEGER);',
    '002-b.sql': 'CREATE TABLE b(x INTEGER);',
  });
  const { close, appliedMigrations } = openDatabase({ path: ':memory:', migrationsDir });
  try {
    assert.deepEqual(appliedMigrations(), ['001-a.sql', '002-b.sql', '003-c.sql']);
  } finally {
    close();
    rmrf(migrationsDir);
  }
});

test('2.1 close() chiar închide — o interogare după close() eșuează', () => {
  const migrationsDir = makeMigrationsDir({});
  const { db, close } = openDatabase({ path: ':memory:', migrationsDir });
  close();
  assert.throws(() => db.prepare('SELECT 1').get());
  rmrf(migrationsDir);
});

test('2.1 handle-ul db expus e utilizabil direct pentru interogări', () => {
  const migrationsDir = makeMigrationsDir({});
  const { db, close } = openDatabase({ path: ':memory:', migrationsDir });
  try {
    const row = db.prepare('SELECT 1 AS x').get();
    assert.equal(row.x, 1);
  } finally {
    close();
    rmrf(migrationsDir);
  }
});

// =========================================================================
// 2.2 — Mecanica migrațiilor (directoare sintetice, nu 001-profiluri.sql real)
// =========================================================================

test('2.2 ordinea de aplicare e numerică, indiferent de ordinea de creare pe disc', () => {
  const migrationsDir = makeMigrationsDir({
    '003-c.sql': 'CREATE TABLE c(x INTEGER);',
    '001-a.sql': 'CREATE TABLE a(x INTEGER);',
    '002-b.sql': 'CREATE TABLE b(x INTEGER);',
  });
  const { db, close, appliedMigrations } = openDatabase({ path: ':memory:', migrationsDir });
  try {
    assert.deepEqual(appliedMigrations(), ['001-a.sql', '002-b.sql', '003-c.sql']);
    // dovada reală, nu doar numele: tabelele există în ordinea corectă.
    for (const t of ['a', 'b', 'c']) {
      assert.doesNotThrow(() => db.prepare(`SELECT * FROM ${t}`).all());
    }
  } finally {
    close();
    rmrf(migrationsDir);
  }
});

test('2.2 a doua deschidere nu reaplică nimic — schema_migrations are exact un rând per migrație', () => {
  const migrationsDir = makeMigrationsDir({ '001-a.sql': 'CREATE TABLE a(x INTEGER);' });
  const dbPath = makeDbPath();
  const first = openDatabase({ path: dbPath, migrationsDir });
  first.close();

  const second = openDatabase({ path: dbPath, migrationsDir });
  try {
    assert.deepEqual(second.appliedMigrations(), ['001-a.sql']);
    const count = second.db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n;
    assert.equal(count, 1, 'nu trebuie să existe un al doilea rând pentru aceeași migrație după a doua deschidere');
  } finally {
    second.close();
    rmrf(dirOf(dbPath));
    rmrf(migrationsDir);
  }
});

test('2.2 digest schimbat pe o migrație aplicată deja aruncă, cu mesaj care numește fișierul', () => {
  const migrationsDir = makeMigrationsDir({ '001-a.sql': 'CREATE TABLE a(x INTEGER);' });
  const dbPath = makeDbPath();
  const first = openDatabase({ path: dbPath, migrationsDir });
  first.close();

  // editare reală a fișierului după aplicare — alt conținut de octeți, nu
  // doar alt obiect JS.
  fs.writeFileSync(path.join(migrationsDir, '001-a.sql'), 'CREATE TABLE a(x INTEGER, y INTEGER);', 'utf8');

  assert.throws(
    () => openDatabase({ path: dbPath, migrationsDir }),
    (err) => err instanceof Error && err.message.includes('001-a.sql'),
    'eroarea trebuie să numească explicit fișierul editat'
  );

  rmrf(dirOf(dbPath));
  rmrf(migrationsDir);
});

test('2.2 digest neschimbat: o migrație aplicată, necitită greșit, nu produce fals pozitiv la redeschidere', () => {
  const content = 'CREATE TABLE a(x INTEGER);';
  const migrationsDir = makeMigrationsDir({ '001-a.sql': content });
  const dbPath = makeDbPath();
  const first = openDatabase({ path: dbPath, migrationsDir });
  first.close();

  // rescriem fișierul cu EXACT același conținut (simulează un checkout /
  // re-generare care nu schimbă octeții) — nu trebuie să declanșeze eroarea
  // de digest schimbat de mai sus.
  fs.writeFileSync(path.join(migrationsDir, '001-a.sql'), content, 'utf8');

  assert.doesNotThrow(() => {
    const second = openDatabase({ path: dbPath, migrationsDir });
    assert.deepEqual(second.appliedMigrations(), ['001-a.sql']);
    second.close();
  });

  rmrf(dirOf(dbPath));
  rmrf(migrationsDir);
});

test('2.2 eșec la mijloc: rollback complet, nici tabelele create înainte de instrucțiunea care crapă nu rămân', () => {
  // A doua instrucțiune crapă (tabel duplicat) — dacă rollback-ul nu e
  // complet, `ok_table` ar rămâne pe disc chiar dacă migrația a "eșuat".
  const migrationsDir = makeMigrationsDir({
    '001-fail.sql': 'CREATE TABLE ok_table(x INTEGER);\nCREATE TABLE ok_table(x INTEGER);',
  });
  const dbPath = makeDbPath();

  assert.throws(() => openDatabase({ path: dbPath, migrationsDir }));

  // openDatabase a aruncat înainte să întoarcă handle-ul — verificăm starea
  // reală de pe disc cu o conexiune brută, independentă.
  const raw = new DatabaseSync(dbPath);
  try {
    const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
    assert.ok(!tables.includes('ok_table'), 'ok_table nu trebuie să existe — rollback trebuia să anuleze și prima instrucțiune reușită');
    const migRows = raw.prepare('SELECT * FROM schema_migrations').all();
    assert.equal(migRows.length, 0, 'nu trebuie să existe niciun rând pentru migrația eșuată');
  } finally {
    raw.close();
    rmrf(dirOf(dbPath));
    rmrf(migrationsDir);
  }
});

test('2.2 eșec parțial + reluare: după ce repari migrația stricată, redeschiderea o aplică corect', () => {
  const migrationsDir = makeMigrationsDir({
    '001-fail.sql': 'CREATE TABLE ok_table(x INTEGER);\nCREATE TABLE ok_table(x INTEGER);',
  });
  const dbPath = makeDbPath();

  assert.throws(() => openDatabase({ path: dbPath, migrationsDir }));

  // reparăm fișierul (același nume — nu era încă înregistrat ca aplicat,
  // deci nu declanșează verificarea de digest schimbat).
  fs.writeFileSync(path.join(migrationsDir, '001-fail.sql'), 'CREATE TABLE ok_table(x INTEGER);', 'utf8');

  const { db, close, appliedMigrations } = openDatabase({ path: dbPath, migrationsDir });
  try {
    assert.deepEqual(appliedMigrations(), ['001-fail.sql']);
    assert.doesNotThrow(() => db.prepare('SELECT * FROM ok_table').all());
  } finally {
    close();
    rmrf(dirOf(dbPath));
    rmrf(migrationsDir);
  }
});

test('2.2 numere lipsă (001 și 003, fără 002): se aplică ambele, fără eroare — decizie deliberată a coder-ului', () => {
  const migrationsDir = makeMigrationsDir({
    '001-a.sql': 'CREATE TABLE a(x INTEGER);',
    '003-c.sql': 'CREATE TABLE c(x INTEGER);',
  });
  const { close, appliedMigrations } = openDatabase({ path: ':memory:', migrationsDir });
  try {
    assert.deepEqual(appliedMigrations(), ['001-a.sql', '003-c.sql']);
  } finally {
    close();
    rmrf(migrationsDir);
  }
});

test('2.2 migrationsDir inexistent: zero migrații, fără excepție', () => {
  const parent = tmpDir('rf02a-parent');
  const doesNotExist = path.join(parent, 'nu-exista');
  const { close, appliedMigrations } = openDatabase({ path: ':memory:', migrationsDir: doesNotExist });
  try {
    assert.deepEqual(appliedMigrations(), []);
  } finally {
    close();
    rmrf(parent);
  }
});

test('2.2 director de migrații gol: zero migrații, fără excepție', () => {
  const migrationsDir = makeMigrationsDir({});
  const { close, appliedMigrations } = openDatabase({ path: ':memory:', migrationsDir });
  try {
    assert.deepEqual(appliedMigrations(), []);
  } finally {
    close();
    rmrf(migrationsDir);
  }
});

// =========================================================================
// 2.3 — Capcana 1: fișiere ignorate tăcut din cauza regexului de nume
// =========================================================================

test('2.3 nume care nu se potrivesc regexului (1-x.sql, 001_x.sql, 001-x.SQL) sunt ignorate tăcut', () => {
  const migrationsDir = makeMigrationsDir({
    '1-profiluri.sql': 'CREATE TABLE should_not_exist_1(x INTEGER);',
    '001_profiluri.sql': 'CREATE TABLE should_not_exist_2(x INTEGER);',
    '001-profiluri.SQL': 'CREATE TABLE should_not_exist_3(x INTEGER);',
  });
  const { db, close, appliedMigrations } = openDatabase({ path: ':memory:', migrationsDir });
  try {
    // Pinuim comportamentul EFECTIV: niciuna nu e aplicată, fără avertisment
    // sau eroare. Dacă cineva crede că ar trebui să facă zgomot în loc să
    // tacă — vezi raportul tester-ului, nu s-a schimbat codul aici.
    assert.deepEqual(appliedMigrations(), []);
    for (const t of ['should_not_exist_1', 'should_not_exist_2', 'should_not_exist_3']) {
      assert.throws(() => db.prepare(`SELECT * FROM ${t}`).all(), `tabelul ${t} nu trebuie să existe — fișierul a fost sărit, nu aplicat`);
    }
  } finally {
    close();
    rmrf(migrationsDir);
  }
});

// =========================================================================
// 2.3 — Capcana 2: tranzacții imbricate în conținutul unei migrații
// =========================================================================

// RF-02a-d: după reparația defectului 3 (RF-02a-b), `hasTransactionControlStatement`
// respinge migrația ÎNAINTE de `db.exec('BEGIN')` (db.js, applyMigrations,
// liniile 99-106) de îndată ce conținutul conține BEGIN/COMMIT/ROLLBACK/
// SAVEPOINT — indiferent de cuvântul cheie, nimic din conținut nu ajunge
// vreodată să se execute. Cele patru cazuri au devenit structural identice
// (verificare textuală, respingere curată, zero efecte pe disc), de-asta le
// fuzionăm într-un singur test parametrizat în loc de patru aproape
// duplicate — un test separat per cuvânt cheie n-ar adăuga acoperire reală
// peste bucla de mai jos, doar zgomot.
//
// Vechiul test de la această poziție (BEGIN) pinuia deja respingerea curată.
// Vechiul test pentru COMMIT pinuia o INCONSISTENȚĂ (openDatabase arunca, dar
// tabelul și rândul din schema_migrations rămâneau pe disc) — asta descria
// comportamentul dinaintea reparației stricte din RF-02a-b. Reparația aleasă
// de coder respinge migrația înainte de orice execuție, deci inconsistența
// pinuită acolo nu mai există: acum COMMIT se comportă identic cu BEGIN, un
// caz normal de respingere curată. Testul de mai jos verifică asta pentru
// toate cele patru cuvinte cheie, inclusiv ROLLBACK și SAVEPOINT, care nu
// aveau niciun test dedicat deși brief-ul RF-02a-b cerea respingerea lor pe
// toate patru.
for (const [keyword, content, tableName] of [
  ['BEGIN', 'BEGIN;\nCREATE TABLE nested_begin(x INTEGER);', 'nested_begin'],
  ['COMMIT', 'CREATE TABLE nested_commit(x INTEGER);\nCOMMIT;', 'nested_commit'],
  ['ROLLBACK', 'CREATE TABLE nested_rollback(x INTEGER);\nROLLBACK;', 'nested_rollback'],
  ['SAVEPOINT', 'SAVEPOINT sp1;\nCREATE TABLE nested_savepoint(x INTEGER);', 'nested_savepoint'],
]) {
  test(`2.3 migrație cu propriul ${keyword} în conținut: respinsă curat înainte de orice execuție, nimic nu persistă`, () => {
    const migrationsDir = makeMigrationsDir({ '001-nested.sql': content });
    const dbPath = makeDbPath();

    assert.throws(
      () => openDatabase({ path: dbPath, migrationsDir }),
      undefined,
      `openDatabase trebuie să arunce pentru o migrație cu ${keyword} propriu`
    );

    const raw = new DatabaseSync(dbPath);
    try {
      const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
      assert.ok(
        !tables.includes(tableName),
        `${keyword} imbricat trebuie să oprească execuția înainte de CREATE TABLE — tabelul ${tableName} nu trebuie să existe`
      );
      const migRows = raw.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name);
      assert.ok(
        !migRows.includes('001-nested.sql'),
        `migrația respinsă din cauza ${keyword} nu trebuie înregistrată în schema_migrations`
      );
    } finally {
      raw.close();
      rmrf(dirOf(dbPath));
      rmrf(migrationsDir);
    }
  });
}

// =========================================================================
// 2.4 — Schema: constrângerile chiar sunt impuse? (folosim migrația reală)
// =========================================================================

function baseProfile(overrides = {}) {
  return Object.assign(
    {
      id: 'p1',
      name: 'Profil test',
      approval_state: 'proposed',
      assignable: 0,
      created_at: 1000,
      updated_at: 1000,
      revision: 1,
    },
    overrides
  );
}

function insertProfile(db, p) {
  return db
    .prepare(
      `INSERT INTO agent_profiles (id, name, approval_state, assignable, created_at, updated_at, revision)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(p.id, p.name, p.approval_state, p.assignable, p.created_at, p.updated_at, p.revision);
}

function openRealSchema(now) {
  // migrationsDir implicit (real, doar citit) + bază :memory: — nu atingem
  // data/ și nu modificăm migrations/**.
  return openDatabase({ path: ':memory:', now: now || (() => 1000) });
}

test('2.4 approval_state acceptă doar proposed/approved — orice altceva eșuează', () => {
  const { db, close } = openRealSchema();
  try {
    assert.doesNotThrow(() => insertProfile(db, baseProfile({ id: 'ok1', approval_state: 'proposed' })));
    assert.doesNotThrow(() => insertProfile(db, baseProfile({ id: 'ok2', approval_state: 'approved' })));
    assert.throws(() => insertProfile(db, baseProfile({ id: 'bad', approval_state: 'rejected' })));
  } finally {
    close();
  }
});

test('2.4 assignable acceptă doar 0 și 1', () => {
  const { db, close } = openRealSchema();
  try {
    assert.doesNotThrow(() => insertProfile(db, baseProfile({ id: 'ok1', assignable: 0 })));
    assert.doesNotThrow(() => insertProfile(db, baseProfile({ id: 'ok2', assignable: 1 })));
    assert.throws(() => insertProfile(db, baseProfile({ id: 'bad', assignable: 2 })));
  } finally {
    close();
  }
});

test('2.4 NOT NULL pe id, name, created_at, updated_at (fără default) — omiterea coloanei eșuează', () => {
  const { db, close } = openRealSchema();
  try {
    assert.throws(() => db.prepare(
      `INSERT INTO agent_profiles (name, approval_state, assignable, created_at, updated_at, revision)
       VALUES (?, 'proposed', 0, 1, 1, 1)`
    ).run('fără id'), 'id lipsă trebuie respins');

    assert.throws(() => db.prepare(
      `INSERT INTO agent_profiles (id, approval_state, assignable, created_at, updated_at, revision)
       VALUES ('x1', 'proposed', 0, 1, 1, 1)`
    ).run(), 'name lipsă trebuie respins');

    assert.throws(() => db.prepare(
      `INSERT INTO agent_profiles (id, name, approval_state, assignable, updated_at, revision)
       VALUES ('x2', 'n', 'proposed', 0, 1, 1)`
    ).run(), 'created_at lipsă trebuie respins');

    assert.throws(() => db.prepare(
      `INSERT INTO agent_profiles (id, name, approval_state, assignable, created_at, revision)
       VALUES ('x3', 'n', 'proposed', 0, 1, 1)`
    ).run(), 'updated_at lipsă trebuie respins');
  } finally {
    close();
  }
});

test('2.4 NOT NULL pe revision — NULL explicit eșuează (are DEFAULT, deci omiterea coloanei NU e testul relevant)', () => {
  const { db, close } = openRealSchema();
  try {
    // omiterea coloanei revision e validă — DEFAULT 1 se aplică.
    assert.doesNotThrow(() =>
      db.prepare(
        `INSERT INTO agent_profiles (id, name, approval_state, assignable, created_at, updated_at)
         VALUES ('has-default', 'n', 'proposed', 0, 1, 1)`
      ).run()
    );
    const row = db.prepare('SELECT revision FROM agent_profiles WHERE id = ?').get('has-default');
    assert.equal(row.revision, 1);

    // dar NULL explicit trebuie respins de NOT NULL.
    assert.throws(() =>
      db.prepare(
        `INSERT INTO agent_profiles (id, name, approval_state, assignable, created_at, updated_at, revision)
         VALUES ('null-revision', 'n', 'proposed', 0, 1, 1, NULL)`
      ).run()
    );
  } finally {
    close();
  }
});

test('2.4 configuration_versions.profile_id → agent_profiles(id): profil inexistent respins de FK', () => {
  const { db, close } = openRealSchema();
  try {
    assert.throws(() =>
      db.prepare(
        `INSERT INTO configuration_versions (id, profile_id, harness, provider, model, created_at)
         VALUES ('cv1', 'nu-exista', 'claude-code', 'anthropic', 'sonnet', 1)`
      ).run()
    );
  } finally {
    close();
  }
});

test('2.4 profile_history.profile_id → agent_profiles(id): profil inexistent respins de FK', () => {
  const { db, close } = openRealSchema();
  try {
    assert.throws(() =>
      db.prepare(
        `INSERT INTO profile_history (profile_id, changed_at, field, old_value, new_value)
         VALUES ('nu-exista', 1, 'name', 'a', 'b')`
      ).run()
    );
  } finally {
    close();
  }
});

test('2.4 NOT NULL pe configuration_versions.id — coloană omisă sau NULL explicit sunt respinse (defectul 2, verificat simetric cu agent_profiles.id)', () => {
  // `TEXT PRIMARY KEY` acceptă NULL în SQLite dacă nu are și NOT NULL
  // explicit — cheia primară singură NU garantează unicitate/prezență între
  // valorile NULL. Ăsta a fost exact defectul 2, scăpat neobservat prima
  // dată pe agent_profiles.id (vezi testul de la linia ~454) — și rămas
  // nereparat pe configuration_versions.id la primul tur de reparații
  // (RF-02a-b a acoperit doar coloana observată, nu și pe asta). Dacă
  // migrația nu mai are `NOT NULL` pe id aici, ambele inserturi de mai jos
  // ar reuși (cu id = NULL în tabel) — exact ce ar face acest test să cadă.
  const { db, close } = openRealSchema();
  try {
    insertProfile(db, baseProfile({ id: 'p1' }));

    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO configuration_versions (profile_id, harness, provider, model, created_at)
             VALUES ('p1', 'claude-code', 'anthropic', 'sonnet', 1)`
          )
          .run(),
      'coloana id omisă complet trebuie respinsă de NOT NULL'
    );

    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO configuration_versions (id, profile_id, harness, provider, model, created_at)
             VALUES (NULL, 'p1', 'claude-code', 'anthropic', 'sonnet', 1)`
          )
          .run(),
      'id = NULL explicit trebuie respins de NOT NULL'
    );

    // dovada colaterală: niciun rând nu a intrat, indiferent de formă.
    const count = db.prepare('SELECT COUNT(*) AS n FROM configuration_versions').get().n;
    assert.equal(count, 0, 'niciun rând cu id absent nu trebuie să fi rămas în tabel');
  } finally {
    close();
  }
});

test('2.2 defectul 1: după ce openDatabase aruncă (digest schimbat), fișierul bazei poate fi șters imediat — handle-ul intern nu a rămas deschis', () => {
  // Testele existente de la eșec-la-mijloc (liniile ~219, ~244) deschid o
  // conexiune BRUTĂ nouă (`new DatabaseSync`) după eșec și fac cleanup cu
  // `rmrf(..., { force: true })` pe director — `force` ignoră doar ENOENT,
  // nu EPERM/EBUSY, deci un handle scurs le-ar fi picat oricum, dar
  // indirect, ca eroare de cleanup în `finally`, fără mesaj care să
  // identifice cauza. Aici verificăm explicit și cu mesaj clar: ștergerea
  // DIRECTĂ a fișierului (`fs.unlinkSync`, nu `rmSync` recursiv cu force)
  // imediat după ce openDatabase a aruncat trebuie să reușească — pe
  // Windows, un handle SQLite rămas deschis blochează exact această
  // operație cu EPERM/EBUSY. Dacă `db.close()` din catch-ul lui
  // `openDatabase` (db.js, liniile 154-159) ar fi omis sau ar rula după ce
  // eroarea deja a ieșit, acest test ar cădea aici, nu în cleanup.
  const migrationsDir = makeMigrationsDir({ '001-a.sql': 'CREATE TABLE a(x INTEGER);' });
  const dbPath = makeDbPath();
  const first = openDatabase({ path: dbPath, migrationsDir });
  first.close();

  fs.writeFileSync(path.join(migrationsDir, '001-a.sql'), 'CREATE TABLE a(x INTEGER, y INTEGER);', 'utf8');

  assert.throws(() => openDatabase({ path: dbPath, migrationsDir }));

  assert.doesNotThrow(
    () => fs.unlinkSync(dbPath),
    'ștergerea directă a fișierului bazei imediat după eșec trebuie să reușească — handle-ul intern trebuie închis înainte ca eroarea să iasă din openDatabase'
  );

  rmrf(dirOf(dbPath));
  rmrf(migrationsDir);
});

test('2.4 id duplicat pe agent_profiles eșuează (cheie primară)', () => {
  const { db, close } = openRealSchema();
  try {
    insertProfile(db, baseProfile({ id: 'dup' }));
    assert.throws(() => insertProfile(db, baseProfile({ id: 'dup', name: 'alt nume' })));
  } finally {
    close();
  }
});

// =========================================================================
// 2.5 — Contracte de pinuit (decizii ale coder-ului)
// =========================================================================

test('2.5 assignable implicit e 0 și approval_state implicit e "proposed"', () => {
  const { db, close } = openRealSchema();
  try {
    db.prepare(
      `INSERT INTO agent_profiles (id, name, created_at, updated_at) VALUES ('def', 'n', 1, 1)`
    ).run();
    const row = db.prepare('SELECT assignable, approval_state, revision FROM agent_profiles WHERE id = ?').get('def');
    assert.equal(row.assignable, 0, 'un profil nou nu trebuie să fie eligibil pentru taskuri implicit');
    assert.equal(row.approval_state, 'proposed', 'un profil nou trebuie să pornească propus, nu aprobat');
    assert.equal(row.revision, 1, 'revizia implicită trebuie să fie 1');
  } finally {
    close();
  }
});

test('2.5 ștergerea unui profil cu configurații legate e blocată de FK (fără ON DELETE CASCADE)', () => {
  const { db, close } = openRealSchema();
  try {
    insertProfile(db, baseProfile({ id: 'p1' }));
    db.prepare(
      `INSERT INTO configuration_versions (id, profile_id, harness, provider, model, created_at)
       VALUES ('cv1', 'p1', 'claude-code', 'anthropic', 'sonnet', 1)`
    ).run();
    assert.throws(() => db.prepare('DELETE FROM agent_profiles WHERE id = ?').run('p1'), 'ștergerea trebuie respinsă cât timp există configurații legate');
    // profilul chiar a rămas pe loc.
    const row = db.prepare('SELECT id FROM agent_profiles WHERE id = ?').get('p1');
    assert.ok(row);
  } finally {
    close();
  }
});

test('2.5 ștergerea unui profil cu istoric legat e blocată de FK', () => {
  const { db, close } = openRealSchema();
  try {
    insertProfile(db, baseProfile({ id: 'p1' }));
    db.prepare(
      `INSERT INTO profile_history (profile_id, changed_at, field, old_value, new_value)
       VALUES ('p1', 1, 'name', 'a', 'b')`
    ).run();
    assert.throws(() => db.prepare('DELETE FROM agent_profiles WHERE id = ?').run('p1'));
  } finally {
    close();
  }
});

test('2.5 profile_history nu e protejat de constrângeri împotriva UPDATE/DELETE — stare curentă pinuită (append-only doar prin convenție)', () => {
  const { db, close } = openRealSchema();
  try {
    insertProfile(db, baseProfile({ id: 'p1' }));
    db.prepare(
      `INSERT INTO profile_history (id, profile_id, changed_at, field, old_value, new_value)
       VALUES (1, 'p1', 1, 'name', 'a', 'b')`
    ).run();
    // pinuim comportamentul actual: SQL-ul nu împiedică nici UPDATE, nici
    // DELETE pe un rând de istoric. Dacă schema ar începe să le respingă
    // (ex. printr-un trigger), testul ăsta trebuie actualizat deliberat.
    assert.doesNotThrow(() => db.prepare(`UPDATE profile_history SET new_value = 'c' WHERE id = 1`).run());
    assert.doesNotThrow(() => db.prepare(`DELETE FROM profile_history WHERE id = 1`).run());
  } finally {
    close();
  }
});

test('2.5 configuration_versions nu e protejat împotriva UPDATE — stare curentă pinuită (imutabil doar prin intenție, I39)', () => {
  const { db, close } = openRealSchema();
  try {
    insertProfile(db, baseProfile({ id: 'p1' }));
    db.prepare(
      `INSERT INTO configuration_versions (id, profile_id, harness, provider, model, created_at)
       VALUES ('cv1', 'p1', 'claude-code', 'anthropic', 'sonnet', 1)`
    ).run();
    assert.doesNotThrow(() => db.prepare(`UPDATE configuration_versions SET model = 'opus' WHERE id = 'cv1'`).run());
  } finally {
    close();
  }
});

// =========================================================================
// 2.6 — Persistență reală și concurență
// =========================================================================

test('2.6 un profil scris, baza închisă și redeschisă: rândul e acolo, cu toate câmpurile intacte', () => {
  const dbPath = makeDbPath();
  const first = openDatabase({ path: dbPath, now: () => 5000 });
  const full = {
    id: 'persist-1',
    name: 'Profil persistent',
    primary_specialization: 'backend',
    approval_state: 'approved',
    assignable: 1,
    last_project: 'RPGfactory',
    last_post: 'RF-02a',
    created_at: 5000,
    updated_at: 5000,
    revision: 1,
  };
  first.db
    .prepare(
      `INSERT INTO agent_profiles
        (id, name, primary_specialization, approval_state, assignable, last_project, last_post, created_at, updated_at, revision)
       VALUES (:id, :name, :primary_specialization, :approval_state, :assignable, :last_project, :last_post, :created_at, :updated_at, :revision)`
    )
    .run(full);
  first.close();

  const second = openDatabase({ path: dbPath, now: () => 5000 });
  try {
    const row = second.db.prepare('SELECT * FROM agent_profiles WHERE id = ?').get('persist-1');
    assert.ok(row, 'profilul trebuie să existe după redeschidere');
    assert.equal(row.name, full.name);
    assert.equal(row.primary_specialization, full.primary_specialization);
    assert.equal(row.approval_state, full.approval_state);
    assert.equal(row.assignable, full.assignable);
    assert.equal(row.last_project, full.last_project);
    assert.equal(row.last_post, full.last_post);
    assert.equal(row.created_at, full.created_at);
    assert.equal(row.updated_at, full.updated_at);
    assert.equal(row.revision, full.revision);
  } finally {
    second.close();
    rmrf(dirOf(dbPath));
  }
});

test('2.6 revision ca verificare optimistă: un al doilea scriitor cu revizia veche nu reușește actualizarea', () => {
  const { db, close } = openRealSchema();
  try {
    insertProfile(db, baseProfile({ id: 'p1', revision: 1 }));

    // primul scriitor: deține revizia 1, reușește.
    const r1 = db
      .prepare(`UPDATE agent_profiles SET name = 'nume nou', updated_at = 2000, revision = revision + 1 WHERE id = ? AND revision = ?`)
      .run('p1', 1);
    assert.equal(r1.changes, 1, 'scrierea cu revizia curentă corectă trebuie să reușească');

    const afterFirst = db.prepare('SELECT revision, name FROM agent_profiles WHERE id = ?').get('p1');
    assert.equal(afterFirst.revision, 2);
    assert.equal(afterFirst.name, 'nume nou');

    // al doilea scriitor: încă deține revizia veche (1) — nu trebuie să
    // reușească, deloc, chiar dacă WHERE-ul găsește rândul pe id.
    const r2 = db
      .prepare(`UPDATE agent_profiles SET name = 'nume rău', updated_at = 3000, revision = revision + 1 WHERE id = ? AND revision = ?`)
      .run('p1', 1);
    assert.equal(r2.changes, 0, 'scrierea cu o revizie veche nu trebuie să modifice nimic (verificare optimistă eșuată)');

    const afterSecond = db.prepare('SELECT revision, name FROM agent_profiles WHERE id = ?').get('p1');
    assert.equal(afterSecond.revision, 2, 'revizia nu trebuie să avanseze din cauza scrierii eșuate');
    assert.equal(afterSecond.name, 'nume nou', 'valoarea din scrierea eșuată nu trebuie să apară');
  } finally {
    close();
  }
});

test('2.6 două handle-uri deschise simultan pe același fișier: o scriere din primul e vizibilă din al doilea după commit', () => {
  const dbPath = makeDbPath();
  const h1 = openDatabase({ path: dbPath });
  const h2 = openDatabase({ path: dbPath });
  try {
    // fiecare INSERT simplu, fără BEGIN explicit, rulează în autocommit —
    // e deja "commis" imediat ce .run() se întoarce.
    insertProfile(h1.db, baseProfile({ id: 'shared-1', created_at: 1, updated_at: 1 }));
    const seenByH2 = h2.db.prepare('SELECT id FROM agent_profiles WHERE id = ?').get('shared-1');
    assert.ok(seenByH2, 'al doilea handle trebuie să vadă scrierea comisă de primul, pe același fișier');
  } finally {
    h1.close();
    h2.close();
    rmrf(dirOf(dbPath));
  }
});

// =========================================================================
// 2.7 — :memory:
// =========================================================================

test('2.7 pe :memory:, journal_mode NU e wal — pinuim valoarea reală', () => {
  const { db, close } = openDatabase({ path: ':memory:' });
  try {
    const row = db.prepare('PRAGMA journal_mode').get();
    assert.notEqual(row.journal_mode, 'wal');
    assert.equal(row.journal_mode, 'memory', 'implicitul SQLite pentru :memory: e journal_mode=memory');
  } finally {
    close();
  }
});

test('2.7 două baze :memory: distincte nu împart date', () => {
  const a = openDatabase({ path: ':memory:' });
  const b = openDatabase({ path: ':memory:' });
  try {
    insertProfile(a.db, baseProfile({ id: 'only-in-a' }));
    const inB = b.db.prepare('SELECT id FROM agent_profiles WHERE id = ?').get('only-in-a');
    assert.equal(inB, undefined, 'a doua bază :memory: nu trebuie să vadă datele primei');
  } finally {
    a.close();
    b.close();
  }
});

test('2.7 :memory: funcționează pentru migrații și interogări, la fel ca pe fișier', () => {
  const migrationsDir = makeMigrationsDir({ '001-a.sql': 'CREATE TABLE a(x INTEGER);' });
  const { db, close, appliedMigrations } = openDatabase({ path: ':memory:', migrationsDir });
  try {
    assert.deepEqual(appliedMigrations(), ['001-a.sql']);
    db.prepare('INSERT INTO a (x) VALUES (42)').run();
    const row = db.prepare('SELECT x FROM a').get();
    assert.equal(row.x, 42);
  } finally {
    close();
    rmrf(migrationsDir);
  }
});
