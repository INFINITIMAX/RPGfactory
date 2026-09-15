# RF-02a — raport coder

## Ce am implementat

- `db.js` — `openDatabase(options)` cu `path`/`migrationsDir`/`now` injectabile, fără efecte secundare la `require`. Creează directorul părinte (nu pentru `:memory:`), deschide baza, setează pragmele, aplică migrațiile neaplicate în ordine (fiecare în `BEGIN`/`COMMIT`/`ROLLBACK` propriu), întoarce `{ db, close, appliedMigrations }`. Exportă și `MIGRATIONS_DIR`.
- Mecanismul de migrații — funcții interne `listMigrationFiles`, `digestOf`, `ensureMigrationsTable`, `applyMigrations`, toate în `db.js` (n-am creat module auxiliare separate, e puțin cod și strâns legat de `openDatabase`). Tabelul `schema_migrations(name, applied_at, digest)`, creat cu `CREATE TABLE IF NOT EXISTS`.
- `migrations/001-profiluri.sql` — tabelele `agent_profiles`, `configuration_versions`, `profile_history`, plus doi indecși pe cheile străine.
- `package.json` — adăugat `"test": "node --test"` (comanda din rădăcină, nu `node --test test/`) și `"engines": { "node": ">=24.0.0" }`.
- `.gitignore` — adăugat `*.db`, `*.db-wal`, `*.db-shm` (deja acoperite indirect de `data/` cât timp calea implicită rămâne acolo, dar testele pot scrie fișiere `.db` în alte directoare, deci le-am adăugat explicit).

## Schema, explicată

**`agent_profiles`**
- `id TEXT PRIMARY KEY` — generat de aplicație (nu de utilizator, nu derivat din PID/nume). Tipul `TEXT` fiindcă nu presupun formatul (UUID sau altceva) — decizia de generare rămâne la lotul care scrie profiluri.
- `name TEXT NOT NULL` — etichetă editabilă, nu identitate (I27).
- `primary_specialization TEXT NOT NULL DEFAULT ''` — text editabil; am ales `NOT NULL DEFAULT ''` în loc de nullable, ca să nu existe două stări echivalente („nespecificat" = NULL vs. „" gol) pentru un câmp fără interpretare specială când e absent. Nu era dictat explicit de brief — e alegerea mea.
- `approval_state TEXT NOT NULL DEFAULT 'proposed' CHECK (IN ('proposed','approved'))` — I26. Implicit `proposed`, fiindcă planner-ul propune, Lucian aprobă.
- `assignable INTEGER NOT NULL DEFAULT 0 CHECK (IN (0,1))` — eligibilitate pentru taskuri noi (I27), boolean SQLite (0/1). Implicit 0 (neeligibil) — am considerat că un profil abia propus nu trebuie să primească taskuri automat înainte de aprobare; e o alegere a mea, nu era în brief.
- `last_project`, `last_post TEXT` — opționale (I25, I35), nullable.
- `created_at`, `updated_at INTEGER NOT NULL` — timestamps, `INTEGER` (epoch ms), consecvent cu `now()` injectabil din `db.js`.
- `revision INTEGER NOT NULL DEFAULT 1` — contor monoton, nu `Date.now()`. Am scris în comentariul migrației cum se folosește la scriere concurentă (`UPDATE ... SET revision = revision + 1 WHERE id=? AND revision=?`), dar n-am scris cod de scriere — nu era în lot.

**`configuration_versions`**
- `id TEXT PRIMARY KEY` — imutabil (I39), generat de aplicație.
- `profile_id TEXT NOT NULL REFERENCES agent_profiles(id)` — FK simplu, fără `ON DELETE`, adică implicit `RESTRICT`: nu las un profil să fie șters dacă are configurații legate — coerent cu regula „nu rescrie/nu distruge istoricul".
- `harness`, `provider`, `model TEXT NOT NULL` — text, așa cum cere brief-ul.
- `instructions_ref`, `skills_ref`, `memory_ref TEXT` (nullable) — referințe/digesturi, nu conținut.
- `created_at INTEGER NOT NULL`.
- Comentariu explicit în migrație cu interdicția absolută (secrete/`.env`/tokenuri/config globale/prompturi brute) — cerut literal de brief.
- Index pe `profile_id` — decizia mea, nedictată explicit: tabelul va fi interogat aproape mereu filtrat după profil.

