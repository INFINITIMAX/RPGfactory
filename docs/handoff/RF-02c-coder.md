# RF-02c — brief coder: sesiuni observate, asociere explicită, conflict de execuție

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Lot:** RF-02c — al treilea și ultimul lot din RF-02 (model canonic).
**Autorizat:** RF-02a + RF-02b închise, gate G4b acoperă și acest lot.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Sarcina

RF-02a a construit schema de profiluri. RF-02b a făcut-o utilizabilă prin API. **Nici profilul, nici configurația nu știu încă ce sesiune reală rulează sub ele.** Tu construiești entitatea `Run` (spec.md §3): o sesiune observată — dintr-un harness oarecare, cu identitate nativă a ei, opțional legată de un profil, cu propria stare (lifecycle).

**Important, ca să nu extinzi scopul din greșeală**: acest lot NU citește nimic real din Pi sau Claude Code. Nu există încă niciun adaptor care sună `observeRun(...)` automat — asta e RF-03. Aici construiești DOAR mecanismul: schema, modulul, API-ul. Testele/verificarea vor apela `observeRun` cu date sintetice, ca și cum ar veni de la un adaptor viitor.

Trei livrabile:

1. **Migrația `002-sesiuni.sql`** — tabelul `runs`.
2. **`runs.js`** — modul CRUD, cu regula de conflict de execuție.
3. **Rute noi în `server.js`**, sub `/api/runs` + o rută sub `/api/profiles/{id}/runs`.

## 2. Contractele

### 2.1 Migrația — `runs`

| Coloană | Tip/constrângere | De ce |
|---|---|---|
| `id` | `TEXT PRIMARY KEY NOT NULL` | **RunId namespaced** (spec.md §3): construiește-l ca `` `${source_harness}:${native_id}` `` — nu genera UUID separat, identitatea nativă + harness-ul sunt deja unice împreună. NOT NULL explicit, ca la RF-02a (lecția e deja documentată acolo — repet-o aici, nu doar copia mecanic). |
| `source_harness` | `TEXT NOT NULL` | Ex. `'claude-code'`, `'pi'`. |
| `native_id` | `TEXT NOT NULL` | Id-ul sesiunii AȘA CUM îl dă harness-ul (sessionId Claude, run id Pi). |
| `profile_id` | `TEXT REFERENCES agent_profiles(id)` | **Nullable** — I38: fără ID explicit, sesiunea rămâne neasociată. NU se ghicește din nume/model/cwd. |
| `project` | `TEXT`, nullable | cwd/worktree, dacă e cunoscut. |
| `lifecycle` | `TEXT NOT NULL DEFAULT 'unknown' CHECK (lifecycle IN ('queued','running','completed','failed','stopped','paused','unknown'))` | Axa de lifecycle din spec.md §4 — DOAR asta, nu amesteca cu activitate/atenție/prospețime (alte axe, alte loturi). |
| `first_observed_at` | `INTEGER NOT NULL` | Prima dată când a fost văzută. |
| `last_observed_at` | `INTEGER NOT NULL` | Actualizat la fiecare observare nouă. |
| `created_at`, `updated_at` | `INTEGER NOT NULL` | Ca la `agent_profiles`. |
| `revision` | `INTEGER NOT NULL DEFAULT 1` | CAS, exact ca la `agent_profiles` — RF-01/RF-02a: niciodată `Date.now()`. |

`UNIQUE (source_harness, native_id)` — o sesiune nativă nu poate exista de două ori (chiar dacă tehnic `id`-ul construit din ele e deja unic prin PRIMARY KEY, pune și constrângerea explicit, ca intenția să fie clară pentru cine citește schema fără să deducă din formula de construcție a id-ului).

Index pe `profile_id`, ca la `configuration_versions`/`profile_history` (interogări frecvente filtrate după profil).

**Nu adăuga alte coloane din spec.md §3 (Run)** — `runId namespaced` (acoperit de `id`), `sourceHarness`/`native id`/`profil opțional`/`proiect` (acoperite mai sus). Relația de delegare dovedită, referința de deschidere (`open`) și corelarea de proces vin în loturi ulterioare (RF-03), nu le crea acum ca să nu rămână coloane nefolosite.

### 2.2 `runs.js` — API-ul modulului

```js
function createRunsStore(options = {}) -> {
  observeRun({ sourceHarness, nativeId, project, lifecycle }) -> run complet
  associateProfile(runId, { profileId, expectedRevision }) -> run actualizat | CONFLICT/NOT_FOUND
  dissociateProfile(runId, { expectedRevision }) -> run actualizat | NOT_FOUND
  getRun(id) -> run sau null
  listRuns() -> run[]
  listRunsForProfile(profileId) -> run[]
  getActiveRunsForProfile(profileId) -> run[] (lifecycle în {queued, running, paused})
  close()
}
```

`options`: `dbPath`, `migrationsDir`, `now` — identic cu `profiles.js` (injectabile, deschidere **lazy** memoizată, ACEEAȘI regulă: construcția nu atinge discul).

