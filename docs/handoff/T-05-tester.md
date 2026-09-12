# T-05 — Teste pentru starea reală (working/waiting/sleeping) + reparare teste vechi

## Sarcină, în două părți

### Partea 1 — reparare (obligatorie înainte de orice altceva)

`public/app.js` a redenumit `colorForStatus` → `colorForActivity` (lucrează acum pe `agent.activity`, nu `agent.status`), cu valori noi: `working`/`waiting`/`sleeping`/necunoscut, în loc de `busy`/orice-altceva. Rularea suitei complete (`node --test`) arată acum eșecuri în `test/app.test.mjs` care referențiază direct `colorForStatus` (funcție care nu mai există) și fixture-uri cu `status: 'busy'` folosite pentru a testa culoarea indicatorului.

Găsește exact testele afectate (rulează suita, citește erorile) și actualizează-le să reflecte API-ul curent:
- orice apel direct la `sandbox.colorForStatus` → `sandbox.colorForActivity`.
- testele care verificau maparea de culoare pe `status: 'busy'` → rescrie-le să verifice maparea pe `agent.activity` (`'working'` → `#2A5FAE`, `'waiting'` → `#B4801E`, `'sleeping'`/necunoscut → `#888`), conform valorilor exacte din `public/app.js` (verifică-le acolo, nu presupune).
- testele de tip "draw() desenează indicator cu culoarea din colorForStatus" → actualizează denumirea și logica să corespundă lui `colorForActivity`/`agent.activity`.

Nu șterge acoperirea existentă (verificare non-throw pe valori necunoscute etc.) — doar actualizeaz-o la noul API.

### Partea 2 — teste noi pentru `status.js`

Vezi `docs/handoff/T-05-coder.md` și `docs/handoff/T-05-coder-raport.md` pentru context complet. `status.js` exportă `getActivityState(cwd, sessionId)`, structurat similar cu `rank.js` (cache pe mtime, degradare la `null` pe eroare, `TAIL_BYTES = 64*1024`, `ACTIVE_WINDOW_MS = 30*60*1000`).

Scrie `test/status.test.mjs` (fișier nou, la fel ca `test/rank.test.mjs` — fixture-uri proprii în `os.tmpdir()`, mock manual de `fs` unde e nevoie, cache testat explicit). Cazuri de acoperit, sugerate chiar de coder în raportul lui:

1. Ultima linie relevantă e `type: 'user'` → `activity: 'working'` (NU waiting — „user"/tool-result/attachment înseamnă modelul urmează să vorbească, deci procesul lucrează, per logica din brief).
2. Ultima linie `assistant` are `message.content` cu un element `type: 'tool_use'` → `'working'`.
3. Ultima linie `assistant` NU are `tool_use` în content și `stop_reason !== 'tool_use'` → `'waiting'`.
4. Fișier transcript cu mtime mai vechi de 30 de minute → `'sleeping'`, **indiferent de conținut** (verifică asta explicit — pragul de prospețime trebuie să câștige în fața conținutului).
5. Transcript inexistent → `{ activity: null }`, fără să arunce.
6. JSON invalid pe linia finală → tratat ca și cum nu ar exista (căutarea continuă înapoi sau întoarce `null` dacă nu găsește nimic valid) — verifică comportamentul REAL din cod, nu presupune.
7. Coadă tăiată (fișier mai mare de 64KB) — prima linie (parțială) e ignorată corect.
8. Cache: al doilea apel cu același mtime nu recitește fișierul; schimbarea mtime invalidează cache-ul. Foloseste `sessionId` unic (`randomUUID()`) per test, la fel ca la `rank.test.mjs`, ca să nu se contamineze prin cache-ul de modul.

## Ce NU e un test valid

- Nu testa împotriva transcript-urilor reale ale lui Lucian din `~/.claude/projects/` — fixture-uri proprii, izolate.
- Nu scrie un test care doar verifică "nu aruncă" acolo unde valoarea returnată contează.

## Constrângeri dure

- Nu modifica `status.js`, `server.js`, `rank.js`, `app.js`.
- Nu rula comenzi — planner rulează.
- `node --test`, fără dependențe noi.

## Predare

`test/status.test.mjs` (nou) + modificările din `test/app.test.mjs` (partea 1) + `docs/handoff/T-05-tester-raport.md`: ce ai reparat la testele vechi, ce ai testat nou, ce NU (motivat), comanda exactă de rulare a întregii suite.
