# RF-02b — brief coder: profiluri + configurații versionate, cu API

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Lot:** RF-02b — modul CRUD peste schema RF-02a, expus prin API HTTP.
**Autorizat:** RF-02a închis (`docs/handoff/RF-02a-reviewer-raport.md`), gate G4b acoperă și acest lot (același model canonic).

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Sarcina

RF-02a a construit schema (`agent_profiles`, `configuration_versions`, `profile_history`) și modulul care o deschide (`db.js`). **Nimic din ea nu e conectat la server încă.** Tu construiești stratul care face schema utilizabilă:

1. **`profiles.js`** — modul cu funcții CRUD peste `db.js`, injectabil, fără efecte secundare la `require`.
2. **Rute noi în `server.js`** — expun acele funcții prin HTTP, sub `/api/profiles`.

## 2. Contractele

Decizii de planner. Dacă vreuna ți se pare greșită, implementeaz-o și spune în raport.

### 2.1 `profiles.js` — API-ul modulului

```js
function createProfilesStore(options = {}) -> {
  createProfile({ name, primarySpecialization }) -> profil complet (inclusiv id, revision=1)
  getProfile(id) -> profil sau null
  listProfiles() -> profil[]
  updateProfile(id, { expectedRevision, changes }) -> profil actualizat | aruncă/semnalează conflict
  getProfileHistory(id) -> rând[]
  createConfigurationVersion(profileId, { harness, provider, model, instructionsRef, skillsRef, memoryRef }) -> configurație completă
  listConfigurationVersions(profileId) -> configurație[]
  close()
}

module.exports = { createProfilesStore };
```

`options`:

| Opțiune | Implicit | Rol |
|---|---|---|
| `dbPath` | vine din `db.js` (`path.join(__dirname, 'data', 'rpgfactory.db')`) | Injectabil, ca la `db.js`/`state.js`. |
| `migrationsDir` | vine din `db.js` (`MIGRATIONS_DIR`) | Injectabil. |
| `now` | `() => Date.now()` | Ceas injectabil. |

**Regula RF-01/RF-02a se aplică identic aici:** `createProfilesStore(options)` NU deschide baza de date la apel. Deschide-o **lazy**, la prima funcție care chiar are nevoie de ea (memoizat — o singură deschidere, refolosită la apelurile următoare). Motivul: `server.js` cheamă `createProfilesStore(...)` din interiorul `createServer(...)`, care la rândul lui nu are voie să atingă discul până la o cerere reală (`createStateStore` face deja exact asta pentru `state.js` — uită-te cum, înainte de a scrie).

`close()` închide handle-ul, dacă a fost vreodată deschis (dacă nu, nu face nimic).

### 2.2 `createProfile`

- `id`: generat de modul (`crypto.randomUUID()` — în `node:crypto`, nicio dependență nouă), NICIODATĂ trimis de apelant.
- `name`: string, obligatoriu, nevid după `trim()`.
- `primarySpecialization`: opțional; dacă lipsește, folosește implicitul din schemă (`''`).
- `approval_state`, `assignable`, `revision`: rămân pe implicitul din schemă (`proposed`, `0`, `1`) — nu le seta explicit din acest apel, nu există parametru pentru ele aici (se schimbă doar prin `updateProfile`, mai jos — I26: planner-ul propune, Lucian aprobă, printr-o acțiune separată).
- `created_at`/`updated_at`: `now()`.
- Scrie un rând în `profile_history` pentru creație (`field: 'created'`, `old_value: null`, `new_value: name`) — I27/I35 cer ca evoluția unui profil să se poată vedea de la început, nu doar de la prima modificare.
- Întoarce profilul complet (toate coloanele), nu doar id-ul.

### 2.3 `updateProfile(id, { expectedRevision, changes })`

Singurul mod de a schimba un profil existent — inclusiv aprobare și eligibilitate. Nu există funcții separate `approveProfile`/`setAssignable`; sunt cazuri particulare ale acestui apel (`changes: { approval_state: 'approved' }`, `changes: { assignable: 1 }`).

