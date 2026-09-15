## Ce am testat

### `test/runs.test.mjs` (modulul `runs.js`, direct, fără HTTP)

Tipar ca `test/profiles.test.mjs`: fiecare test cu store propriu (`':memory:'` sau director temporar), `now` injectat. Pentru cazurile care au nevoie de un profil real (FK din `runs.profile_id`), am folosit `makeSharedStores(dir)` — `createProfilesStore` și `createRunsStore` pe ACELAȘI fișier pe disc (pe `':memory:'` fiecare handle e o bază separată, izolată; FK-ul n-ar găsi profilul).

- **`observeRun` upsert idempotent**: insert cu `id = harness:nativeId`, `profile_id null`, `lifecycle unknown` implicit, `first=last observed`; a doua observare face UPDATE (nu INSERT nou, un singur rând, `revision +1`); `first_observed_at` neschimbat / `last_observed_at` actualizat; lipsa `lifecycle`/`project` la a doua observare păstrează valoarea existentă; `lifecycle` nou se aplică; o asociere existentă supraviețuiește unei observări noi.
- Validări `observeRun`: `sourceHarness`/`nativeId` lipsă/goale → `VALIDATION`; `lifecycle` invalid → `VALIDATION`; toate cele 7 valori acceptate; **`observeRun` NU aruncă fără `expectedRevision`** (test explicit, `assert.doesNotThrow`).
- **`associateProfile` (I24)**: succes (revision+1); `NOT_FOUND` pe `runId`/`profileId` inexistent; `VALIDATION` pe `expectedRevision` lipsă/non-număr/non-întreg/zero (cu verificare că nimic nu s-a schimbat în bază); `CONFLICT` cu `e.current` pe revizie greșită; **conflict I24 cu un singur run activ blocant** (`activeRuns` conține exact acel run); **conflict I24 cu 2+ run-uri active preexistente** — simulat prin manipulare directă SQL (`DatabaseSync` pe fișierul comun) după ce am asociat două run-uri cât timp erau `completed` (non-active, deci I24 nu bloca), apoi le-am promovat direct la `running` ocolind `associateProfile` — verificat că `activeRuns.length === 2`, ambele id-uri prezente; run cu `lifecycle: 'completed'` NU blochează; re-asociere de la profilul A la B liber → reușește; re-asociere la B blocat de alt run activ → `CONFLICT`, run-ul rămâne pe A; asociere la ACELAȘI profil deja deținut → reușește, revizia crește; **cazul de graniță**: run activ pe profilul X, re-asociat tot la X → filtrul `id != runId` îl exclude, nu se blochează singur.
- **`dissociateProfile`**: succes (`profile_id null`, revision+1); `NOT_FOUND`; `CONFLICT` pe revizie greșită.
- **Citirile**: `getRun` inexistent → `null`; `listRuns` ordine stabilă; `listRunsForProfile` filtrează corect, gol dacă niciunul; `getActiveRunsForProfile` — parcurge toate cele 7 lifecycle succesiv pe același run (prin `observeRun`, care nu verifică I24) și confirmă exact care sunt considerate active (`queued`/`running`/`paused`) și care nu.
- **Deschidere lazy**: `createRunsStore(...)` fără niciun apel nu atinge discul; prima operație reală creează fișierul.

### `test/server-runs.test.mjs` (rutele HTTP, server real pe port efemer)

Tipar ca `test/server-profiles.test.mjs`.

