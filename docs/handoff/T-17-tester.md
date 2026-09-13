# T-17 — Teste pentru zonele de cadran (pădure/aur) și landmark-uri fixe

## Sarcină

Scrie teste pentru schimbările din `docs/handoff/T-17-coder.md` și `docs/handoff/T-17-coder-raport.md` (citește-le întâi) în `test/app.test.mjs`. Pe scurt: `regionForWorldPos(x,y)` întoarce `'forest'`/`'gold'`/`null` după cadran; sprite-ul unui agent (idle/run) devine axe/pickaxe run/interact quando poziția lui curentă (`entry.x`/`entry.y`) cade în cadranul corespunzător; există landmark-uri fixe (copaci animați + bolovani de aur statici) desenate independent de agenți/zone, înainte de `drawZones()`.

## Cazuri de acoperit

1. **`regionForWorldPos` — cele 4 cazuri**: `(x>0,y>0)` → `'forest'`; `(x>0,y<0)` → `'gold'`; `(x<0, orice y)` → `null`; `(0, orice y)` sau `(orice x, 0)` → `null` (pe axe, nici forest nici gold — verifică explicit, brief-ul cere `>`/`<` strict, nu `>=`/`<=`).
2. **Agent în cadranul pădure, la-site (idle)** — poziționează un agent (via `previous`/`state.plots` manipulat direct, sau prin proiecte reale care ajung acolo — alege ce e mai simplu de controlat determinist) astfel încât ținta lui finală să cadă în cadranul `forest` (x>0,y>0), lasă mișcarea să se stabilizeze (`settleMovement`), declanșează `onload` pe `pawnInteractAxeImage`, verifică `drawImage` cu acea imagine (nu `pawnImage`).
3. **Agent în cadranul pădure, walking (run)** — la un tick în care agentul se mișcă spre țintă și poziția curentă e deja în cadranul `forest`, declanșează `onload` pe `pawnRunAxeImage`, verifică `drawImage` cu acea imagine (nu `pawnRunImage`).
4. **Agent în cadranul aur — analog cazurilor 2-3**, cu `pawnInteractPickaxeImage`/`pawnRunPickaxeImage`.
5. **Agent în cadran neutru (x<0 sau pe axe)** — comportament NESCHIMBAT: `pawnImage`/`pawnRunImage`, ca înainte de T-17 (non-regresie).
6. **Fallback la neîncărcare**: dacă `pawnInteractAxeImageLoaded`/etc. e `false`, NU se desenează niciun `drawImage` pentru acel agent (la fel ca fallback-ul existent `pawnImageLoaded`/`pawnRunImageLoaded`) — verifică că nu aruncă și nu desenează sprite gol.
7. **`frameCount` corect pentru axe/pickaxe**: cadrul desenat (`sx` din `drawImage`) ciclează pe `RUN_SPRITE_FRAME_COUNT` (6), nu pe `SPRITE_FRAME_COUNT` (8), chiar și pentru varianta „interact" (idle-equivalent) în cadranele forest/gold — verifică avansând `advanceAnimationFrame()` de 7 ori și confirmând că al 7-lea cadru revine la 0 (nu la 6, cum ar fi cu 8 cadre).
8. **Landmark-uri: copaci** — declanșează `onload` pe `treeImage`, apelează `draw()`, verifică câte un `drawImage(treeImage, ...)` pentru fiecare poziție din `FOREST_TREE_POSITIONS` (3 poziții → 3 apeluri), cu coordonate sursă (`sx`) care ciclează pe `currentFrame % TREE_FRAME_COUNT` (avansează `advanceAnimationFrame()` și verifică schimbarea, la fel ca la tufele T-14).
9. **Landmark-uri: aur** — declanșează `onload` pe `goldStoneImage`, verifică 3 apeluri `drawImage(goldStoneImage, ...)` (unul per poziție din `GOLD_STONE_POSITIONS`), sursă FIXĂ (nu ciclează, spre deosebire de copaci — static, ca stâncile T-14).
10. **Landmark-uri: fără `onload`, niciun `drawImage`** — non-regresie, ca la T-15 turn/T-14 decorații.
11. **Ancorare la bază landmark-uri**: pentru o poziție cunoscută, verifică `destY + destH === worldToScreen(...).y` (baza cade exact pe punctul din lume), NU `destY + destH/2` — la fel ca testul turn din T-15.
12. **Ordinea de desenare**: `drawRegionLandmarks()` (deci `drawImage` pentru copac/aur) apare ÎNAINTE de primul `strokeRect` de zonă (`drawZones()`) în `callOrder` — la fel ca turnul.

## Ce NU e un test valid

- Nu presupune poziții exacte de agent fără să le verifici (folosește `agentPixelPosition`/`computeAgentPositions` sau construiește scenariul explicit, cu proiecte controlate — vezi tiparul „ancoră" din testele T-11/T-12/T-16b pentru cum se forțează o poziție anume, dacă ai nevoie).
- Nu testa `Math.random()` — totul aici e determinist (`regionForWorldPos`, hash-uri existente).

## Constrângeri dure

- Nu modifica `public/app.js`.
- Nu rula comenzi — planner rulează.
- `node --test`, fără dependențe noi. Adaugă helpere noi (`triggerTreeImageLoad()`, `triggerGoldStoneImageLoad()`, `triggerAxe/PickaxeImagesLoad()`) după modelul existent din fișier (căutare după `.src`, nu index fix).

## Predare

Modificări în `test/app.test.mjs` (teste noi + helpere) + `docs/handoff/T-17-tester-raport.md`: ce ai testat, ce NU (motivat), comanda exactă de rulare a întregii suite.
