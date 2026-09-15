# RF-02b — brief tester: profiluri + configurații versionate, cu API

**Data:** 15-09-2026, EET.
**Rol:** tester. **Nu rulezi comenzi. Nu afirmi că testele trec.**
**Lot:** RF-02b — `profiles.js` + rutele `/api/profiles*` din `server.js`.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Ce ai de testat

Scrie două fișiere de teste (sau extinde, dacă găsești deja ceva potrivit — verifică întâi):

1. **`test/profiles.test.mjs`** — modulul `profiles.js` direct, fără HTTP. Tipar: ca `test/db.test.mjs` (bază `:memory:` sau director temporar, `now` injectat).
2. **`test/server-profiles.test.mjs`** (sau extinde `test/server.test.mjs`, dacă structura permite ușor) — rutele HTTP, server real pe port efemer, ca `test/server.test.mjs` existent.

Citește întâi `docs/handoff/RF-02b-coder.md` (contractul) și `docs/handoff/RF-02b-coder-raport.md` (ce a implementat de fapt coder-ul, inclusiv deciziile proprii: coduri 201 la creare, distincția NOT_FOUND/CONFLICT prin SELECT separat, istoric scris doar pe câmpuri efectiv schimbate).

## 2. `profiles.js` — cazuri de acoperit

### 2.1 `createProfile`
- Nume valid → profil complet întors, cu `id` (UUID plauzibil), `approval_state: 'proposed'`, `assignable: 0`, `revision: 1`.
- Nume lipsă / gol / doar spații → aruncă cu `code: 'VALIDATION'`.
- Un rând `profile_history` scris la creație (`field: 'created'`, `old_value: null`, `new_value: <nume>`) — verifică-l direct din bază, nu doar din obiectul întors.
- Două profiluri create succesiv au `id` diferite (UUID chiar generate, nu un contor).

### 2.2 `updateProfile` — inima lotului, testeaz-o exhaustiv
- Update valid (`expectedRevision` corect, un câmp) → `revision` crește cu exact 1, câmpul se schimbă, `updated_at` se schimbă la `now()` injectat.
- `expectedRevision` lipsă / non-număr / non-întreg / `0` / negativ → `code: 'VALIDATION'`, **nimic nu se schimbă în bază** (verifică explicit — nici `revision`, nici vreun rând nou în `profile_history`).
- `expectedRevision` care nu se potrivește cu revizia curentă (ex. profilul e la revizia 2, tu trimiți 1) → `code: 'CONFLICT'`, cu `e.current` = profilul real din bază la acel moment; **nimic nu se schimbă**.
- `id` inexistent → `code: 'NOT_FOUND'` (nu `CONFLICT`) — verifică explicit distincția, coder-ul a implementat-o cu un `SELECT` separat înainte de `UPDATE`.
- `changes` gol (`{}`) → `code: 'VALIDATION'`.
- `changes` cu o cheie necunoscută (ex. `{ id: 'altceva' }`, `{ revision: 99 }`, `{ created_at: 0 }`) → `code: 'VALIDATION'`, respinsă înainte de a atinge baza.
- `changes.approval_state` altceva decât `'proposed'`/`'approved'` → `code: 'VALIDATION'`.
- `changes.assignable` cu `true`/`false` → normalizat corect la `1`/`0` în bază (verifică tipul din SQLite, nu doar valoarea).
- `changes.assignable` cu altceva (ex. `2`, `'da'`) → `code: 'VALIDATION'`.
- **Mai multe câmpuri deodată** (ex. `{ approval_state: 'approved', assignable: 1 }`) → `revision` crește cu **exact 1** (nu 2), și apar **exact 2** rânduri noi în `profile_history` (unul per câmp), fiecare cu `old_value`/`new_value` corecte.
- Un câmp trimis cu **aceeași valoare** ca cea curentă → verifică comportamentul documentat de coder în raport (dacă a ales să nu scrie rând de istoric pentru el, dar tot incrementează revizia) — testează exact ce a implementat, nu ce presupui.
- `last_project`/`last_post` cu `null` explicit → acceptat (schema le are nullable).

### 2.3 `createConfigurationVersion`
- Date valide → configurație completă întoarsă, `id` generat, `created_at` = `now()`.
- `profileId` inexistent → **verifică exact ce cod arunci**: brief-ul cerea `code: 'NOT_FOUND'`. Coder-ul a implementat detecția prin regex pe mesajul erorii native SQLite (`/FOREIGN KEY/i.test(e.message)`) — planner a verificat manual, pe această mașină, cu `node:sqlite` (Node 24.19.0): mesajul e exact `"FOREIGN KEY constraint failed"`, deci regex-ul chiar prinde cazul azi. **Scrie testul care confirmă asta explicit** (insert cu `profileId` inexistent → `code: 'NOT_FOUND'`, NU o eroare SQLite brută scăpată neprinsă).
  - **Notă pentru raportul tău, nu pentru un test**: planner a găsit că `node:sqlite` expune și `e.errcode` (valoarea `787` = `SQLITE_CONSTRAINT_FOREIGNKEY`, cod numeric stabil, mai robust decât potrivirea de text pe mesaj). Nu e un defect de reparat acum — regex-ul funcționează azi și `respondProfileError` din `server.js` cade sigur pe 500 dacă vreodată nu s-ar mai potrivi (nu pe un răspuns greșit sau o scurgere de date). Menționează în raport ca observație pentru reviewer, ca decizia „acceptăm azi, revizităm dacă se schimbă" să fie explicită, nu tăcută.