**Poți refolosi handle-ul de bază cu `profiles.js`?** Nu — fiecare modul își deschide propriul handle lazy, independent (ca și `profiles.js` față de `db.js`). E ok să existe două handle-uri SQLite deschise simultan pe același fișier (WAL permite asta, deja configurat la RF-02a) — nu încerca să partajezi un singur handle între module, ar complica inutil ownership-ul la închidere (lecția RF-02b-b/c: fiecare cine deschide, răspunde de închidere).

### 2.3 `observeRun` — upsert idempotent

- Dacă `(source_harness, native_id)` NU există încă: `INSERT`, cu `id` construit din formula de mai sus, `profile_id = NULL`, `first_observed_at = last_observed_at = now()`, `lifecycle` = valoarea primită sau `'unknown'` dacă lipsește.
- Dacă EXISTĂ deja: `UPDATE` — `last_observed_at = now()`, `lifecycle` = valoarea nouă dacă a fost trimisă (dacă `lifecycle` lipsește din apel, păstrează valoarea existentă, nu o suprascrie cu `'unknown'`), `project` la fel (actualizează doar dacă vine, păstrează dacă lipsește). **NU atinge `profile_id`** — o observare nouă nu poate desface o asociere existentă.
- Incrementează `revision` la fiecare observare (fie insert, fie update) — chiar dacă e o simplă „am văzut-o din nou", tot e o scriere.
- **Nu cere `expectedRevision` la `observeRun`** — spre deosebire de `updateProfile`, aici NU e o schimbare intenționată de utilizator, e un flux automat de ingestie (viitorul adaptor RF-03 va chema asta la fiecare poll) — nu are sens ca un adaptor să țină evidența reviziei doar ca să poată raporta ce a văzut deja. Documentează explicit în cod DE CE `observeRun` nu are CAS, ca să nu pară o inconsecvență față de `updateProfile`/`associateProfile`.
- `harness`/`nativeId` obligatorii, nevide. `lifecycle`, dacă e trimis, trebuie să fie una din cele 7 valori valide.

### 2.4 `associateProfile(runId, { profileId, expectedRevision })` — regula I24

**Citește I24 exact** (`docs/DECISIONS.md`): *„o execuție activă per specialist global — taskurile suplimentare așteaptă sau merg la alt specialist; vizualizatorul nu oprește singur procese."* Și spec.md §3 (Run): *„Asocierea manuală la un profil deja ocupat se refuză cu explicație/409."*

- `expectedRevision` obligatoriu (CAS pe rândul `runs`, ca la `updateProfile`).
- `runId` trebuie să existe → altfel `NOT_FOUND`.
- `profileId` trebuie să existe (FK) → dacă nu, `NOT_FOUND` (ca la `createConfigurationVersion` din RF-02b — verifică cum a tratat coder-ul acolo eroarea FK, fii consecvent, dar NU copia mecanismul fragil de regex pe mesaj dacă găsești o cale mai solidă; dacă nu, e acceptabil, e deja o decizie documentată la RF-02b).
- **Înainte de a asocia**: verifică dacă `profileId` are deja alt run cu `lifecycle` în `{queued, running, paused}` ȘI `id !== runId` (adică deja ocupat de ALTĂ sesiune activă). Dacă da → **`CONFLICT` (409)**, cu lista run-urilor active care blochează, **refuză asocierea, nu o forța**. Nu există parametru de „forțează oricum" în acest lot — dacă planner-ul are nevoie mai târziu de o cale de override explicit, e o decizie separată, nu o introduce singur acum.
- Dacă `runId` însuși e deja asociat cu ALT profil (re-asociere) — decide ce faci (permite schimbarea, sau cere mai întâi dissociate?) și documentează alegerea în raport; nu era dictat explicit, dar spec.md nu interzice o realocare, doar cere ca asocierea la un profil OCUPAT să fie refuzată — deci cazul „acest run trece de la profilul A la profilul B" e permis DACĂ profilul B nu are deja alt run activ.
- La succes: `profile_id = profileId`, `revision += 1`, `updated_at = now()`.

### 2.5 `dissociateProfile(runId, { expectedRevision })`

Simetric: `profile_id = NULL`. `NOT_FOUND` dacă `runId` nu există. CAS ca mai sus. Nu verifică nimic legat de I24 (eliberarea unui profil nu poate crea conflict, doar rezolva unul).

### 2.6 `getActiveRunsForProfile(profileId)`