- **`expectedRevision` e obligatoriu, întotdeauna.** Nu există un mod de „scrie necondiționat" — spre deosebire de `state.js` (unde `baseUpdatedAt=0` însemna „primă scriere"), aici un profil există dintotdeauna cu `revision=1`, deci nu există stare „nescrisă" de tratat special. Un apel fără `expectedRevision` e o cerere invalidă (400 la nivel de server — nu ajunge la tine ca `undefined` tăcut).
- Dacă `expectedRevision` nu se potrivește cu revizia curentă din bază: **nu scrie nimic**, semnalează conflictul apelantului (decide cum — excepție tipizată, obiect `{ conflict: true, current: ... }`, orice poți documenta clar; server.js îl traduce în `409`).
- `changes` e un obiect cu una sau mai multe din: `name`, `primary_specialization`, `approval_state`, `assignable`, `last_project`, `last_post`. **Orice altă cheie e respinsă** (identitatea `id`, `created_at`, `revision` nu se schimbă niciodată prin acest apel) — validează tu în modul, nu doar în server, ca modulul să fie sigur folosit și direct.
- `approval_state`, dacă apare în `changes`, trebuie să fie `'proposed'` sau `'approved'` — orice altceva respins înainte de a atinge baza (constrângerea `CHECK` din schemă oricum ar respinge-o, dar un mesaj clar de la tine e mai util decât eroarea nativă SQLite).
- `assignable`, dacă apare, trebuie să fie `0`/`1` (sau `true`/`false` — decide și documentează conversia).
- **Actualizare + incrementare revizie, într-o singură instrucțiune SQL, sub tranzacție** (ca la RF-02a: `UPDATE ... SET ..., revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?`), verificând `changes.length` din `run()` — dacă e 0, nimic nu s-a potrivit (fie id-ul nu există, fie revizia nu se potrivește; distinge cele două cazuri cu un `SELECT` separat doar dacă chiar contează pentru apelant, altfel un singur cod de conflict e suficient, documentează alegerea).
- **Un rând în `profile_history` per câmp schimbat efectiv** (nu unul singur cu tot obiectul) — dacă `changes = { approval_state: 'approved', assignable: 1 }`, sunt DOUĂ rânduri în `profile_history`, fiecare cu `field`/`old_value`/`new_value` proprii. Valoarea veche vine din rândul citit înainte de update (în aceeași tranzacție).
- Dacă un câmp din `changes` are aceeași valoare ca cea curentă (nicio schimbare reală), decide dacă tot scrii un rând de istoric sau nu — documentează alegerea, nu e dictată.

### 2.4 `createConfigurationVersion(profileId, {...})`