**`profile_history`**
- `id INTEGER PRIMARY KEY AUTOINCREMENT` — jurnal append-only, cheie surogat simplă.
- `profile_id TEXT NOT NULL REFERENCES agent_profiles(id)`, `changed_at INTEGER NOT NULL`.
- `field TEXT NOT NULL`, `old_value TEXT`, `new_value TEXT` — o linie per câmp schimbat, nu un blob JSON cu tot diff-ul. Am ales granularitatea „un rând = o schimbare de câmp" ca să rămână interogabil simplu (ex. „arată toate redenumirile") fără parsare JSON; e o alegere a mea, brief-ul cerea doar „ce s-a schimbat, când, de la ce la ce", fără format exact.
- Index pe `profile_id`, aceeași motivație ca mai sus.

N-am creat tabel pentru competențe/niveluri (explicit interzis pentru acest lot) — schema de mai sus nu blochează adăugarea lui: o migrație viitoare poate adăuga `agent_skills(profile_id, ...)` cu FK către `agent_profiles(id)` fără să atingă tabelele existente.

## journal_mode citit înapoi

Nu pot rula cod — nu am confirmarea valorii reale. Am implementat citirea înapoi cu `db.prepare('PRAGMA journal_mode = WAL').get()` (nu `db.exec`, ca să capturez rândul întors de pragma) doar pentru bazele pe fișier; rezultatul nu e stocat nicăieri (nu era cerut în API-ul `openDatabase`), dar handle-ul `db` întors e accesibil testerului/planner-ului, care poate verifica direct cu `db.prepare('PRAGMA journal_mode').get()` după `openDatabase()`. Planner-ul trebuie să confirme valoarea reală la rulare.

## Decizii pe care le-am luat singur

- **Migrații lipsă din mijloc:** nu impun contiguitate. Sortez fișierele alfabetic (echivalent cu numeric, fiindcă prefixul e fix pe 3 cifre) și le aplic pe cele existente, în ordine. Un număr „lipsă" (ex. 002 retras înainte de a fi aplicat oriunde) nu e tratat ca eroare — numărul e doar un ordonator stabil, nu o secvență fără goluri obligatorie. Am documentat asta ca invariant în cod (comentariu în `listMigrationFiles`), fiindcă e o decizie pe care tester-ul trebuie să o cunoască pentru a scrie testul corect (nu trebuie să testeze eroare la gol, ci comportament normal).
- N-am creat module auxiliare separate pentru migrații — sunt funcții private în `db.js`, fiindcă brief-ul permite module mici „doar dacă simplifică vizibil", iar aici n-ar fi simplificat nimic (cod strâns cuplat, un singur consumator).
- `assignable` implicit 0 și `approval_state` implicit `'proposed'` — motivate mai sus, nu erau specificate explicit ca implicite în brief.
- FK-uri fără `ON DELETE CASCADE`/`SET NULL` explicit (implicit `RESTRICT` în SQLite) — nicio operație de ștergere de profil nu e în scopul acestui lot, deci am ales varianta mai sigură (blochează ștergerea accidentală) în loc să presupun o politică de cascadă nescrisă nicăieri.

## Ce nu am făcut și de ce

- N-am scris cod de scriere/citire CRUD pentru profiluri (insert/update cu verificare optimistă pe `revision`) — nu era cerut, doar schema. Am documentat pattern-ul așteptat în comentariul coloanei `revision`.
- N-am atins `server.js`, `state.js`, `test/`, `data/` — conform interdicțiilor explicite din brief.
- N-am scris teste.
- N-am rulat nimic (`node --test`, deschidere efectivă a bazei) — nu am unelte de shell.

## Riscuri pentru tester

