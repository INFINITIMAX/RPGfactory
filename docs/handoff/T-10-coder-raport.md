# T-10 — Coder — raport

## Fișiere modificate

- `public/index.html`: adăugat `<script src="/zones.js"></script>` între `merge-state.js` și `app.js`.
- `public/app.js`: integrarea zonelor per proiect în randare, conform brief-ului. Detalii mai jos.

## Ce am făcut în `public/app.js`

1. **`updateZones()`** (nouă) — calculează `counts`/`projects` din `agents` vii (neascunși), apelează `allocateCells(projects, previousMap)` din `zones.js`, compară semnătura JSON cu `lastPlotsSignature` și salvează (`queueSave()`) doar la schimbare — exact tiparul din brief/`src/main.js`. Apelată din `tick()`, după popularea `agents`/`knownAgentNames`, înainte de `draw()`.
2. **`lastPlotsSignature`** — variabilă nouă la nivel de script, inițializată în `initState()` cu `JSON.stringify(state.plots || {})` după încărcarea stării de pe disc, ca să nu declanșeze o salvare falsă la pornire.
3. **`zoneCellToPixels(cell)`** — conversia coordonatelor zonei (centrate la origine) în pixeli, folosind `CANVAS_CENTER_X`/`CANVAS_CENTER_Y` (noi, derivate din `canvas.width`/`canvas.height`) și `CELL_SIZE` existent (80px, reutilizat, nu am inventat altă constantă).
4. **`cellForAgent(agent, projectCells)`** — exact ca în brief: hash pe `sessionId` mod numărul de celule ale proiectului; fallback `{x:0,y:0}` dacă proiectul n-a primit nicio celulă.
5. **`computeAgentPositions(liveAgents)`** (nouă) — grupează agenții vii pe cheia `cwd|x,y` (proiect + celulă), sortează fiecare grup după `sessionId` (determinist) și aplică jitter circular (`ZONE_JITTER_RADIUS = 12px`) doar când grupul are mai mult de un agent. Rezultatul (`Map<sessionId, {x,y}>`) e stocat în `agentPositions` (variabilă de modul) și refolosit atât de `draw()` cât și de handler-ul de click, ca să rămână perfect consistente — am ales acest refactor ca să nu duplic logica de jitter în două locuri (nu era explicit cerut, dar era necesar ca poziția desenată să coincidă cu cea "clicabilă").
6. **`drawZones()`** (nouă) — pentru fiecare proiect din `state.plots`, desenează câte un dreptunghi `CELL_SIZE×CELL_SIZE` per celulă (fill + stroke din paletă), apoi numele proiectului (`cwd.split(/[\\/]/).pop()`) deasupra celulei celei mai de sus (la egalitate, cea mai din stânga). Apelată la începutul `draw()`, înaintea buclei de agenți.
7. **`draw()`** — rescrisă să apeleze `drawZones()`, apoi să calculeze `liveAgents` + `agentPositions = computeAgentPositions(liveAgents)`, și să folosească `agentPositions.get(agent.sessionId)` în loc de `cellIndexToPosition(hashToCellIndex(...))`. Restul (sprite, dot de status, selecție, nume) neschimbat.
8. **Click handler** — hit-test-ul folosește acum `agentPositions.get(agent.sessionId)` (populat la ultimul `draw()`) în loc de recalcularea hash+grilă globală.
9. **`saveState()`** — corpul PUT trimite acum și `plots: localState.plots` (înainte lipsea; fără el, `queueSave()` din `updateZones()` n-ar fi salvat efectiv layout-ul zonelor pe disc — serverul/`state.js` are deja suport pentru câmpul `plots`, doar wiring-ul de trimitere lipsea, exact cum semnala comentariul din `state.js`).
10. **`state`/`baseSnapshot`/`initState`/catch-ul din `initState`** — completate cu `plots: {}` în literalele inițiale, ca să existe câmpul de la bun început.

## `cellIndexToPosition` — păstrat, nu eliminat

Am verificat: `test/app.test.mjs` folosește direct `app.sandbox.cellIndexToPosition` în cel puțin 8 locuri (linii 457, 479, 504, 601, 625, 667, 710, 754), independent de poziționarea globală pe hartă. Conform brief-ului ("nu o șterge dacă alte teste/cod încă o folosesc"), am lăsat-o neatinsă, împreună cu `GRID_COLS`/`GRID_ROWS`/`GRID_OFFSET`/`hashToCellIndex` (acesta din urmă rămâne folosit ca hash generic, atât pentru `cellForAgent` cât și pentru `colorForProject`). Funcția nu mai e apelată din `draw()`/click, dar rămâne definită.