- `POST /api/runs/observe`: 201 + run complet; 400 pe câmp lipsă și pe `lifecycle` invalid; **`GET /api/runs/observe` → 405** cu `Allow: POST` (confirmă că nu e tratat ca `id` literal).
- `GET /api/runs`: 200 + listă.
- `GET /api/runs/{id}`: 200 pentru un id care conține efectiv `:` (`claude-code:abc-123`), verificat explicit; 404 pe id inexistent.
- `POST /api/runs/{id}/associate`: 200 succes; 400 pe `profileId`/`expectedRevision` lipsă; 404 pe run/profil inexistent; **409 pe conflict CAS cu `current` populat și `activeRuns: null`**; **409 pe conflict I24 cu `activeRuns` populat și `current: null`** — verificat explicit că body-ul le distinge (nu ambele simultan).
- `POST /api/runs/{id}/dissociate`: 200; 400; 404; 409 pe revizie.
- `GET /api/profiles/{id}/runs`: 200 + listă goală / cu run-ul asociat; **regresie**: `GET /api/profiles/{id}/history` și `GET /api/profiles/{id}/configurations` tot funcționează după adăugarea sub-rutei `runs`.
- 405 cu `Allow` corect pe fiecare cale: `DELETE /api/runs`, `POST /api/runs/{id}`, `GET /api/runs/{id}/associate`, `GET /api/runs/{id}/dissociate`, `POST /api/profiles/{id}/runs`.
- 404 pe cale necunoscută sub `/api/runs/`: sub necunoscut și prea multe segmente.
- Body JSON invalid → 400 (test minim). Origine lipsă/greșită pe mutații → 403 (test minim).
- **Deschidere lazy**: `createServer(...)` fără nicio cerere nu creează fișierul; prima cerere reală pe `/api/runs/observe` îl creează.
- **Închidere `runsStore` la `close()`** pe server pornit manual (`createServer()` + `.listen()`/`.close()`, nu prin `startServer()`): am atins baza cu o cerere reală, apoi am închis serverul, apoi am șters directorul cu `rmSync` — dacă handle-ul SQLite ar fi rămas deschis, ștergerea fișierului WAL/SHM ar fi eșuat pe Windows cu eroare de „fișier folosit de alt proces"; `assert.doesNotThrow` confirmă că nu s-a întâmplat asta.

## Ce ar face fiecare test să cadă (exemple reprezentative, nu exhaustiv)

- Testele de upsert idempotent cad dacă `observeRun` ar face INSERT nou la a doua observare, sau dacă ar suprascrie `lifecycle`/`project` cu valori implicite la lipsă, sau dacă ar atinge `profile_id`.
- Testul I24 cu 2+ run-uri active cade dacă `getActiveRunsForProfile`/interogarea din `associateProfile` ar folosi `LIMIT 1`, `.get()` în loc de `.all()`, sau ar întoarce doar primul rând găsit.
- Testul cazului de graniță (self-exclude) cade dacă cineva ar elimina `AND id != runId` din interogarea de conflict — run-ul activ s-ar bloca pe sine la orice re-asociere banală.
- Testul HTTP de distincție `current`/`activeRuns` cade dacă `respondRunError` ar întoarce ambele câmpuri simultan sau ar amesteca sursele.
- Testul `GET /api/runs/observe -> 405` cade dacă rutarea ar trata `observe` ca id literal și ar întoarce 404/200 în loc de 405.
- Testul de închidere la `close()` manual cade dacă wrapper-ul `server.close` nu ar mai închide și `runsStore` (regresia exactă semnalată în brief, RF-02b-b/c).

## Ce NU am acoperit și de ce

- Nu am retestat exhaustiv `readJsonBody`/`checkOrigin` — un singur test minim de fiecare, ca cerut explicit în brief (deja acoperite în alte fișiere).
- Nu am testat integrare reală cu Pi/Claude Code — nu există în acest lot (confirmat și de coder).
- Nu am testat concurență reală (două scrieri simultane pe același rând) — CAS-ul e testat logic (revizie nepotrivită → CONFLICT), nu printr-o cursă reală de thread-uri/procese; ar fi test fragil și nu era cerut de brief.
- Nu am adăugat un test separat pentru `id`-uri "suspecte" (`%00`, path traversal) pe `/api/runs/{id}` ca la RF-02b — mecanismul (`CONTROL_CHARS`, `pathname` nedecodat) e identic și deja acoperit acolo; l-aș fi adăugat dacă brief-ul îl cerea explicit pentru acest lot, dar nu a fost menționat.

## Suspiciuni de bug

Niciuna găsită. Codul din `runs.js`/`server.js` se comportă exact ca descris în brief și în raportul coder-ului; toate deciziile documentate (re-asociere permisă, `activeRuns` complet, `observeRun` fără CAS, distincția `current`/`activeRuns`) sunt verificate de teste și corespund implementării citite.

## Comanda exactă de rulare

```
node --test
```

(din rădăcina proiectului `D:\RPGfactory`, conform `package.json` — `npm test` rulează aceeași comandă). Rulează toată suita, inclusiv `test/runs.test.mjs` și `test/server-runs.test.mjs` nou create, alături de testele existente (RF-01/RF-02a/RF-02b).