- Digest-ul folosește `sha256` pe conținutul exact al fișierului (inclusiv terminatoare de linie) — dacă testerul generează dinamic conținut de migrație pentru testul de „migrație editată după aplicare", trebuie să scrie fișierul cu exact alt conținut de octeți, nu doar alt obiect JS.
- `applyMigrations` citește `schema_migrations` o singură dată la început (`SELECT` înainte de bucla `for`) — dacă testerul vrea să verifice idempotența unui al doilea `openDatabase()` pe aceeași bază, trebuie să deschidă o instanță nouă (a doua invocare a `openDatabase`), nu doar să re-apeleze o funcție internă.
- Pe `:memory:`, `journal_mode` nu e nici măcar interogat de `db.js` — dacă testerul verifică `PRAGMA journal_mode` pe o bază `:memory:`, va vedea implicit `memory`, nu `wal`, ceea ce e corect conform brief-ului, dar poate surprinde dacă nu e explicit avut în minte.
- Regex-ul de nume de migrație (`^\d{3}-.+\.sql$`) ignoră tăcut fișiere care nu se potrivesc (ex. `.gitkeep`, `readme.md` în `migrations/`) — dacă testerul pune un fișier greșit numit așteptând eroare, nu va primi una; e ignorat, nu respins.
- Constrângerile `CHECK` de pe `approval_state`/`assignable` aruncă erori native SQLite (mesaj gen `CHECK constraint failed`), nu erori formatate de `db.js` — testerul care verifică integritatea schemei ar trebui să insereze direct prin `db.prepare(...).run(...)` și să verifice că `run` aruncă, nu să aștepte un mesaj anume.

## Contradicții găsite în brief

Niciuna.

## RF-02a-b

### Defectul 1 — handle scurs
Am mutat `new DatabaseSync(dbPath)` înainte de un bloc `try`, iar tot ce urmează (pragme + `applyMigrations`) rulează în acel `try`. Dacă oricare pas aruncă, `catch` face `db.close()` într-un `try`/`catch` propriu (ignorăm eroarea de la închidere — nu are voie să mascheze eroarea originală) și apoi rearunc eroarea originală neschimbată. Am verificat drumul complet de la `new DatabaseSync(...)` până la `return`: pragma `foreign_keys`, `journal_mode` (doar pe fișier), `busy_timeout`, `synchronous`, și `applyMigrations` — toate sub același `try`, deci orice eșec pe oricare din ele închide baza înainte de a propaga.

### Defectul 2 — PRIMARY KEY nullable
La acest tur (RF-02a-b): doar `agent_profiles.id`, cu `NOT NULL` explicit și comentariu care explică particularitatea SQLite (TEXT PRIMARY KEY acceptă NULL, unicitatea nu se aplică între NULL-uri). `configuration_versions.id` a rămas nereparat din greșeală — corectat abia la RF-02a-c (secțiunea de mai jos).

### Defectul 3 — COMMIT în migrație
Am ales prima variantă din brief: resping migrațiile care conțin `BEGIN`/`COMMIT`/`ROLLBACK`/`SAVEPOINT`, cu eroare explicită aruncată **înainte** de a executa orice conținut din fișier (`hasTransactionControlStatement`, verificat pe conținut fără comentarii pe o linie, ca să reduc fals-pozitivele evidente). Am respins varianta „verifică starea tranzacției după execuție" — ar fi lăsat efectele parțiale ale migrației deja aplicate pe disc înainte de a detecta problema, exact scenariul periculos descris în brief; verificarea textuală înainte de execuție elimină riscul din start, cu costul asumat că nu e un parser SQL real (poate da fals-pozitiv pe un literal de șir care conține cuvântul, dar niciodată fals-negativ care ar lăsa o migrație periculoasă să treacă neobservată).

Garanția: verificarea rulează înainte de `db.exec('BEGIN')` din `applyMigrations`, deci o migrație respinsă nu ajunge niciodată la `INSERT INTO schema_migrations`. Pentru migrațiile care trec de verificare, `recordApplied.run(...)` e făcut **înăuntrul** tranzacției proprii (între `BEGIN` și `COMMIT`), înainte de `db.exec('COMMIT')` — dacă `db.exec(content)` sau `recordApplied.run(...)` aruncă, blocul `catch` face `db.exec('ROLLBACK')` și rearuncă, deci rândul din `schema_migrations` nu persistă. Oricare ar fi punctul de eșec (conținut interzis, SQL invalid, digest nepotrivit la o migrație deja aplicată), migrația eșuată nu ajunge înregistrată.

### Contradicții găsite în brief
Niciuna.

## RF-02a-c
Coloana corectată: `configuration_versions.id`, din `TEXT PRIMARY KEY` în `TEXT PRIMARY KEY NOT NULL`. Comentariul adăugat, în același stil ca la `agent_profiles.id`: explică faptul că `TEXT PRIMARY KEY` acceptă `NULL` în SQLite și că unicitatea nu se aplică între valori `NULL`, deci fără `NOT NULL` ar putea intra oricâte configurații fără identitate.
