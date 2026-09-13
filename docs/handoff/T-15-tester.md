# T-15 — Teste pentru fundal de iarbă pe tot ecranul, zoom implicit 2x, turn central

## Sarcină

Scrie teste pentru schimbările din `docs/handoff/T-15-coder.md` și `docs/handoff/T-15-coder-raport.md` (citește-le întâi). Pe scurt: apa/norii au fost eliminate, fundalul e acum iarbă pe tot ecranul (independent de zone), zoom implicit e 2 (nu 1), zonele nu mai desenează fill (doar contur), și există un turn static desenat în centrul hărții (world origin).

## Cazuri de acoperit

1. **Fundal de iarbă pe tot ecranul, chiar și fără nicio zonă**: setează `agents = []` (fără proiecte, deci `state.plots = {}`), declanșează `onload` pe `terrainImage`, verifică că `draw()` produce un `fillRect(0, 0, canvas.width, canvas.height)` cu `fillStyle` = markerul de pattern al ierbii — deci iarba NU mai depinde de existența vreunei zone/agent. Acesta e testul central al fix-ului (înainte de T-15, fără agenți nu exista NICIUN fill de iarbă).
2. **Fallback înainte de încărcare**: fără să declanșezi `onload` pe `terrainImage`, verifică `fillRect(0,0,canvas.width,canvas.height)` cu `fillStyle` = culoarea fallback (constanta nouă din raportul coder-ului), nu markerul de pattern.
3. **Apă/nori eliminate**: verifică că nu mai există niciun `drawImage`/`fillRect` provenind din fostele `waterImage`/`cloud1Image`/`cloud2Image` — cel mai simplu, verifică că funcțiile/variabilele globale `drawClouds`/`updateClouds`/`waterPattern`/`cloud1Image`/`cloud2Image` NU mai există pe obiectul întors de `loadApp()` (au fost șterse), și că un singur `draw()` produce exact 1 `fillRect` de fundal (nu 2, cum era înainte cu apă+eventual alt fill).
4. **Zonele nu mai desenează fill propriu**: pentru un proiect cu agenți vii, după `onload` pe `terrainImage`, verifică că NU există un `fillRect` suplimentar cu dimensiunea unei celule (`CELL_SIZE * camera.zoom`, la zoom implicit `160×160`) — doar `strokeRect` de conturul zonei rămâne, plus fill-ul global de ecran de la pasul 1.
5. **Zoom implicit e 2**: verifică direct (dacă `camera` e expus pe sandbox — verifică cum ai acces, la fel ca la testele de zoom din T-12) că valoarea inițială a `camera.zoom` e `2`, nu `1`.
6. **Spawn point tot în centru la zoom 2**: pentru un agent nou (stare `spawning`), verifică că poziția lui pe ecran corespunde tot centrului canvas-ului (`canvas.width/2`, `canvas.height/2`) — neschimbat de zoom (folosește helperul existent `agentPixelPosition`, la fel ca la T-12).
7. **Turnul se desenează, static, în centrul hărții**: declanșează `onload` pe imaginea turnului, apelează `draw()`, verifică un `drawImage(towerImage, ...)` cu destinație centrată orizontal pe centrul ecranului (`canvas.width/2`) și ancorată la BAZĂ (marginea de jos a imaginii, nu centrul, cade pe centrul vertical al ecranului — verifică explicit `destY + destH === canvas.height/2`, nu `destY + destH/2 === canvas.height/2`).
8. **Turnul nu se desenează înainte de încărcare**: fără `onload` pe imaginea turnului, `draw()` nu produce niciun `drawImage` cu acea imagine.
9. **Turnul se scalează cu zoom-ul**: la `camera.zoom = 1` vs `camera.zoom = 2`, dimensiunile `destW`/`destH` din `drawImage` pentru turn se dublează exact (spre deosebire de nori, care nu mai există, dar la fel ca decorațiunile de zonă, turnul scalează cu zoom).
10. **Ordinea de desenare**: turnul se desenează ÎNAINTE de zone (verifică ordinea apelurilor `drawImage`/`strokeRect` în `drawImageCalls`/`strokeRectCalls`, sau apelează funcțiile separat dacă sunt expuse).

## Ce NU e un test valid

- Nu testa exact culoarea hex a fallback-ului dacă nu e documentată clar în raportul coder-ului — verifică doar că fill-ul se produce și că NU e markerul de pattern.
- Nu presupune un ordin exact de linii în cod — testează comportament (apeluri canvas), nu structura sursei.

## Constrângeri dure

- Nu modifica `public/app.js`.
- Nu rula comenzi — planner rulează.
- `node --test`, fără dependențe noi. Reia patternurile existente din `test/app.test.mjs` (`loadApp()`, `triggerImageLoad`-style helpere pe bază de `.src`, `settleMovement`, `agentPixelPosition`) — dacă ai nevoie de un helper nou pentru `towerImage`/`terrainImage` (fără index fix, căutare după `.src`), adaugă-l după modelul existent.

## Predare

Modificări în `test/app.test.mjs` (teste noi, elimină/adaptează testele vechi de apă/nori din T-13/T-14 care nu mai au sens — motivează în raport ce ai șters și de ce) + `docs/handoff/T-15-tester-raport.md`: ce ai testat, ce ai eliminat din testele vechi și de ce, comanda exactă de rulare a întregii suite.
