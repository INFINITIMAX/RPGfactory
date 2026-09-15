# RF-02a-b — brief coder: trei defecte găsite de teste

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Context:** corecție în cadrul lotului RF-02a. Raportul tău: `docs/handoff/RF-02a-coder-raport.md`.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect. `plan.md` este înlocuit — nu îl cita.

---

## 1. Starea

Suita: **293 de teste, 287 trec, 6 pică.** Oracolul independent al planner-ului: 7 din 7 sonde trec.

Fundația e bună. Dar testele tester-ului au scos trei defecte reale, dintre care unul afectează cinci teste deodată.

**Un lucru important înainte de orice:** nu există încă nicio bază de date reală pe disc (`data/rpgfactory.db` nu a fost creat niciodată). Deci **repari `001-profiluri.sql` direct, în loc**. Nu adăuga o migrație `002` de corecție — n-are ce corecta, nimic nu s-a aplicat vreodată pe date reale. Verificarea de digest nu te încurcă din același motiv.

---

## 2. Defectul 1 — baza de date rămâne deschisă când migrațiile eșuează

**Cel mai important din cele trei.** Provoacă direct 5 din cele 6 eșecuri.

### Ce se întâmplă

`db.js:95-121`:

```js
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');
...
applyMigrations(db, migrationsDir, now);   // <-- daca arunca, iesim de aici
```

Dacă `applyMigrations` aruncă — digest nepotrivit, SQL invalid, orice — excepția se propagă, dar **`db` nu se închide niciodată**. Handle-ul rămâne deschis până la ieșirea procesului.

### De ce contează

Pe Windows, un fișier deschis **nu poate fi șters**. Cele cinci teste care verifică exact scenariile de eșec reușesc în aserțiuni, apoi crapă la curățenie:

```
Error: EPERM, Permission denied: ...\Temp\rf02a-db-9M4fTW
    at rmrf (test/db.test.mjs:52)
```

Nu e o problemă de test. Testul nu are ce închide — handle-ul a fost creat **înăuntrul** lui `openDatabase` și nu i-a fost niciodată returnat.

În producție e o scurgere de resurse: fiecare pornire eșuată lasă un fișier blocat și un handle deschis.

### Ce trebuie

Dacă ceva eșuează după ce baza a fost deschisă — pragme sau migrații — închide-o **înainte** de a propaga eroarea. Eroarea originală trebuie să rămână cea care iese; o eventuală eroare la închidere nu are voie s-o mascheze.

Verifică tot drumul de la `new DatabaseSync(...)` până la `return`, nu doar apelul la `applyMigrations`.

---

## 3. Defectul 2 — un profil poate exista fără identitate

### Ce se întâmplă

`migrations/001-profiluri.sql`:

```sql
CREATE TABLE agent_profiles (
  id TEXT PRIMARY KEY,     -- <-- accepta NULL
  ...
```

În SQLite, o coloană `PRIMARY KEY` care **nu** e `INTEGER PRIMARY KEY` acceptă `NULL`. E o particularitate istorică, păstrată pentru compatibilitate.

Măsurat de planner, direct pe `node:sqlite`:

```
Insert cu id = NULL explicit:
  ACCEPTAT  TEXT PRIMARY KEY (fara NOT NULL)
  respins   TEXT PRIMARY KEY NOT NULL

Insert cu coloana id omisa complet:
  ACCEPTAT  TEXT PRIMARY KEY (fara NOT NULL)
  respins   TEXT PRIMARY KEY NOT NULL

Continutul tabelului: [{"id":null,"nume":"x"},{"id":null,"nume":"y"}]
```

Ultimul rând e partea gravă: **două** rânduri cu `id` NULL au intrat amândouă. Cheia primară nu impune unicitatea pentru NULL-uri.

### De ce contează

Identitatea permanentă a unui specialist e temelia întregului produs. `AGENTS.md` o spune direct: *„identitate permanentă ≠ sesiune/PID/nume/model"*, iar decizia I38 cere asociere prin ID explicit, fără ghicit.

Un profil cu `id` NULL nu poate fi referit, nu poate fi asociat, nu poate fi deosebit de altul la fel. Iar baza le acceptă tăcut, oricâte.

### Ce trebuie

