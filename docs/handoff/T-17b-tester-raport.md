# T-17b — raport tester

## Fișier modificat

`D:\RPGfactory\test\app.test.mjs`, secțiunea „12. Zone tematice pădure/aur" (liniile ~2705-2985 după edit).

Nu am atins `public/app.js`/`public/zones.js` (constrângere dură respectată).

## Ce am eliminat

Tehnica `stateWithPlots()` + `options.initialState` pentru cele 3 constante `T17_FOREST_CELL`/`T17_GOLD_CELL`/`T17_NEUTRAL_CELL` — confirmat, prin citirea `public/app.js`, că tick-ul automat din `initState().then(() => { tick(); ... })` rulează ÎNAINTE ca testul să apuce să cheme `setAgents()`, cu `agentsOnServer` încă `[]`, deci `updateZones()` vede zero agenți și golește `state.plots` (comportament corect al `updateZones()`/`layOut()`, nu bug de producție — exact diagnosticul din `T-17b-tester.md`). Am păstrat cele 3 constante `T17_*_CELL` doar ca valori de referință/documentație (folosite acum pentru a calcula poziția de pixeli așteptată, nu mai seedate în `state.plots`).

## Tehnica nouă: fillere solo

Am adăugat:
- `FOREST_FILLER_COUNT = 9`, `GOLD_FILLER_COUNT = 10` — derivate din citirea directă a `ring()`/`layOut()` în `public/zones.js` (nu presupuse din brief fără verificare):
  - `ring(1) = [{-1,0},{0,1},{0,-1},{1,0}]` (4 celule) — confirmat rulând manual bucla `ring()` din cod.
  - `ring(2) = [{-2,0},{-1,1},{-1,-1},{0,2},{0,-2},{1,1},{1,-1},{2,0}]` — confirmat la fel.
  - `layOut()` alocă proiectelor "fresh" (fără `previous`) prima celulă liberă din pool, în ordinea `ring(0), ring(1), ring(2), ...` (`ring(0)={0,0}` mereu scos, rezervat turnului).
  - Toate proiectele din aceste teste au 1 agent (`cellsNeeded(1)=1`), sortarea `updateZones()` e stabilă la egalitate de `size` → ordinea de alocare urmează exact ordinea array-ului dat lui `setAgents()`.
  - Rezultă: proiect #10 (9 fillere înainte) → `{1,1}` (forest, a 6-a celulă din `ring(2)`); proiect #11 (10 fillere înainte) → `{1,-1}` (gold, a 7-a din `ring(2)`). Coincide cu calculul din brief, dar l-am reverificat independent citind codul, nu l-am luat ca literă de lege.
- `makeZoneFillers(count, labelPrefix)` — generează `count` agenți solo, cwd-uri distincte, fără jitter (proiecte separate de 1 agent fiecare).
- `assertAgentInCell(app, agent, expectedCell, context)` — verificare PROGRAMATICĂ (nu calcul pe hârtie): cheamă `app.sandbox.computeAgentPositions([agent])` (funcția de producție reală folosită de `updateAgentMovement()`/`draw()`) și compară cu `{x: cell.x*ZONE_CELL_SIZE, y: cell.y*ZONE_CELL_SIZE}`. Fiecare din cele 7 teste de mai jos o cheamă imediat după `setAgents()`, înainte de orice altă asertare — dacă numărul de fillere sau ordinea `ring()` s-ar schimba, testul ar cădea AICI, cu mesaj explicit, nu mai departe cu un fals-negativ ambiguu.

## Cele 7 teste modificate

1. **„T-17 agent la-site (idle) în cadranul pădure..."** (cădea, `0 !== 1`) — acum: 9 fillere + agentul testat, verificare poziție `{1,1}`, apoi `settleMovement` + `triggerAxeImagesLoad` ca înainte. Ce l-ar face să cadă: dacă `regionForWorldPos`/alegerea sprite-ului idle din pădure s-ar rupe, sau dacă alocarea de celule s-ar schimba (asertarea de poziție ar cădea prima).

2. **„T-17 agent care merge (walking) prin cadranul pădure..."** (cădea) — la fel, dar cu `TICKS_TO_FIRST_WALK_STEP` tick-uri parțiale (nu `settleMovement`), ca să prindă starea `walking`. Cade dacă alegerea sprite-ului de alergare din pădure se rupe.

3. **„T-17 agent la-site (idle) în cadranul aur..."** (cădea) — 10 fillere (`GOLD_FILLER_COUNT`) + agent, poziție `{1,-1}`. Cade dacă sprite-ul idle din aur se rupe.

4. **„T-17 agent care merge (walking) prin cadranul aur..."** (cădea) — la fel, cu tick-uri parțiale. Cade dacă sprite-ul de alergare din aur se rupe.

5. **„T-17 frameCount pentru topor/târnăcop ciclează pe RUN_SPRITE_FRAME_COUNT..."** (cădea) — 9 fillere + agent în pădure, la-site, apoi ciclul de 7 avansări de cadru neschimbat față de original. Cade dacă `frameCount` pentru topor/târnăcop revine la ciclul de 8 cadre în loc de 6.

6. **„T-17 agent în cadran neutru: comportament NESCHIMBAT..."** (trecea „din întâmplare") — refăcut FĂRĂ nicio manipulare `state.plots`: un singur proiect, `setAgents([agent])` simplu; documentat explicit (comentariu) că `{-1,0}` e prima celulă naturală din `ring(1)` pentru un proiect fără fillere, cu verificare programatică (`assertAgentInCell`) înainte de restul testului. Acum testul chiar dovedește ce pretinde titlul: dacă `regionForWorldPos`/alegerea sprite-ului idle s-ar rupe PENTRU cadranul neutru specific, testul ar cădea (înainte, cădea "din întâmplare" doar dacă alocarea de celule se schimba complet).

7. **„T-17 fallback: dacă sprite-ul de topor/târnăcop nu s-a încărcat..."** (trecea „din întâmplare", nu declanșa niciun `onload`) — refăcut cu 9 fillere, apoi `forestAgent` (proiect #10, joacă rolul celui de-al 10-lea filler pentru gold) și `goldAgent` (proiect #11), ambele poziții verificate programatic cu `assertAgentInCell` înainte de asertarea centrală. Acum testul dovedește cu adevărat că, deși agenții SUNT în cadranele pădure/aur (deci ar folosi calea de cod nouă din T-17), fără `onload` pe topor/târnăcop nu se desenează nimic — nu doar calea generică `spriteLoaded===false` indiferent de cadran.

## Ce nu am acoperit și de ce

- N-am adăugat un test separat pentru „forest+gold simultan CU onload declanșat" (ambele desenate corect în același `draw()`) — nu era cerut explicit de brief, iar acoperirea per-cadran (testele 1-4) deja verifică fiecare sprite izolat; un test suplimentar ar fi redundant cu ele + cu fallback-ul de mai sus.
- N-am modificat testele `regionForWorldPos` (12.1) sau cele de landmark-uri (12.3) — nu erau afectate de bug-ul de semănare (nu foloseau `stateWithPlots`/`initialState`).

## Suspiciuni de bug

Niciuna nouă — am confirmat, citind codul (`zones.js`, `app.js`), că diagnosticul planner-ului e corect: `updateZones()`/`layOut()` se comportă corect pentru un proiect fără agenți vii; problema era strict în tehnica de test.

## Comanda exactă de rulare

```powershell
node --test test/app.test.mjs
```
(din `D:\RPGfactory`, sau `node --test D:\RPGfactory\test\app.test.mjs` din orice locație).
