# RF-02c — brief tester: sesiuni observate, asociere, conflict I24

**Data:** 15-09-2026, EET.
**Rol:** tester. **Nu rulezi comenzi. Nu afirmi că testele trec.**
**Lot:** RF-02c — `runs.js` + rutele `/api/runs*` + `/api/profiles/{id}/runs`.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Ce ai de testat

Două fișiere, ca la RF-02b:

1. **`test/runs.test.mjs`** — modulul direct, fără HTTP (tipar ca `test/profiles.test.mjs`).
2. **`test/server-runs.test.mjs`** — rutele HTTP, server real pe port efemer (tipar ca `test/server-profiles.test.mjs`).

Citește întâi `docs/handoff/RF-02c-coder.md` și `docs/handoff/RF-02c-coder-raport.md` (deciziile reale ale coder-ului: re-asociere permisă dacă profilul nou e liber, `activeRuns` conține TOATE run-urile active blocante nu doar primul, `observeRun` fără CAS — motivat explicit în cod).

## 2. `runs.js` — cazuri de acoperit

### 2.1 `observeRun` — upsert idempotent
- Sesiune nouă (`sourceHarness`+`nativeId` necunoscute) → `INSERT`, `id` = `` `${sourceHarness}:${nativeId}` ``, `profile_id: null`, `lifecycle: 'unknown'` dacă nu e trimis, `first_observed_at === last_observed_at`.
- Aceeași sesiune observată a doua oară → `UPDATE`, NU `INSERT` nou (verifică `id`-ul rămas identic, un singur rând în tabel). `revision` crește cu 1. `first_observed_at` NESCHIMBAT, `last_observed_at` actualizat.
- A doua observare FĂRĂ `lifecycle` trimis → păstrează `lifecycle`-ul existent (nu-l resetează la `'unknown'`).
- A doua observare FĂRĂ `project` trimis → păstrează `project`-ul existent.
- A doua observare CU `lifecycle` nou → se schimbă.
- **Asociază un profil, apoi observă din nou aceeași sesiune** → `profile_id` rămâne NESCHIMBAT (o observare nu poate desface o asociere).
- `sourceHarness`/`nativeId` lipsă/goale → `VALIDATION`.
- `lifecycle` invalid (ex. `'bla'`) → `VALIDATION`. Toate cele 7 valori valide (`queued`, `running`, `completed`, `failed`, `stopped`, `paused`, `unknown`) acceptate.
- **Nu cere `expectedRevision`** — verifică explicit că `observeRun` NU aruncă dacă nu-l primește (spre deosebire de `associateProfile`).

### 2.2 `associateProfile` — inima lotului (regula I24)
- Asociere validă (run neasociat, profil fără alt run activ, `expectedRevision` corect) → `profile_id` setat, `revision` crescută cu 1.
- `runId` inexistent → `NOT_FOUND`.
- `profileId` inexistent → `NOT_FOUND`.
- `expectedRevision` lipsă/invalid → `VALIDATION`, nimic schimbat.
- `expectedRevision` care nu se potrivește → `CONFLICT` cu `current` = run-ul real; nimic schimbat.
- **Conflict I24, cazul central**: profilul are deja un alt run cu `lifecycle` în `{queued, running, paused}` → `CONFLICT`, cu `activeRuns` = array conținând acel run (sau acele run-uri). Verifică explicit: dacă profilul are 2+ run-uri active deja (stare inconsistentă preexistentă, posibilă dacă cineva a manipulat direct baza), `activeRuns` conține TOATE, nu doar primul.
- Profilul are un run cu `lifecycle: 'completed'` (sau alt lifecycle NON-activ) → asocierea REUȘEȘTE (nu blochează — doar `queued`/`running`/`paused` contează).
- **Re-asociere**: `runId` era deja asociat cu profilul A; asociezi la profilul B, care nu are alt run activ → REUȘEȘTE (verifică că brief-ul/coder-ul chiar permite asta, nu doar presupune).
- Asocierea unui run la ACELAȘI profil pe care-l are deja, cu `expectedRevision` corect → verifică ce se întâmplă (probabil reușește banal, revizia tot crește) — nu era un caz special în brief, testează comportamentul real.
- **Cazul de graniță I24**: `runId` însuși e deja asociat și ACTIV pe profilul X; încerci să-l re-asociezi tot la profilul X (fără schimbare reală) → verifică că filtrul `AND id != runId` din interogarea de conflict exclude corect run-ul însuși (altfel s-ar bloca singur pe sine, ceea ce ar fi greșit).