- `id`: generat de modul, ca la profil.
- `profileId` trebuie să existe — `FOREIGN KEY` din schemă oricum respinge inserția dacă nu există, dar prinde tu eroarea SQLite și transform-o într-un rezultat clar (nu lăsa o eroare nativă SQLite să iasă neschimbată din modul — server.js trebuie să poată răspunde 404, nu 500).
- `harness`, `provider`, `model`: string, obligatorii.
- `instructionsRef`, `skillsRef`, `memoryRef`: opționale (nullable în schemă).
- **Interdicție absolută, ca la RF-02a**: acestea sunt referințe/digesturi, nu conținut. Modulul nu poate valida semantic ce trimite apelantul, dar pune un comentariu explicit lângă funcție care repetă interdicția, ca oricine adaugă un apelator nou să știe.
- **Imutabil** — nu există `updateConfigurationVersion`. O schimbare de configurație înseamnă o versiune nouă (I39).
- Nu scrie în `profile_history` pentru asta — istoricul de configurații e `configuration_versions` însuși (fiecare rând e un „moment"), nu o schimbare de câmp pe profil.

### 2.5 Citirile

`getProfile`, `listProfiles`, `getProfileHistory`, `listConfigurationVersions` — simple, fără efecte secundare. `listProfiles()` întoarce TOATE profilurile, fără filtrare/paginare (HUD-ul care va avea nevoie de filtrare vine în RF-04 — nu construi asta acum, ar fi cod nefolosit).

## 3. Rutele HTTP în `server.js`

`server.js` nu are router — rutarea e pe `pathname` exact. Pentru `/api/profiles/{id}` ai nevoie de un pic de parsare (`pathname.split('/')`), nu de o bibliotecă nouă.

| Metodă | Cale | Acțiune |
|---|---|---|
| `POST` | `/api/profiles` | `createProfile` |
| `GET` | `/api/profiles` | `listProfiles` |
| `GET` | `/api/profiles/{id}` | `getProfile` — 404 dacă nu există |
| `PATCH` | `/api/profiles/{id}` | `updateProfile` — 400 dacă lipsește `expectedRevision` sau `changes` gol/invalid, 409 la conflict de revizie, 404 dacă id-ul nu există |
| `GET` | `/api/profiles/{id}/history` | `getProfileHistory` |
| `POST` | `/api/profiles/{id}/configurations` | `createConfigurationVersion` |
| `GET` | `/api/profiles/{id}/configurations` | `listConfigurationVersions` |

Toate sub `/api/` — deja acoperite de gate-ul Host/Origin existent (`checkOrigin`, linia ~129) și de containment-ul care nu se aplică aici (nu sunt fișiere statice). Nu adăuga verificări duplicate.

Body-ul cererilor POST/PATCH se citește cu `readJsonBody(req, res, callback)` din `body.js`, exact ca la `/api/open`/`/api/reveal` — nu reimplementa citirea/limita de dimensiune.

`createServer(options)` primește acum și `dbPath`/`migrationsDir` (opționale, trec direct la `createProfilesStore`), și construiește `profilesStore = createProfilesStore({ dbPath: options.dbPath, migrationsDir: options.migrationsDir, now })` — o singură dată, la construcție (dar, conform §2.1, asta NU deschide baza — doar pregătește closure-ul care o va deschide lazy).

Validare la nivelul rutei (înainte de a chema modulul):
- `id` din URL trebuie să arate ca un UUID plauzibil sau cel puțin să nu conțină caractere de control (aceeași grijă ca la `sessionId` în `/api/open` — `CONTROL_CHARS`, deja definit în `server.js`, refolosește-l).
- Body JSON invalid → 400 (deja tratat de `readJsonBody`).
- Metodă neacceptată pe o cale existentă → 405 cu `Allow`, ca la rutele existente.

## 4. Ce NU face acest lot

- **Nu asocia sesiuni reale la profiluri.** Asta e RF-02c, explicit.
- **Nu atinge `data/state.json` sau `state.js`.**
- **Nu creezi UI.** Rutele sunt API pur, fără nimic în `public/`.
- **Nu adăuga competențe/niveluri, Run, Task, Evidence, UsageSample.** Vin în loturile lor (spec.md §3).
- **Nu filtra/pagina `listProfiles`** — vezi §2.5.

## 5. Fișiere

**Poți crea:** `profiles.js`.

**Poți modifica:** `server.js` (rutele noi + wiring-ul `profilesStore`, minimal — nu restructura rutele existente).

**NU atinge:** `db.js`, `migrations/**`, `state.js`, `body.js`, `server/http-guards.js`, `status.js`, `rank.js`, `public/**`, `test/**`, `package.json`, `data/`, `.env`, `assets/`, documentele de coordonare.

## 6. Raportul

`docs/handoff/RF-02b-coder-raport.md`:

```
## Ce am implementat
profiles.js + rutele din server.js.

## Deschiderea lazy a bazei
Cum ai implementat memoizarea, unde ai verificat că createServer(...) tot nu atinge discul la construcție.

## updateProfile — deciziile tale
Cum distingi "id inexistent" de "revizie greșită" (dacă le distingi), ce faci la o schimbare fără efect real, cum arată semnalul de conflict întors din modul.

## Rutele — coduri de status exacte
Pentru fiecare rută, ce coduri întoarce în ce condiții (succes, validare, 404, 409, 405).

## Decizii pe care le-am luat singur

## Ce nu am făcut și de ce

## Riscuri pentru tester

## Contradicții găsite în brief
Dacă niciuna, scrie „niciuna".
```

## 7. Constrângeri

- Nu rulezi comenzi. Nu scrii teste. Nu afirma că ceva „funcționează".
- Nu delega. Română, în cod, comentarii și raport.

### Citește înainte

1. `db.js` și `migrations/001-profiluri.sql` — schema exactă peste care lucrezi
2. `state.js` — cum arată `createStateStore`, ca model pentru deschiderea lazy și pentru CAS (`baseUpdatedAt`) — dar NU copia ambiguitatea `base=0`, aici nu există (vezi §2.3)
3. `server.js` — rutele existente (`/api/open`, `/api/reveal`), pentru tipar de validare/răspuns
4. `body.js` — cum se citește body-ul, ca să nu reimplementezi
5. `docs/DECISIONS.md` — I26, I27, I38, I39
