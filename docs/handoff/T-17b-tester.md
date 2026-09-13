# T-17b — Ripple T-17: tehnica de semănare `stateWithPlots`/`initialState` e ruptă

## Bug real găsit de planner (rulare teste după T-17)

5 teste noi din T-17 cad:
- `T-17 agent la-site (idle) în cadranul pădure...`
- `T-17 agent care merge (walking) prin cadranul pădure...`
- `T-17 agent la-site (idle) în cadranul aur...`
- `T-17 agent care merge (walking) prin cadranul aur...`
- `T-17 frameCount pentru topor/târnăcop ciclează pe RUN_SPRITE_FRAME_COUNT...`

Toate cad cu `0 !== 1` la `drawImageCalls.length` (0 desenări, deși se aștepta 1).

## Cauza exactă (diagnosticată de planner, verificată prin citirea codului, nu presupusă)

Tehnica folosită de tester (`stateWithPlots({[cwd]: [T17_FOREST_CELL]})` + `loadApp({initialState: ...})`) presupune că celula semănată în `state.plots` rămâne neatinsă până când testul cheamă `app.setAgents([agent])`. **Nu rămâne.**

`public/app.js` are, la finalul fișierului, cod care rulează SINGUR, imediat la încărcarea scriptului:
```js
initState().then(() => {
  tick();
  setInterval(tick, POLL_INTERVAL_MS);
});
```
`loadApp()` execută sincron `vm.runInContext(source, sandbox)`, apoi (implicit, prin `await`-urile din `loadApp`) lasă micro-task-urile să se scurgă — deci acest `tick()` automat RULEAZĂ o dată, de la sine, ÎNAINTE ca testul să apuce să cheme `app.setAgents([agent])`. La acel moment, `agentsOnServer` e încă `[]` (valoarea implicită din mock, `setAgents()` nu a fost chemat încă) — deci `tick()` cheamă `updateZones()` cu ZERO agenți vii. `updateZones()` calculează `projects=[]` (niciun proiect „vrut") și `layOut([], previousMap)` întoarce un `Map` GOL (proiectul semănat prin `initialState` nu apare în `wanted`, deci dispare din rezultat — comportament CORECT al `updateZones()` pentru un proiect fără agenți, nu e bug de producție). Rezultat: `state.plots` devine `{}`, iar `queueSave()` scrie asta pe disc (mock).

Abia DUPĂ acest tick automat, testul cheamă `await app.setAgents([agent])` — dar `previous` e deja `{}` (semănarea a fost ștearsă), deci proiectul e tratat ca „fresh" și primește prima celulă LIBERĂ din pool, în ordinea inelelor (`ring(1)` întâi): `{-1,0}` — NU `{1,1}` (`T17_FOREST_CELL`) cum presupunea testul. `{-1,0}` are `x<0` → `regionForWorldPos` întoarce `null`, deci codul alege corect `pawnImage`/`pawnRunImage` (comportament de producție CORECT) — dar acele imagini nu au fost „încărcate" în test (doar `triggerAxeImagesLoad()` a fost chemat), deci `spriteLoaded===false` → 0 `drawImage`.

**Confirmare independentă**: testul „cadran neutru" (`T17_NEUTRAL_CELL = {x:-1,y:0}`) trece — dar din ÎNTÂMPLARE, nu pentru că semănarea funcționează: `{-1,0}` e EXACT prima celulă din `ring(1)`, deci coincide cu ce ar primi oricum un proiect nou, fără nicio semănare. Testul de fallback (linia ~2886) trece și el din întâmplare, pentru că nu declanșează `onload` pe NICIO imagine — deci `0 drawImage` e adevărat indiferent de cadranul real. Niciunul din aceste 2 teste nu validează de fapt ce pretinde titlul lor.

Nu e un bug de producție (`updateZones()`/`layOut()` se comportă corect — un proiect fără agenți vii nu poate păstra o zonă). E o presupunere greșită despre ordinea de execuție într-un test nou, care cere reproiectare, nu o constantă schimbată — de-aia vine la tine, nu o repar direct.

## Sarcină

În `test/app.test.mjs`, secțiunea T-17 (linia ~2745 în jos):

1. **Elimină tehnica `stateWithPlots`/`T17_FOREST_CELL`/`T17_GOLD_CELL`/`T17_NEUTRAL_CELL`** (sau păstreaz-o doar dacă găsești un mod valid s-o faci să funcționeze — dar tehnica dovedită mai jos e mai simplă și deja verificată la T-16b, preferă-o).

2. **Refă cele 5 teste (+ cele 2 care treceau din întâmplare, ca să valideze cu adevărat ce pretind)** folosind tehnica „filler" deja verificată la T-16b: proiecte solo (1 agent, fără jitter) care ocupă, în ordine, celulele din `ring(1)`/`ring(2)` PÂNĂ când următorul proiect liber (cel testat) cade exact în celula dorită. Verifică programatic poziția finală cu `app.sandbox.computeAgentPositions()` (funcția de producție reală), NU calcula pe hârtie și presupune — la fel ca în raportul T-16b.

   Ordinea `ring()` (verificată direct din `zones.js`, nu presupusă): `ring(1) = [{-1,0},{0,1},{0,-1},{1,0}]` (toate neutre sau pe axă), `ring(2) = [{-2,0},{-1,1},{-1,-1},{0,2},{0,-2},{1,1},{1,-1},{2,0}]` — `{1,1}` (forest) e a 6-a celulă din `ring(2)` (index 5), `{1,-1}` (gold) e a 7-a (index 6). Deci:
   - Pentru un agent în celula **forest** `{1,1}`: 4 fillere pentru `ring(1)` + 5 fillere pentru primele 5 celule din `ring(2)` = 9 fillere solo, apoi al 10-lea proiect (cel testat) cade pe `{1,1}`.
   - Pentru un agent în celula **gold** `{1,-1}`: 10 fillere (cele 9 de mai sus + `{1,1}` însuși), apoi al 11-lea proiect cade pe `{1,-1}`.

   Nu presupune aceste numere ca fiind garantat corecte — VERIFICĂ programatic cu `computeAgentPositions()` înainte de a scrie asertările finale, exact cum ai făcut la T-16b (acolo ai găsit că soluția sugerată de planner era geometric imposibilă — posibil să găsești ceva similar aici; dacă da, motivează alternativa aleasă, la fel de riguros).

3. **Testul „cadran neutru"** (linia ~2869) — poate rămâne cu tehnica actuală DOAR dacă documentezi explicit, cu comentariu, că `{-1,0}` e prima celulă naturală din `ring(1)` pentru un proiect fără fillere (deci nu are nevoie de manipulare de `state.plots` — un proiect simplu, singur, ajunge acolo natural) — verifică că asta chiar e adevărat (fără nicio semănare de `initialState`, doar `setAgents([agent])` simplu).

4. **Testul de fallback** (linia ~2886, cu forest+gold simultan) — refă-l cu tehnica filler, ca să valideze CU ADEVĂRAT că agentul e în cadranul așteptat când testezi absența `onload`-ului (altfel testul nu dovedește nimic despre codul din T-17, doar despre calea generică `spriteLoaded===false`).

## Ce NU e un test valid

- Nu presupune ordinea `ring()` din enunț ca literă de lege — verific-o programatic (există deja teste `ring`/`layOut` în `zones.test.mjs` de referință, dar verifică direct în scenariul tău, cu `computeAgentPositions()`).
- Nu slăbi asertarea centrală (ce sprite se alege) doar ca să treacă testul.

## Constrângeri dure

- Nu modifica `public/app.js`, `public/zones.js` — problema e strict de test (deja verificat de planner).
- Nu rula comenzi — planner rulează.
- `node --test`, fără dependențe noi.

## Predare

Modificări în `test/app.test.mjs` + `docs/handoff/T-17b-tester-raport.md`: verificarea programatică a pozițiilor (nu calcul pe hârtie needverificat), ce ai schimbat la fiecare din cele 7 teste (5 care cădeau + 2 care treceau din întâmplare) și de ce, comanda exactă de rulare a întregii suite.