`NOT NULL` explicit pe fiecare coloană `TEXT PRIMARY KEY`. Sunt trei: `agent_profiles.id`, `configuration_versions.id`, și verifică dacă mai există altele.

`profile_history.id` e `INTEGER PRIMARY KEY AUTOINCREMENT` — acela e alias de rowid și respinge NULL din construcție. Nu-l schimba.

Pune un comentariu scurt lângă fiecare, cu motivul. Cine citește schema peste un an trebuie să înțeleagă de ce `NOT NULL` apare lângă `PRIMARY KEY`, altfel pare redundant și cineva îl șterge.

---

## 4. Defectul 3 — o migrație cu `COMMIT` propriu persistă deși raportează eșec

Tester-ul l-a găsit și l-a documentat corect, fără să-l repare.

### Ce se întâmplă

`applyMigrations` face `db.exec('BEGIN')`, apoi `db.exec(content)`. Dacă `content` conține el însuși un `COMMIT`, tranzacția ta se închide **la mijlocul migrației**. Ce urmează rulează în afara ei.

Rezultatul măsurat: `openDatabase` aruncă — deci semnalează eșec — dar tabelul creat **și rândul din `schema_migrations`** rămân pe disc. Verificat cu o conexiune SQLite separată.

### De ce contează

E cel mai periculos dintre cele trei, chiar dacă cere un fișier de migrație scris greșit ca să se declanșeze.

Aplicația spune „nu a mers" și oprește pornirea. Dar migrația e înregistrată ca aplicată. La următoarea pornire e sărită, pentru că apare în `schema_migrations`. Baza rămâne permanent pe jumătate migrată, iar mecanismul de migrații nu mai are cum să observe — chiar el crede că totul e în regulă.

Un eșec care se raportează ca eșec, dar se înregistrează ca succes, e mai rău decât un eșec tăcut.

### Ce trebuie

Alege și justifică în raport:

- **Respinge migrațiile care conțin instrucțiuni de tranzacție** (`BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`), cu eroare explicită înainte de a executa ceva. Simplu, previzibil, ușor de explicat. Costul: o verificare textuală care poate da fals pozitiv la un `COMMIT` apărut într-un comentariu sau într-un literal.
- **Verifică starea tranzacției după execuție** și tratează ca eșec cazul în care nu mai ești în tranzacție când te aștepți să fii.
- Altceva, dacă vezi ceva mai bun.

Criteriul pe care îl verific: **o migrație care eșuează nu poate ajunge niciodată să fie înregistrată în `schema_migrations`.** Oricare ar fi drumul.

---

## 5. Fișiere

**Poți modifica:** `db.js`, `migrations/001-profiluri.sql`.

**NU atinge:** `test/**` — testele sunt ale tester-ului și descriu corect comportamentul dorit; ele trebuie să devină verzi prin schimbarea codului, nu a lor. Nici `server.js`, `state.js`, `body.js`, `server/http-guards.js`, `status.js`, `rank.js`, `public/**`, `package.json`, `data/`, `.env`, `assets/`, documentele de coordonare.

---

## 6. Raportul

Adaugă `## RF-02a-b` la finalul `docs/handoff/RF-02a-coder-raport.md`, fără să rescrii nimic dinainte:

```
### Defectul 1 — handle scurs
Ce am schimbat, și pe ce căi de eroare am verificat că se închide:

### Defectul 2 — PRIMARY KEY nullable
Ce coloane am corectat:

### Defectul 3 — COMMIT în migrație
Ce abordare am ales, ce am respins, și de ce:
Cum garantează că o migrație eșuată nu ajunge în schema_migrations:

### Contradicții găsite în brief
```

---

## 7. Constrângeri

- Nu rulezi comenzi. Măsurătorile de mai sus sunt ale planner-ului.
- Nu scrii teste. Nu afirma că „acum trec".
- Nu delega.
- Română.

### Citește înainte

1. `db.js` și `migrations/001-profiluri.sql` — integral
2. `test/db.test.mjs`, testele de la liniile 177, 219, 244, 333, 359 și 454 — **doar ca să înțelegi ce se măsoară.** Nu le modifica.
3. `docs/handoff/RF-02a-tester-raport.md` — secțiunea despre cele două capcane
