# RF-02a-d — raport tester

**Data:** 15-09-2026, EET.
**Fișier modificat:** `test/db.test.mjs` (singurul atins, conform brief-ului). `db.js`, `migrations/**` nu au fost atinse.

---

## 1. Testul de la linia 359 (vechi) — ce am schimbat și de ce

Am **fuzionat** vechiul test de la linia 333 (BEGIN) cu cel de la linia 359 (COMMIT) și am adăugat ROLLBACK și SAVEPOINT în același bloc, sub forma unui singur test parametrizat (`for (const [keyword, content, tableName] of [...])`, patru cazuri).

**Motivul fuziunii:** am citit `db.js` (funcția `applyMigrations`, liniile 99-106) și am confirmat că `hasTransactionControlStatement(content)` e verificat **înainte** de `db.exec('BEGIN')` — deci pentru orice migrație care conține BEGIN/COMMIT/ROLLBACK/SAVEPOINT, nimic din conținut nu ajunge niciodată la execuție. Cele patru cazuri au devenit structural identice: `assert.throws` pe `openDatabase`, apoi verificare pe o conexiune brută că tabelul respectiv NU există și migrația NU e în `schema_migrations`. Patru teste aproape duplicate n-ar fi adăugat acoperire reală față de o buclă peste cele patru cuvinte cheie — ar fi fost doar zgomot, exact riscul pe care reviewer-ul îl semnalează de obicei.

**Ce s-a schimbat față de vechiul test COMMIT (linia 359):**
- Titlul nu mai vorbește despre "inconsistență de raportat" — acum e "respinsă curat înainte de orice execuție, nimic nu persistă", identic ca intenție cu vechiul test BEGIN.
- `assert.ok(tables.includes('nested_commit'), 'inconsistență pinuită: ...')` → `assert.ok(!tables.includes(tableName), '... trebuie să oprească execuția...')` — negat, mesaj schimbat din "pinuire a bug-ului" în verificare normală de respingere.
- Analog pentru `schema_migrations`: `migRows.includes(...)` (afirmativ) → `!migRows.includes(...)` (negat).
- `openDatabase(...)` tot trebuie să arunce — asta a rămas neschimbat, cum cerea brief-ul.

**Ce ar face acest test să cadă:** dacă cineva ar slăbi din nou verificarea `hasTransactionControlStatement` (de ex. ar muta-o după `db.exec('BEGIN')`, sau ar limita-o doar la BEGIN), pentru cazurile COMMIT/ROLLBACK/SAVEPOINT tabelul respectiv AR exista pe disc și/sau migrația AR apărea în `schema_migrations` — `assert.ok(!tables.includes(...))` sau `assert.ok(!migRows.includes(...))` ar pica.

## 2. Test nou pentru `configuration_versions.id` (defectul 2)

Adăugat imediat înaintea testului "id duplicat pe agent_profiles" (secțiunea 2.4), simetric cu testul existent de la ~linia 454 pentru `agent_profiles`:

- Insert cu coloana `id` omisă complet din `configuration_versions`.
- Insert cu `id = NULL` explicit.
- Verificare colaterală: `COUNT(*)` pe `configuration_versions` rămâne 0.

**Ce l-ar face să cadă:** dacă migrația `001-profiluri.sql` nu ar mai avea `NOT NULL` pe `configuration_versions.id` (rămânând doar `TEXT PRIMARY KEY`, care în SQLite acceptă NULL), ambele `assert.throws` ar eșua — inserturile ar reuși silențios, cu `id = NULL` în tabel, exact scenariul care a scăpat neobservat la primul tur de reparații (RF-02a-b a acoperit coloana observată pe `agent_profiles`, dar nu și pe `configuration_versions`). Am verificat manual în `migrations/001-profiluri.sql` (linia 51): `id TEXT PRIMARY KEY NOT NULL` — coloana e corect reparată acum.

## 3. Defectul 1 (handle scurs) — ce am verificat

Testele existente la liniile ~219 și ~244 (eșec la mijloc) deschid o conexiune brută nouă (`new DatabaseSync(dbPath)`) după ce `openDatabase` a aruncat, și fac cleanup cu `rmrf(dir, { recursive: true, force: true })`. Am verificat: `force: true` la `fs.rmSync` ignoră doar `ENOENT`, **nu** `EPERM`/`EBUSY` — deci dacă handle-ul intern al `openDatabase` ar fi rămas deschis, aceste teste ar fi picat oricum, dar **indirect**, ca eroare de cleanup în `finally`, fără niciun mesaj care să identifice cauza reală (handle scurs vs. altă problemă de I/O). Ele testează efectul colateral, nu afirmă explicit "handle-ul a fost închis".

Am adăugat un test nou dedicat (secțiunea 2.2): după ce `openDatabase` aruncă pe scenariul de digest schimbat, se face `fs.unlinkSync(dbPath)` **direct** (nu `rmSync` recursiv cu force) și se afirmă explicit `assert.doesNotThrow(...)` cu mesaj care numește cauza posibilă. Am citit `db.js` (liniile 154-159): `db.close()` rulează în catch-ul lui `openDatabase` înainte ca eroarea originală să iasă — confirmă că reparația e prezentă.

**Ce l-ar face să cadă:** dacă `db.close()` din catch ar fi omis, rulat condiționat greșit, sau ar rula după ce eroarea deja a "scăpat" din funcție, `fs.unlinkSync(dbPath)` ar arunca `EPERM`/`EBUSY` pe Windows (fișier blocat de un handle SQLite încă deschis) — testul ar pica direct pe acel `assert.doesNotThrow`, cu mesaj clar, nu ca efect colateral ascuns în cleanup.

## 4. ROLLBACK/SAVEPOINT (defectul 3, cazul simetric)

Acoperite ambele (nu doar unul) — vezi punctul 1: testul parametrizat include toate cele patru cuvinte cheie (BEGIN, COMMIT, ROLLBACK, SAVEPOINT), fiecare cu propriul conținut de migrație care ar reuși parțial (creează un tabel distinct) dacă respingerea n-ar opri execuția la timp. Nu a fost nevoie să aleg doar unul — bucla nu adaugă cost de întreținere suplimentar față de patru teste separate.

## 5. Ce NU am acoperit și de ce

- Nu am testat cazuri de fals-pozitiv ale `hasTransactionControlStatement` pe literale de șir care conțin întâmplător cuvintele cheie (ex. `INSERT INTO x VALUES ('please commit to this')`) — brief-ul (§3) interzice explicit tratarea limitării documentate ca bug.
- Nu am slăbit nicio asertare existentă.
- Nu am atins `db.js`, `migrations/**` sau alte fișiere din proiect.

## 6. Comanda exactă de rulare (pentru planner)

```powershell
node --test test/db.test.mjs
```

sau, dacă suita completă trebuie rulată (293+ teste inclusiv celelalte fișiere din `test/`):

```powershell
node --test test/
```

Nu am rulat nicio comandă — conform regulilor rolului, planner-ul confirmă rezultatul.
