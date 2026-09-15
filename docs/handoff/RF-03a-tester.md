# RF-03a — brief tester: adaptor Claude Code, sondare automată

**Data:** 15-09-2026, EET.
**Rol:** tester. **Nu rulezi comenzi. Nu afirmi că testele trec.**
**Lot:** RF-03a — `adapters/claude-code.js` + `startPolling`/`stopPolling` din `server.js`.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Ce ai de testat

Planner a rulat suita existentă înainte de acest brief: **442/442 teste trec**, nicio regresie de la wiring-ul nou.

Două fișiere:

1. **`test/adapters/claude-code.test.mjs`** (creează directorul `test/adapters/` dacă nu există) — funcția `pollClaudeCodeSessions` direct, fără HTTP, cu `runsStore` real (`:memory:` sau director temporar, ca la `test/runs.test.mjs`) și `sessionsDir`/`isAlive` false/injectate (ca la testele existente pentru `readAgents()`, dacă găsești un tipar acolo — verifică `test/server.test.mjs` sau echivalent pentru cum se simulează fișiere de sesiune fictive).
2. **`test/server-polling.test.mjs`** (sau extinde un fișier existent, dacă găsești un loc mai potrivit — motivează alegerea) — wiring-ul `startPolling`/`stopPolling` din `server.js`, cu server real pe port efemer și `pollIntervalMs` MIC (ex. 20-50ms) ca testele să nu aștepte 5 secunde reale.

Citește întâi `docs/handoff/RF-03a-coder.md` și `docs/handoff/RF-03a-coder-raport.md`.

## 2. `pollClaudeCodeSessions` — cazuri de acoperit

- **Sesiune vie** (fișier `.json` valid, `isAlive(pid)` = `true`) → apare în `runs` cu `lifecycle: 'running'`, `source_harness: 'claude-code'`, `native_id` = `sessionId`, `project` = `cwd`.
- **Sesiune moartă** (fișier există, `isAlive(pid)` = `false`) → `lifecycle: 'stopped'` — **verifică explicit că NU e omisă** (diferența deliberată față de `readAgents()`, cerută în brief §2.1 — cel mai important test al lotului).
- **Mai multe sesiuni deodată** (mix vii/moarte) → toate ajung în `runs`, fiecare cu lifecycle-ul corect.
- **Aceeași sesiune sondată de două ori** (al doilea ciclu de sondare) → nu creează rând nou (verifică prin `listRuns()` — un singur rând), `lifecycle` se actualizează dacă s-a schimbat (ex. era `'running'`, procesul a murit între cele două sondări → devine `'stopped'`).
- **`sessionsDir` inexistent** → `{observed: 0, errors: 0}`, fără excepție, `runs` rămâne gol.
- **Director gol** (există, dar fără fișiere `.json`) → `{observed: 0, errors: 0}`.
- **Fișier JSON corupt** (conținut invalid) → contorizat la `errors`, restul fișierelor din același ciclu tot se procesează (nu oprește totul la prima eroare) — testează cu un fișier corupt ȘI unul valid în același director, verifică că cel valid tot ajunge în `runs`.
- **Fișier `.json` cu `sessionId` sau `cwd` lipsă** → verifică ce se întâmplă (probabil `observeRun` aruncă `VALIDATION` din `runs.js`, prins ca eroare și contorizat) — nu presupune, verifică comportamentul real.
- **Return value**: `{observed, errors}` cu numerele corecte pentru fiecare scenariu de mai sus.

## 3. Wiring `startPolling`/`stopPolling` — cazuri de acoperit

- **`createServer(...)` singur, fără `startPolling()`** → nicio sondare nu are loc (verifică indirect: `runs` rămâne gol chiar dacă există fișiere de sesiune reale în `sessionsDir` de test, chiar și după ce ai aștepta mai mult decât `pollIntervalMs`).
- **`server.startPolling()` chemat** → după `pollIntervalMs` (folosește o valoare mică în test), sesiunile din `sessionsDir` apar în `runs`.
- **`server.startPolling()` chemat de două ori** → un singur timer activ (verifică indirect: nu apar sondări duble/suprapuse — greu de testat direct, dar poți verifica că a doua chemare nu aruncă și nu produce comportament vizibil diferit).
- **`server.stopPolling()`** → sondarea încetează; adaugă o sesiune NOUĂ în `sessionsDir` DUPĂ `stopPolling()`, așteaptă mai mult decât `pollIntervalMs`, verifică că NU apare în `runs`.
- **`server.stopPolling()` chemat fără ca `startPolling()` să fi fost chemat vreodată** → nu aruncă.
- **`startServer(...)` pornește sondarea automat** (fără apel explicit de `startPolling()`) — verifică folosind `pollIntervalMs` mic.
- **`close()` oprește sondarea** — la fel ca la RF-02b-c/RF-02c: pornește serverul, oprește-l cu `close()`, adaugă o sesiune nouă, așteaptă, verifică că NU a fost observată. Testează ATÂT prin `startServer()`, CÂT ȘI prin `createServer()`+`.listen()`/`.close()` manual (lecția RF-02b-b: prima reparație a acoperit doar o cale, nu ambele).

## 4. Ce NU e un test valid

- Nu folosi `pollIntervalMs` implicit (5000ms) în teste — ar face suita lentă inutil. Folosește o valoare mică, injectată.
- Nu testa integrare reală cu sesiuni Claude Code adevărate de pe disc — folosește fixture-uri, ca la `test/server.test.mjs` existent pentru `/api/agents`.
- Nu slăbi nicio asertare ca să treacă.

## 5. Fișiere

**Poți crea:** `test/adapters/claude-code.test.mjs`, `test/server-polling.test.mjs`.

**NU atinge:** `adapters/claude-code.js`, `server.js`, `runs.js`, `db.js`, `profiles.js`, `migrations/**`, `state.js`, `body.js`, `server/http-guards.js`, `public/**`, `package.json`, documentele de coordonare.

## 6. Raportul

`docs/handoff/RF-03a-tester-raport.md`: ce ai testat, ce NU (motivat), comanda exactă de rulare.

## 7. Constrângeri

- Nu rulezi comenzi. Nu afirma că „acum trece". Română.
