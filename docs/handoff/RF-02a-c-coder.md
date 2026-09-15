# RF-02a-c — brief coder: `configuration_versions.id` a rămas nullable

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Context:** al doilea tur de corecție în lotul RF-02a. Precedentul: `docs/handoff/RF-02a-b-coder.md`, defectul 2.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Ce am verificat eu (planner), direct în fișier, nu doar din teste

Brief-ul precedent (`RF-02a-b-coder.md`, secțiunea „Defectul 2") cerea explicit `NOT NULL` pe **două** coloane: `agent_profiles.id` și `configuration_versions.id`.

Am citit `migrations/001-profiluri.sql` linie cu linie:

```
line 17:  id                     TEXT PRIMARY KEY NOT NULL,     -- agent_profiles: reparat
line 48:  id                 TEXT PRIMARY KEY,                  -- configuration_versions: NEREPARAT
line 67:  id         INTEGER PRIMARY KEY AUTOINCREMENT,         -- profile_history: nu se aplică (INTEGER PRIMARY KEY nu acceptă NULL)
```

`configuration_versions.id` a rămas exact cu bug-ul original: `TEXT PRIMARY KEY` fără `NOT NULL` acceptă `NULL`, iar cheia primară nu impune unicitate între NULL-uri — pot intra oricâte configurații fără identitate.

Rulare completă a suitei: **293 teste, 292 trec, 1 pică** (testul care pică e altceva — o consecință corectă a fixului tău de la defectul 3, o rezolv separat cu tester-ul, nu te privește pe tine). Niciun test curent nu acoperă lipsa asta specifică pe `configuration_versions.id` — de-aia n-a picat nimic, dar problema există.

## 2. Ce trebuie

O linie, în `migrations/001-profiluri.sql`:

```sql
id                 TEXT PRIMARY KEY NOT NULL,
```

Adaugă și un comentariu scurt, în același stil cu cel de la `agent_profiles.id` (liniile 12-16) — motivul exact (`TEXT PRIMARY KEY` acceptă NULL, unicitatea nu se aplică între NULL-uri), ca să nu pară redundant cuiva care citește schema peste un an.

Nu e nevoie de o migrație `002` — la fel ca prima dată, nicio bază reală n-a fost creată vreodată pe disc (verifică tu, dar planner-ul a confirmat asta deja la RF-02a-b).

## 3. Raportul lipsă de la turul precedent

`docs/handoff/RF-02a-coder-raport.md` nu are secțiunea `## RF-02a-b` cerută de brief-ul precedent — se pare că sesiunea s-a întrerupt înainte s-o scrii. Adaug-o ACUM, la finalul fișierului (fără să rescrii nimic dinainte), cu ce ai făcut de fapt la defectele 1 și 3 (poți descrie retroactiv, codul e deja pe disc și l-am verificat eu):

```
## RF-02a-b

### Defectul 1 — handle scurs
Ce ai schimbat, pe ce căi de eroare ai verificat că se închide:

### Defectul 2 — PRIMARY KEY nullable
Ce coloane ai corectat (la acest tur: doar agent_profiles.id — configuration_versions.id se adaugă acum, la RF-02a-c):

### Defectul 3 — COMMIT în migrație
Ce abordare ai ales, ce ai respins, și de ce:
Cum garantează că o migrație eșuată nu ajunge în schema_migrations:

### Contradicții găsite în brief
```

Apoi adaugă și:

```
## RF-02a-c
Coloana corectată, comentariul adăugat:
```

## 4. Fișiere

**Poți modifica:** `migrations/001-profiluri.sql`, `docs/handoff/RF-02a-coder-raport.md` (doar adăugare la final, secțiunile de mai sus).

**NU atinge:** `db.js`, `test/**`, `server.js`, `state.js`, `body.js`, `server/http-guards.js`, `status.js`, `rank.js`, `public/**`, `package.json`, `data/`, `.env`, `assets/`, documentele de coordonare.

## 5. Constrângeri

- Nu rulezi comenzi.
- Nu scrii teste. Nu afirma că „acum trece".
- Română.
