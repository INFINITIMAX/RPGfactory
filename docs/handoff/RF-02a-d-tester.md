# RF-02a-d — brief tester: verificare finală + un test învechit de actualizat

**Data:** 15-09-2026, EET.
**Rol:** tester. **Nu rulezi comenzi. Nu afirmi că testele trec.**
**Context:** ultimul pas al lotului RF-02a, după corecțiile RF-02a-b (defectele 1 și 3) și RF-02a-c (defectul 2, coloana rămasă).

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Starea verificată de planner

Rulare completă: **293 teste, 292 trec, 1 pică.** Singurul eșec:

```
test\db.test.mjs:359
'2.3 migrație cu propriul COMMIT în conținut: openDatabase aruncă, DAR datele au fost deja
persistate — inconsistență de raportat, nu de reparat'
```

Nu e o regresie. E un test care documenta ("pinuia") comportamentul VECHI, greșit — scris înainte ca defectul 3 să fie reparat. Coder-ul a ales, la RF-02a-b, o reparație mai strictă decât inconsistența pe care acest test o aștepta: acum orice migrație care conține `BEGIN`/`COMMIT`/`ROLLBACK`/`SAVEPOINT` e **respinsă înainte să execute orice conținut** (`hasTransactionControlStatement`, în `db.js`). Rezultat: pentru migrația din acest test (`CREATE TABLE nested_commit(x INTEGER);\nCOMMIT;`), acum NU se mai creează tabelul și NU se mai înregistrează nimic în `schema_migrations` — inconsistența pe care testul o pinuia explicit nu mai există. E o îmbunătățire reală, nu o coincidență.

Planner a verificat asta citind `db.js` (funcția `applyMigrations`, liniile 99-106) — verificarea rulează înainte de `db.exec('BEGIN')`, deci migrația respinsă nu ajunge niciodată la execuție.

## 2. Sarcina ta

### 2.1 Actualizează testul de la linia 359

Nu-l șterge — schimbă-i așteptarea ca să reflecte comportamentul NOU, mai bun. Titlul și comentariul trebuie să nu mai vorbească despre o "inconsistență de raportat" — acum e un caz normal de respingere curată, la fel ca testul de la linia 333 (BEGIN). Verifică:
- `openDatabase(...)` tot aruncă (semnal de eșec către apelant) — asta rămâne neschimbat.
- Tabelul `nested_commit` NU există pe disc (schimbă `assert.ok(tables.includes(...))` în `assert.ok(!tables.includes(...))`).
- Migrația NU apare în `schema_migrations` (analog, negat).

Poți fuziona acest test cu cel de la linia 333 dacă observi că au devenit identice ca structură (doar conținutul migrației diferă — BEGIN vs. COMMIT) — decizia ta, motiveaz-o în raport. Dacă le păstrezi separate, actualizează și mesajele de eroare din `assert` (nu mai sunt "inconsistență pinuită", sunt verificări normale de respingere).

### 2.2 Verifică independent cele 3 defecte — nu doar citind raportul coder-ului

Pentru fiecare, scrie sau confirmă (dacă testul deja există și e suficient de strict) o probă care ar cădea real dacă reparația ar fi incompletă:

1. **Defectul 1 (handle scurs)** — un scenariu de eșec la deschidere (ex. migrație cu digest greșit) urmat de o încercare de a șterge fișierul bazei imediat după — dacă handle-ul a rămas deschis, ștergerea eșuează pe Windows (`EPERM`). Verifică dacă testele existente (liniile 219, 244) deja acoperă asta suficient de strict, sau dacă acoperă doar efectul colateral (cleanup-ul testului însuși reușește) fără să afirme explicit "handle-ul a fost închis".

2. **Defectul 2 (PRIMARY KEY nullable)** — **acesta e cel mai important de verificat, fiindcă a scăpat neobservat prima dată.** Scrie un test explicit, simetric cu cel de `agent_profiles.id` (dacă există unul la linia ~454), dar pentru **`configuration_versions.id`**: insert cu `id = NULL` explicit și insert cu coloana omisă complet — ambele trebuie să arunce acum (`NOT NULL` constraint violation). Ăsta e exact testul care lipsea și care a lăsat coloana nereparată să treacă neobservată la primul tur — nu-l omite.

3. **Defectul 3 (COMMIT în migrație)** — după ce actualizezi testul de la 2.1, verifică dacă acoperă și cazul simetric cu ROLLBACK/SAVEPOINT (dacă nu există deja un test separat pentru ele) — brief-ul original (RF-02a-b) cerea respingerea tuturor celor patru cuvinte cheie (`BEGIN`/`COMMIT`/`ROLLBACK`/`SAVEPOINT`), dar testele explicite par să acopere doar BEGIN și COMMIT. Dacă ROLLBACK/SAVEPOINT nu au test dedicat, adaugă cel puțin unul (poți alege doar unul dintre ele, motivează în raport dacă nu le acoperi pe amândouă).

## 3. Ce NU e un test valid

- Nu slăbi vreo asertare existentă ca să treacă numărul de teste verzi.
- Nu presupune că `hasTransactionControlStatement` e un parser SQL real — nu testa cazuri de fals-pozitiv pe literale de șir care conțin din întâmplare cuvântul (coder-ul a documentat explicit limitarea asta ca acceptată, nu ca bug).

## 4. Fișiere

**Poți modifica:** `test/db.test.mjs`.

**NU atinge:** `db.js`, `migrations/**`, `server.js`, `state.js`, `public/**`, documentele de coordonare.

## 5. Raportul

`docs/handoff/RF-02a-d-tester-raport.md`: ce ai schimbat la testul de linia 359 și de ce, ce test nou ai adăugat pentru `configuration_versions.id` (cu exact ce ar face să cadă), ce ai verificat la defectul 1 și la ROLLBACK/SAVEPOINT, comanda exactă de rulare a întregii suite.

## 6. Constrângeri

- Nu rulezi comenzi.
- Nu afirma că "acum trece" — planner rulează și confirmă.
- Română.
