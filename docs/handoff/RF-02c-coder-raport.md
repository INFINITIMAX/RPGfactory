## Ce am implementat

- `migrations/002-sesiuni.sql` (nou) — tabelul `runs`.
- `runs.js` (nou) — modul CRUD (`createRunsStore`) cu upsert idempotent și regula de conflict I24.
- `server.js` (modificat):
  - `require('./runs')`, `runsStore = createRunsStore({ dbPath, migrationsDir, now })` în `createServer`.
  - `respondRunError(res, e)` — traduce codurile din `runs.js` (`VALIDATION`/`NOT_FOUND`/`CONFLICT`) în răspunsuri HTTP, analog cu `respondProfileError`.
  - Rute noi: `POST /api/runs/observe`, `GET /api/runs`, `GET /api/runs/{id}`, `POST /api/runs/{id}/associate`, `POST /api/runs/{id}/dissociate`.
  - Sub-rută nouă `GET /api/profiles/{id}/runs` pe ruta existentă `/api/profiles/{id}` (adăugat `'runs'` în lista de `sub` acceptate, alături de `'history'`/`'configurations'`).
  - Extins wrapper-ul existent de `server.close()` (RF-02b-c) ca să închidă și `runsStore`, plus `server.closeRunsStore` analog cu `server.closeProfilesStore`.

## Schema, explicată

| Coloană | De ce |
|---|---|
| `id TEXT PRIMARY KEY NOT NULL` | RunId namespaced, construit ca `${source_harness}:${native_id}` — nu UUID separat, identitatea nativă+harness e deja unică. `NOT NULL` explicit, aceeași lecție ca la `agent_profiles` (RF-02a): `TEXT PRIMARY KEY` singur acceptă NULL în SQLite. |
| `source_harness TEXT NOT NULL` | Ex. `'claude-code'`, `'pi'`. |
| `native_id TEXT NOT NULL` | Id-ul dat de harness (sessionId Claude, run id Pi). |
| `profile_id TEXT REFERENCES agent_profiles(id)` | Nullable — I38: fără ID explicit, run-ul rămâne neasociat, nu se ghicește. |
| `project TEXT` | cwd/worktree, dacă e cunoscut, nullable. |
| `lifecycle TEXT NOT NULL DEFAULT 'unknown' CHECK (...)` | Doar axa de execuție din spec.md §4 (`queued/running/completed/failed/stopped/paused/unknown`) — nu am amestecat cu alte axe. |
| `first_observed_at`, `last_observed_at` | Prima observare / actualizat la fiecare observare. |
| `created_at`, `updated_at` | Ca la `agent_profiles`. |
| `revision INTEGER NOT NULL DEFAULT 1` | CAS — niciodată `Date.now()`. |
| `UNIQUE (source_harness, native_id)` | Explicit, deși redundant tehnic cu PK-ul construit din ele — face intenția clară pentru cine citește schema fără să deducă formula de construcție a id-ului. |
| `CREATE INDEX idx_runs_profile_id` | Interogări frecvente filtrate după profil (`associateProfile`, `getActiveRunsForProfile`, `listRunsForProfile`), ca la `configuration_versions`/`profile_history`. |

N-am adăugat alte coloane din spec.md §3 (relația de delegare dovedită, referința de deschidere, corelarea de proces) — vin în RF-03.

## De ce observeRun NU are CAS (expectedRevision)

`updateProfile`/`associateProfile` folosesc revizia ca protecție optimistă pentru o schimbare INTENȚIONATĂ (utilizator/planner citește o stare, decide o schimbare, o trimite — revizia detectează dacă starea s-a schimbat între timp). `observeRun` nu e asta: e un flux automat de ingestie ("am văzut din nou sesiunea, cam așa arată acum"), fără citire prealabilă de care apelantul ține cont. Singura sursă care scrie lifecycle-ul de observare pentru un `(source_harness, native_id)` dat e adaptorul respectiv — n-are cum să existe o scriere concurentă „de altundeva" pe care CAS-ul ar trebui s-o prindă. A cere `expectedRevision` la fiecare poll ar transforma un simplu heartbeat într-un protocol cu stare pe partea adaptorului, fără beneficiu. Revizia tot crește la fiecare `observeRun` (e o scriere reală), doar fără verificare la intrare. Documentat și în comentariul din `runs.js`.

## associateProfile — deciziile tale

