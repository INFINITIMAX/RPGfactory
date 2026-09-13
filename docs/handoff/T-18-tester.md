# T-18 — Teste pentru /api/reveal, /api/new-session și butoanele noi

## Sarcină

Scrie teste pentru schimbările din `docs/handoff/T-18-coder.md` și `docs/handoff/T-18-coder-raport.md` (citește-le întâi). Planner a verificat deja manual, cu serverul real pornit, că ambele endpoint-uri răspund corect (folder valid → `200 {ok:true}`, folder relativ/inexistent → `400 {ok:false, error:...}`) — tu scrii testele automate, în două fișiere separate:

1. **Server**: `test/server.test.mjs` (fișier NOU — nu există încă un test pentru `server.js`; folosește `http.createServer`-ul real, pornit pe un port de test, cu `fetch`/`http.request` din Node, la fel cum `test/state.test.mjs`/`test/api-open.test.mjs` testează deja alte rute din `server.js` — verifică acolo tiparul exact de pornire/oprire a serverului în teste, ca să fii consistent).
2. **Client**: `test/app.test.mjs`, secțiune nouă — butoanele `new-session-btn`/`reveal-btn` din `renderDetails()` și funcțiile `newSessionForAgent`/`revealAgentFolder`.

## Cazuri de acoperit — server (`/api/reveal`, `/api/new-session`)

Pentru FIECARE din cele 2 rute:
1. **Folder valid (există, e director, cale absolută)** → `200`, body `{ok:true}`. Nu poți controla dacă `rundll32` chiar rulează în mediul de test (Windows) — nu asta se testează; testează doar răspunsul HTTP. Folosește un folder garantat să existe la orice rulare (ex. `__dirname` din testul însuși, sau `os.tmpdir()`).
2. **Cale relativă** (ex. `"relative/path"`) → `400`, `{ok:false, error:...}`.
3. **Folder inexistent** (cale absolută plauzibilă dar care nu există pe disc) → `400`.
4. **Cale care există dar E FIȘIER, nu director** (ex. `__filename` din test) → `400` (verifică `resolveFolder`: `stat.isDirectory()`).
5. **Body JSON invalid** → `400`, `{ok:false, error:'invalid JSON'}`.
6. **Câmp `folder` lipsă din body** → `400`.

Pentru `/api/open` existent (deja avea teste în `test/api-open.test.mjs` probabil) — NU retesta ce există deja; verifică doar, dacă ai timp, că `openInClaudeCode`→`launchTarget` redenumirea NU a stricat comportamentul existent (dacă `api-open.test.mjs` deja acoperă asta și tot trece, nu e nevoie de test nou, doar rulează suita și confirmă în raport).

## Cazuri de acoperit — client (`test/app.test.mjs`)

7. **Butoanele noi apar în `renderDetails()`** — cu un agent selectat, verifică că DOM-ul (via `detailsEl.innerHTML` sau `document.getElementById`, cum fac deja testele T-07 pentru `open-btn`/`hide-btn`) conține `new-session-btn` și `reveal-btn`.
8. **Click pe `new-session-btn` → cheamă `POST /api/new-session`** cu body `{folder: agent.cwd}` — verifică prin mock-ul de `fetch` existent (extinde-l dacă nu distinge încă `/api/new-session`/`/api/reveal`, la fel cum distinge deja `/api/state`/`/api/agents`/`/api/open`).
9. **Click pe `reveal-btn` → cheamă `POST /api/reveal`** cu body `{folder: agent.cwd}`, analog.
10. **Eșec de rețea/răspuns non-ok → mesaj de eroare afișat** în `#open-error`, pentru ambele butoane noi (analog cu ce există deja pentru `open-btn`, dacă există un asemenea test).

## Ce NU e un test valid

- Nu testa dacă `rundll32`/Explorer chiar se deschide (nu poți controla asta determinist într-un test automat) — testează doar contractul HTTP (status, body) și apelul de rețea de la client, nu efectul de sistem.
- Nu testa CSS-ul (`style.css`) — nu e testabil din `node --test`, rămâne verificare vizuală a planner-ului.

## Constrângeri dure

- Nu modifica `server.js`, `public/app.js`, `public/style.css`.
- Nu rula comenzi — planner rulează.
- `node --test`, fără dependențe noi. Pentru `test/server.test.mjs`, verifică întâi tiparul exact din `test/state.test.mjs`/`test/api-open.test.mjs` (cum pornesc/opresc serverul, ce port folosesc, cum fac cleanup) — fii consistent, nu inventa alt tipar.

## Predare

Fișier nou `test/server.test.mjs` (sau extindere a unui fișier existent, dacă găsești deja un `test/server...` — verifică întâi) + modificări în `test/app.test.mjs` + `docs/handoff/T-18-tester-raport.md`: ce ai testat, ce NU (motivat), comanda exactă de rulare a întregii suite.