### 2.3 `dissociateProfile`
- Run asociat → `profile_id: null`, `revision` crescută.
- `runId` inexistent → `NOT_FOUND`.
- `expectedRevision` greșit → `CONFLICT`.
- NU verifică I24 (eliberarea nu poate crea conflict) — nu are caz de blocare de testat aici, doar succesul.

### 2.4 Citirile
- `getRun` pe id inexistent → `null`.
- `listRuns` — toate, ordine stabilă.
- `listRunsForProfile` — doar cele asociate profilului dat, gol dacă niciunul.
- `getActiveRunsForProfile` — doar `queued`/`running`/`paused`, exclude `completed`/`failed`/`stopped`/`unknown`.

## 3. Rutele HTTP — cazuri de acoperit

- `POST /api/runs/observe` — 201 + run complet; 400 pe câmpuri lipsă/invalide.
- `GET /api/runs` — 200 + listă.
- `GET /api/runs/{id}` — 200 + run; 404 pe id inexistent. **Testează cu un `id` real care conține `:`** (ex. `claude-code:abc-123`) — confirmă că rutarea nu se strică pe caracterul special.
- `POST /api/runs/{id}/associate` — 200 pe succes; 400 pe `profileId`/`expectedRevision` lipsă; 404 pe run/profil inexistent; 409 pe conflict I24 (cu `activeRuns` în body) ȘI pe conflict de revizie (cu `current` în body) — **verifică că body-ul de răspuns le distinge** (nu ambele câmpuri prezente simultan, sau documentează dacă da).
- `POST /api/runs/{id}/dissociate` — 200; 400; 404; 409 pe revizie.
- `GET /api/profiles/{id}/runs` — 200 + listă (poate fi goală), montată pe ruta existentă `/api/profiles/{id}` de la RF-02b — verifică că nu a stricat nimic din `/api/profiles/{id}/history` sau `/api/profiles/{id}/configurations` (regresie minimă, un test de fiecare e suficient dacă nu există deja).
- **`POST /api/runs/observe`** cu metodă greșită (`GET /api/runs/observe`) → 405. Verifică explicit — brief-ul semnalează asta ca posibilă coliziune cu un id literal „observe", documentează comportamentul (405, nu tratat ca id).
- Metodă neacceptată pe fiecare cale existentă → 405 cu `Allow`.
- Cale necunoscută sub `/api/runs/` (segmente prea multe, `sub` necunoscut) → 404.
- Body JSON invalid → 400 (test minim, nu retesta `readJsonBody` exhaustiv).
- Origine greșită/lipsă pe mutații → 403 (test minim, gate-ul e deja al lui RF-01).

## 4. Deschiderea lazy și închiderea la `close()`

- Construcția serverului nu creează fișierul bazei (test simetric cu cel de la RF-02b, dacă nu există deja unul comun).
- **Important, din lecția RF-02b-b/c**: verifică explicit că `runsStore` se închide corect la `server.close()`, INDIFERENT dacă serverul a fost pornit prin `startServer()` sau prin `createServer()`+`.listen()`/`.close()` manual — coder-ul a extins wrapper-ul existent (nu a creat unul separat), deci ar trebui să funcționeze din prima, dar verifică-l cu un test, nu presupune.

## 5. Ce NU e un test valid

- Nu slăbi nicio asertare ca să treacă.
- Nu retesta exhaustiv `readJsonBody`/`checkOrigin` — deja acoperite.
- Nu testa integrare reală cu Pi/Claude — nu există în acest lot.

## 6. Fișiere

**Poți crea:** `test/runs.test.mjs`, `test/server-runs.test.mjs`.

**NU atinge:** `runs.js`, `server.js`, `db.js`, `profiles.js`, `migrations/**`, `state.js`, `body.js`, `server/http-guards.js`, `public/**`, `package.json`, documentele de coordonare.

## 7. Raportul

`docs/handoff/RF-02c-tester-raport.md`: ce ai testat, ce NU (motivat), comanda exactă de rulare a întregii suite.

## 8. Constrângeri

- Nu rulezi comenzi. Nu afirma că „acum trece". Română.