Citire simplă: toate rândurile din `runs` cu `profile_id = profileId` și `lifecycle IN ('queued','running','paused')`. Folosită de `associateProfile` intern, dar expune-o și public — utilă mai târziu pentru HUD (RF-04) și pentru a detecta manual un conflict deja existent în date (I24: *„observatorul nu ascunde execuții care încalcă regula: păstrează dovezile și semnalează conflictul"* — dacă cineva a ajuns cumva să aibă 2+ run-uri active pe același profil, funcția asta trebuie să le arate PE AMÂNDOUĂ, nu doar prima găsită).

### 2.7 Citirile simple

`getRun`, `listRuns`, `listRunsForProfile` — fără efecte secundare, fără filtrare/paginare (ca la `listProfiles` din RF-02b — HUD-ul care va avea nevoie de filtrare vine la RF-04).

## 3. Rutele HTTP în `server.js`

Același tipar ca la RF-02b (parsare manuală de `pathname`, fără router nou).

| Metodă | Cale | Acțiune |
|---|---|---|
| `POST` | `/api/runs/observe` | `observeRun` — body `{sourceHarness, nativeId, project, lifecycle}` |
| `GET` | `/api/runs` | `listRuns` |
| `GET` | `/api/runs/{id}` | `getRun` — 404 dacă nu există |
| `POST` | `/api/runs/{id}/associate` | `associateProfile` — body `{profileId, expectedRevision}`, 409 la conflict I24, 404 dacă `id` sau `profileId` nu există |
| `POST` | `/api/runs/{id}/dissociate` | `dissociateProfile` — body `{expectedRevision}` |
| `GET` | `/api/profiles/{id}/runs` | `listRunsForProfile` — sub-rută nouă pe ruta EXISTENTĂ `/api/profiles/{id}`, analog cu `/api/profiles/{id}/configurations` de la RF-02b |

`id`-ul din `/api/runs/{id}` poate conține `:` (formula `harness:nativeId`) — verifică dacă parsarea pe `pathname.split('/')` se comportă corect cu asta (un `:` NU e un separator de cale, deci ar trebui să fie inofensiv, dar verifică explicit, nu presupune).

Toate sub `/api/` — deja acoperite de gate-ul Host/Origin existent, nu adăuga verificări duplicate. Body citit cu `readJsonBody`, ca la RF-02b.

`createServer(options)` construiește și `runsStore = createRunsStore({ dbPath: options.dbPath, migrationsDir: options.migrationsDir, now })`, o singură dată — **și trebuie închis la `close()`, ca la `profilesStore`**. Nu repeta greșeala de la RF-02b-b: de data asta, de la început, atașează închiderea lui `runsStore` în ACELAȘI loc unde `server.close` e deja înfășurat pentru `profilesStore` (RF-02b-c) — extinde wrapper-ul existent, nu crea altul paralel.

## 4. Ce NU face acest lot

- **Nu citește nimic real din Pi/Claude Code.** `observeRun` e chemat doar din teste/API, cu date sintetice. RF-03 conectează un adaptor real.
- **Nu adaugă un parametru de „forțează asocierea".**
- **Nu creează UI.**
- **Nu adaugă alte axe de stare** (activitate, atenție, prospețime din spec.md §4) — doar `lifecycle`.

## 5. Fișiere

**Poți crea:** `migrations/002-sesiuni.sql`, `runs.js`.

**Poți modifica:** `server.js` (rutele noi + wiring `runsStore`, inclusiv extinderea wrapper-ului de `close()`).

**NU atinge:** `db.js`, `migrations/001-profiluri.sql`, `profiles.js`, `state.js`, `body.js`, `server/http-guards.js`, `status.js`, `rank.js`, `public/**`, `test/**`, `package.json`, `data/`, `.env`, `assets/`, documentele de coordonare.

## 6. Raportul

`docs/handoff/RF-02c-coder-raport.md`:

```
## Ce am implementat
Migrația runs.js + rutele din server.js.

## Schema, explicată
Fiecare coloană, constrângere, de ce.

## De ce observeRun NU are CAS (expectedRevision)
Documentează explicit raționamentul din §2.3.

## associateProfile — deciziile tale
Ce faci la re-asociere (runId deja asociat cu alt profil). Cum arată exact semnalul de conflict I24 întors (ce conține, ce coduri de eroare).

## Închiderea runsStore la close()
Cum ai extins wrapper-ul existent din RF-02b-c, nu creat altul.

## Decizii pe care le-am luat singur

## Ce nu am făcut și de ce

## Riscuri pentru tester

## Contradicții găsite în brief
Dacă niciuna, scrie „niciuna".
```

## 7. Constrângeri

- Nu rulezi comenzi. Nu scrii teste. Nu afirma că ceva „funcționează".
- Nu delega. Română, în cod, comentarii SQL și raport.

### Citește înainte

1. `profiles.js` și `server.js` (secțiunea `/api/profiles*`) — tiparul exact de urmat, inclusiv wrapper-ul de `close()` de la RF-02b-c
2. `migrations/001-profiluri.sql` — stilul de comentarii/constrângeri așteptat
3. `spec.md` §3 (Run) și §4 (stări fără contradicții — DOAR axa lifecycle e relevantă aici)
4. `docs/DECISIONS.md` — I24, I25, I38 (citate deja mai sus, dar citește-le integral în context)