## Paleta de culori pentru zone

6 culori fixe (`ZONE_PALETTE`), fiecare cu `fill` (rgba, alpha 0.18, ca fundalul să nu acopere sprite-urile/textul) și `stroke` (aceeași nuanță, opac, pentru contur subțire de 1px). Am reutilizat aceleași nuanțe ca indicatorii de status existenți (`#2A5FAE`, `#B4801E`) plus 4 nuanțe noi (verde, mov, roșu, cyan) pentru diferențiere vizuală clară între proiecte. Culoarea unui proiect e aleasă prin `hashToCellIndex(projectId) % ZONE_PALETTE.length` — stabilă indiferent de ordinea proiectelor în lista sortată după `size` (care se poate schimba de la un tick la altul dacă numărul de agenți variază), evitând flicker de culoare.

## Constrângeri respectate

- Nu am atins `zones.js`, `state.js`, `merge-state.js`, `rank.js`, `status.js`, `server.js`, `.env*`, `.gitignore`, `README.md`, `assets/`.
- Nicio dependență npm nouă.
- `<script src="/zones.js"></script>` adăugat înainte de `app.js`, după `merge-state.js`.
- Nu am schimbat sprite-ul sau culorile per-agent (doar fundalul zonei diferă per proiect).
- `Open`/`Hide`/`Unhide`, indicatorul de status, animația sprite-ului — funcționalitate neschimbată, cod neatins (doar sursa poziției s-a schimbat).

## Ce NU am făcut / risc semnalat pentru planner

Nu am putut rula nimic (nu am acces la shell). **Nu am atins `test/app.test.mjs`** — e în afara scopului meu — dar semnalez explicit un risc pe care planner-ul/tester-ul trebuie să-l știe:

- `test/app.test.mjs` încarcă `app.js` cu `vm.runInContext` fără să încarce și `zones.js` în același context sandbox (doar `merge-state.js` e încărcat separat, vezi comentariul din capul fișierului de test). Cu schimbarea asta, orice test care ajunge să apeleze `tick()` (deci și `updateZones()`) va arunca `ReferenceError: allocateCells is not defined` în sandbox, la fel cum `mergeState` a trebuit adăugat la T-07. **Testerul va trebui să adauge încărcarea `public/zones.js` în `loadApp()`**, exact cum s-a făcut pentru `merge-state.js`.
- `defaultDiskState()` din test (linia 51) nu include `plots: {}` — probabil va trebui completată, dacă testele verifică forma exactă a stării.
- Testele existente care verifică poziția agenților plecând de la `cellIndexToPosition(hashToCellIndex(...))` (grilă globală) vor eșua cu noua logică (poziția vine acum din zonă+jitter) — se așteaptă să fie rescrise de tester pentru noul comportament, nu e o regresie de cod, ci o schimbare de contract intenționată de T-10.

## Cum se testează manual (recomandare pentru planner, eu nu pot rula nimic)

Cu server-ul pornit (`node server.js` sau echivalent) și cu 2+ agenți vii din `cwd`-uri diferite (planner-ul confirmă că are deja 2 sesiuni active):
1. Deschide `http://localhost:<port>/` în browser.
2. Verifică vizual: ar trebui să apară 2 zone dreptunghiulare colorate diferit, fiecare cu numele proiectului (ultimul segment al căii, nu calea completă) deasupra, iar agenții din fiecare `cwd` să fie poziționați în interiorul zonei corespunzătoare, nu pe o grilă globală unică.
3. Click pe un agent → panoul de detalii trebuie să se deschidă (verifică faptul că hit-test-ul pe noua poziție funcționează).
4. Reîmprospătează pagina → zonele trebuie să rămână în aceleași poziții relative (persistate în `data/state.json`, câmpul `plots`), nu recalculate de la zero vizual.

Nu am comandă/output de verificare manuală de inclus — nu am acces la shell/browser din acest rol; recomand planner-ului să ruleze pașii de mai sus și, separat, suita de teste (`node --test`) după ce tester-ul actualizează `test/app.test.mjs` cum am semnalat mai sus.