- `harness`/`provider`/`model` lipsă sau goale → `code: 'VALIDATION'`.
- `instructionsRef`/`skillsRef`/`memoryRef` lipsă → acceptate, stocate `null`.
- Configurație creată NU scrie nimic în `profile_history` (istoricul de configurații e tabelul `configuration_versions` însuși, nu un flux de schimbări pe profil).
- Nu există `updateConfigurationVersion` — nu testa asta, confirmă doar (dacă vrei) că modulul nu expune așa ceva.

### 2.4 Citirile
- `getProfile` pe id inexistent → `null` (nu aruncă).
- `listProfiles` — ordine stabilă (`created_at ASC, id ASC`), include profiluri cu orice `approval_state`/`assignable` (nu filtrează).
- `getProfileHistory`/`listConfigurationVersions` pe profil fără istoric/configurații → array gol, nu aruncă.

## 3. Rutele HTTP — cazuri de acoperit

Pentru fiecare rută din tabelul brief-ului (`docs/handoff/RF-02b-coder.md` §3), verifică status + body, cu server real pe port efemer:

- `POST /api/profiles` — 201 + profil complet; 400 pe `name` lipsă.
- `GET /api/profiles` — 200 + listă (creează 2-3 înainte, verifică că apar toate).
- `GET /api/profiles/{id}` — 200 + profil; 404 pe id inexistent.
- `PATCH /api/profiles/{id}` — 200 pe succes; 400 pe `expectedRevision`/`changes` lipsă/invalide; 409 pe conflict de revizie (cu `current` în body); 404 pe id inexistent.
- `GET /api/profiles/{id}/history` — 200 + listă (poate fi goală).
- `POST /api/profiles/{id}/configurations` — 201 + configurație; 404 pe `id` (profil) inexistent; 400 pe câmpuri lipsă.
- `GET /api/profiles/{id}/configurations` — 200 + listă.
- **Metodă neacceptată** pe fiecare cale existentă (ex. `DELETE /api/profiles`, `PUT /api/profiles/{id}`) → 405 cu header `Allow` corect.
- **Cale necunoscută sub `/api/profiles/`** (ex. `/api/profiles/{id}/altceva`, sau prea multe segmente) → 404, nu 500 și nu confundată cu altă rută.
- **`id` cu caractere de control** (ex. `%00`, `\r`, `\n` encodate în URL) → 400, folosind `CONTROL_CHARS` deja existent — verifică că se aplică și aici, nu doar la `/api/open`.
- **Body JSON invalid** pe POST/PATCH → 400 (via `readJsonBody`, deja testat generic — un test minim de confirmare pe una din rutele noi e suficient, nu retesta tot `body.js`).
- **Origine greșită / lipsă pe mutații** (`POST`/`PATCH`) → 403, la fel ca restul API-ului — un test minim, gate-ul e deja al lui RF-01, nu-l retesta exhaustiv aici.

## 4. Deschiderea lazy — un test dedicat

Verifică explicit (poate cu un `dbPath` într-un director care NU există încă) că simpla construcție a serverului (`createServer(...)`, fără nicio cerere) NU creează fișierul bazei de date pe disc — fișierul apare abia după prima cerere reală către `/api/profiles*`. Ăsta e contractul central din brief (§2.1) și cel mai ușor de stricat neobservat.

## 5. Ce NU e un test valid

- Nu slăbi nicio asertare ca să treacă.
- Nu testa `rundll32`/opener real — nu e implicat în acest lot.
- Nu retesta exhaustiv `readJsonBody`/`checkOrigin`/containment static — sunt deja acoperite în alte fișiere de test, un test minim de integrare e suficient aici.

## 6. Fișiere

**Poți crea:** `test/profiles.test.mjs`, `test/server-profiles.test.mjs` (sau extinde `test/server.test.mjs` — decizia ta, motiveaz-o).

**NU atinge:** `profiles.js`, `server.js`, `db.js`, `migrations/**`, `state.js`, `body.js`, `server/http-guards.js`, `public/**`, `package.json`, documentele de coordonare.

## 7. Raportul

`docs/handoff/RF-02b-tester-raport.md`: ce ai testat, ce NU (motivat), observația despre `errcode` vs. regex pentru reviewer, comanda exactă de rulare a întregii suite.

## 8. Constrângeri

- Nu rulezi comenzi. Nu afirma că „acum trece".
- Română.