- **Re-asociere (runId deja legat de alt profil):** am permis-o direct, fără să cer `dissociateProfile` întâi — spec.md interzice explicit doar asocierea la un profil OCUPAT, nu realocarea unui run. Condiția rămâne aceeași: profilul NOU nu trebuie să aibă deja alt run activ. Dacă planner-ul preferă să ceară dissociate explicit înainte de o realocare, e o restricție suplimentară, nu una cerută de brief — am notat decizia aici ca să poată fi revizuită.
- **Semnalul de conflict I24:** `CONFLICT` (cod `e.code = 'CONFLICT'`, HTTP 409), cu `e.activeRuns` = array cu TOATE run-urile active (`queued`/`running`/`paused`) găsite deja pe profilul țintă, altele decât run-ul curent — nu doar primul (I24: „păstrează dovezile și semnalează conflictul", nu ascunde execuții suplimentare). Mesajul include numărul de execuții active găsite.
- Am păstrat separat conflictul de CAS (revizie neconcordantă) — tot `CONFLICT`/409, dar cu `e.current` (rândul curent), la fel ca la `updateProfile`. `respondRunError` din `server.js` trimite mai departe ambele câmpuri (`current`/`activeRuns`), oricare dintre ele fiind prezent, fără să presupună care anume.
- FK pe `profileId` inexistent → `NOT_FOUND`, verificat direct printr-un `SELECT` (nu prin regex pe mesajul erorii native SQLite, ca la `createConfigurationVersion` din RF-02b) — mi s-a părut mai solid, verificarea explicită e oricum necesară înainte de query-ul de conflict I24.

## Închiderea runsStore la close()

Am extins EXACT wrapper-ul existent din RF-02b-c (`const nativeClose = server.close.bind(server); server.close = (callback) => nativeClose((err) => { profilesStore.close(); ... })`) — am adăugat `runsStore.close();` în același callback, lângă `profilesStore.close();`. Nu am creat un al doilea wrapper. Am adăugat și `server.closeRunsStore = runsStore.close;`, analog cu `server.closeProfilesStore` deja existent. Am actualizat comentariul din `startServer` care menționa doar "baza de profiluri" ca să reflecte că închide ambele store-uri.

## Decizii pe care le-am luat singur

1. Ruta `POST /api/runs/observe` e verificată explicit ÎNAINTE de rutarea pe `id` (segments.length===3 && segments[2]==='observe'), ca să nu depindă de coincidența cu un run al cărui `id` construit ar fi literal `"observe"` (posibil doar dacă `source_harness:native_id` produce exact acest șir, improbabil dar teoretic posibil — am ales precedența explicită în loc să presupun că nu se întâmplă).
2. `getActiveRunsForProfile` e folosită intern de `associateProfile` cu interogare SQL directă (nu am rechemat funcția publică, ca să rămân în aceeași tranzacție `BEGIN`/`COMMIT` — apelarea funcției publice ar fi deschis un query în afara tranzacției curente, tehnic tot corect dar mai puțin clar ca intenție).
3. `respondRunError` e o funcție separată de `respondProfileError`, nu am generalizat una comună — ambele traduc coduri identice, dar câmpurile extra diferă (`current` vs `current`+`activeRuns`); am preferat claritate față de o abstractizare prematură pe care nu mi-a cerut-o brief-ul.

## Ce nu am făcut și de ce

- Nu am adăugat parametru de „forțează asocierea" — explicit interzis în §4 din brief.
- Nu am atins `db.js`, `profiles.js`, `state.js`, `body.js`, `http-guards.js` sau alte fișiere din lista „NU atinge".
- Nu am scris teste.
- Nu am adăugat alte axe de stare (activitate/atenție/prospețime) — doar `lifecycle`.
- Nu am creat UI.

## Riscuri pentru tester

- Verifică `observeRun` idempotent: apel repetat cu același `(sourceHarness, nativeId)` incrementează `revision`, actualizează `last_observed_at`, dar NU schimbă `profile_id` și NU resetează `lifecycle`/`project` la lipsă dacă acestea lipsesc din apelul nou.
- Verifică I24 cu 2+ run-uri active pe același profil deja existente în date (inserate direct, nu prin `associateProfile`) — `getActiveRunsForProfile` trebuie să le întoarcă pe toate.
- Verifică ruta `/api/runs/{id}` cu un `id` care conține `:` (ex. `claude-code:abc-123`) — parsarea pe `pathname.split('/')` ar trebui să funcționeze corect, dar merită un test explicit cum cere brief-ul.
- Verifică precedența `/api/runs/observe` față de un run ipotetic cu `id === 'observe'` (deși improbabil practic) — comportamentul e documentat mai sus ca decizie a mea, nu ca literă de brief.
- Verifică 409 la `associate` cu `expectedRevision` greșit (conflict CAS, cu `current`) vs 409 cu profil ocupat (conflict I24, cu `activeRuns`) — sunt două cazuri distincte, ambele `CONFLICT`/409, dar cu payload diferit.
- Verifică re-asociere (run trecut de la profilul A la profilul B) — decizia mea a fost s-o permit dacă B e liber; dacă planner-ul vrea altă regulă, ajustarea e în `associateProfile`.
- `respondRunError` returnează `current: null, activeRuns: null` pentru orice CONFLICT care nu are unul dintre cele două — verifică că testele nu presupun ambele mereu populate simultan.

## Contradicții găsite în brief

Niciuna.
