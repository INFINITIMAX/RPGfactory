# T-07 — Reparare mock + teste pentru arhivare

## Sarcină, în două părți

### Partea 1 — reparare (obligatorie întâi)

`public/app.js` s-a schimbat substanțial la T-07 (vezi `docs/handoff/T-07-coder.md` + `docs/handoff/T-07-coder-raport.md`) și a rupt `test/app.test.mjs` la nivel de încărcare (nu doar la un test individual):

1. **Lipsește elementul mock `hidden-panel`** din dispatcher-ul `getElementById` — la fel ca `open-btn`/`open-error` adăugate la T-03, adaugă un mock similar (poate fi un obiect simplu cu `innerHTML`/`classList` sau ce anume folosește `renderHiddenList()` din codul real — verifică exact ce metode/proprietăți apelează `app.js` pe acest element și mock-uiește exact atât).
2. **`mergeState` nu există în sandbox** — `app.js` îl folosește global (încărcat separat din `public/merge-state.js` printr-un `<script>` distinct în `index.html`, nu prin `require`/`import`). În test, trebuie să încarci și sursa lui `merge-state.js` în ACELAȘI context `vm` înainte de `app.js` (`vm.runInContext(MERGE_STATE_SOURCE, sandbox)`, apoi `vm.runInContext(APP_SOURCE, sandbox)`), la fel cum s-ar întâmpla real în browser prin ordinea `<script>`-urilor.
3. **`fetch` mock trebuie să distingă `/api/state` de `/api/agents`** — `app.js` face acum `fetch('/api/state')` la pornire (`initState()`) ȘI `fetch('/api/agents')` la fiecare `tick()`. Mock-ul curent (`async () => ({ json: async () => [] })`) nu știe să răspundă diferit. Fă mock-ul sensibil la URL-ul cerut (primul parametru al lui `fetch`), cu răspunsuri implicite rezonabile: `/api/state` → `{ version:1, archived:[], archivedAt:{}, updatedAt:0 }`, `/api/agents` → `[]`. Testele existente care schimbă comportamentul de `fetch` pentru `/api/agents` (`setAgents()`) trebuie să rămână compatibile — nu strica helper-ul respectiv, doar extinde-l să nu afecteze `/api/state`.
4. **Bootstrap async** — `app.js` pornește acum cu `initState().then(() => { tick(); setInterval(tick, ...); })`, nu direct `tick()`. Helper-ul `loadApp()`/`setAgents()` din teste trebuie să aștepte ca acest lanț inițial să se termine înainte ca testele să apeleze `setAgents()`/să interacționeze cu `agents` — altfel poți avea o cursă între `initState()` (asincron) și restul testului. Asigură-te că `loadApp()` întoarce o promisiune sau că testele fac `await` pe ceva relevant înainte de a continua.

Rulează suita completă (`node --test` pe toate fișierele din `test/`) după reparare — toate testele PREVIOUS (T-01/T-04/T-05) trebuie să treacă din nou, nesimplificate/needitate ca logică, doar cu mock-ul actualizat.

### Partea 2 — teste noi pentru comportamentul de arhivare

Vezi brief-ul complet la `docs/handoff/T-07-coder.md`. Cazuri de acoperit în `test/app.test.mjs` (extindere, nu fișier nou — arhivarea e parte din `app.js`):

1. **Filtrare la randare**: un agent cu `sessionId` prezent în `state.archived` NU produce `drawImage`/`arc` pentru el (verifică cu spy-urile deja existente din T-04), deși e `alive:true` și ar apărea normal.
2. **Filtrare la hit-test**: click pe poziția unui agent ascuns nu-l selectează.
3. **`hideAgent`**: apelat (direct, sau prin simularea click-ului pe butonul "Hide" — verifică ce e mai simplu de declanșat din test), agentul respectiv ajunge în `state.archived`, cu un timestamp în `state.archivedAt`, selecția se resetează (`renderDetails` arată panoul gol/ascuns).
4. **`unhideAgent`**: scoate id-ul din `state.archived`/`archivedAt`.
5. **`queueSave`/`saveState` — succes**: mock `fetch` pentru `PUT /api/state` care răspunde 200 cu un body — verifică că `baseUpdatedAt`/`baseSnapshot` (dacă sunt accesibile din sandbox — verifică dacă sunt `let`/`const` la nivel de script, caz în care nu apar ca proprietăți globale, la fel ca `agents`/`selectedSessionId` la T-01; documentează ce poți verifica direct vs. indirect prin efecte observabile).
6. **`queueSave`/`saveState` — conflict 409 + merge**: mock `fetch` care răspunde 409 cu o stare "remote" diferită la prima încercare, apoi 200 la a doua — verifică că se cheamă `mergeState` (poți verifica efectul: starea finală trimisă/reținută conține atât elementul local cât și cel din remote) și că nu se opresc la prima eroare.
7. **Debounce**: două apeluri rapide de `hideAgent` (sau `queueSave` direct) în interval scurt nu declanșează două `fetch`-uri PUT separate — doar unul, după debounce. Ai nevoie de control asupra timpului (`setInterval`/`setTimeout` mock, la fel ca la T-04 pentru bucla de animație) — verifică cum se cheamă `setTimeout` în sandbox (probabil trebuie adăugat, dacă nu există deja alături de `setInterval`).

## Ce NU e un test valid

- Nu testa un `fetch` real către un server pornit (asta ar fi un test de integrare separat, în afara scopului acestui fișier bazat pe `vm`).
- Nu slăbi un test existent (de la T-01/T-04/T-05) doar ca să treacă mai ușor cu mock-ul nou — dacă un test vechi nu mai are sens conceptual din cauza schimbării de bootstrap, semnalează explicit în raport, nu-l șterge tacit.

## Constrângeri dure

- Nu modifica `public/app.js`, `public/merge-state.js`, `public/index.html`.
- Nu rula comenzi — planner rulează.
- `node --test`, fără dependențe noi.

## Predare

Modificări în `test/app.test.mjs` (reparare + extindere) + `docs/handoff/T-07-tester-raport.md`: ce ai reparat și de ce s-a rupt, ce ai testat nou, ce NU (motivat), comanda exactă de rulare a întregii suite.
