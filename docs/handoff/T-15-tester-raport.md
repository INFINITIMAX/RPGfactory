# T-15 — Raport tester

## Fișier modificat

Doar `test/app.test.mjs` (nu am atins `public/app.js` sau alt fișier de test).

## Teste noi adăugate (secțiunea 8b, rescrisă)

1. **`T-15 fundal de iarbă acoperă tot ecranul chiar și FĂRĂ nicio zonă/agent`** — `state.plots={}` (fără `setAgents`), `triggerTerrainImageLoad()`, verifică `fillRect(0,0,canvas.width,canvas.height)` cu `fillStyle` = markerul de pattern. Ar cădea dacă cineva reintroduce condiționarea ierbii de existența unei zone (bug-ul exact semnalat de Lucian, motivul T-15).
2. **`T-15 fallback: înainte de onload pe imaginea de teren...`** — fără `triggerTerrainImageLoad()`, verifică tot un `fillRect` de ecran întreg, dar cu `fillStyle` diferit de markerul de pattern (nu testez hex-ul exact, conform interdicției din brief).
3. **`T-15 apă/nori eliminate: ... nu mai există, ... exact 1 fillRect`** — verifică `app.sandbox.drawClouds/updateClouds/waterPattern/cloud1Image/cloud2Image === undefined` și că `draw()` produce exact 1 `fillRect` de fundal (nu 2, ca înainte cu apă + altceva). Ar cădea dacă oricare din acele identificatoare mai există sau dacă apar fill-uri de fundal suplimentare.
4. **`T-15 zonele nu mai desenează fill propriu`** — cu un proiect cu agenți vii + teren încărcat, verifică 0 `fillRect` cu dimensiunea unei celule (`CELL_SIZE*zoom` = 160 la zoom implicit) și exact 1 `fillRect` de ecran întreg. Ar cădea dacă `drawZones()` mai desenează un fill per-celulă.
5. **`T-15 zoom implicit e 2 (nu 1)`** — verifică `getZoom(app) === 2`. Ar cădea dacă cineva revine la `zoom: 1`.
6. **`T-15 spawn point rămâne exact în centrul canvas-ului la zoom implicit (2)`** — agent nou (spawning), verifică centrul dreptunghiului desenat = centrul canvas-ului, indiferent de zoom. Ar cădea dacă SPAWN_POINT sau formula de proiecție s-ar altera greșit sub zoom.
7. **`T-15 turn: ... centrat orizontal ... ANCORAT LA BAZĂ`** — verifică `destX+destW/2 === centrul orizontal` și, esențial, `destY+destH === centrul vertical` (NU `destY+destH/2`), plus un `assert.notEqual` explicit care ar prinde regresia "ancorat la centru". Ar cădea dacă turnul ar fi centrat vertical în loc de ancorat la bază.
8. **`T-15 turn: NU se desenează înainte de onload`** — verifică absența oricărui `drawImage` cu `towerImage` înainte de `onload`.
9. **`T-15 turn: dimensiunile desenate scalează cu zoom-ul camerei`** — zoom out la 1, apoi dublare la 2 (evitând clamp-ul de `MAX_ZOOM=3`), verifică `destW`/`destH` dublate exact. Ar cădea dacă turnul nu mai multiplică cu `camera.zoom`.
10. **`T-15 ordinea de desenare: turnul se desenează ÎNAINTE de zone`** — folosește `callOrder` (extins să includă și `strokeRect`, vezi mai jos) pentru a verifica indicele turnului < indicele primului `strokeRect` de zonă. Ar cădea dacă `drawTower()` ar fi mutat după `drawZones()`.

## Modificare infrastructură (`loadApp()`)

- **`strokeRect` acum intră și el în `callOrder`** (jurnalul unificat folosit pentru verificarea ordinii de desenare) — necesar pentru testul #10 de mai sus, fiindcă de la T-15 `drawZones()` nu mai produce niciun `fillRect` (singurul ei semnal observabil în `callOrder` a rămas `strokeRect`).
- **Adăugat `triggerTowerImageLoad()`** (analog `triggerTerrainImageLoad()`), caută `Image()` cu `.src` conținând `"tower"`.
- **Eliminat `triggerWaterImageLoad()`** — `waterImage` nu mai există în `app.js`.
- **Eliminat `triggerCloudImagesLoad()`** — `cloud1Image`/`cloud2Image` nu mai există.
- Comentariu la `createPattern()` actualizat (nu mai menționează apa).

## Ce am eliminat din testele vechi (T-13/T-14) și de ce

- **`draw() NU umple tot canvas-ul cu apă înainte de onload`** și **`după onload pe imaginea de apă, draw() umple tot canvas-ul cu pattern-ul de apă`** — `waterImage`/`waterPattern` nu mai există; înlocuite conceptual de testele noi #1-3 de mai sus (iarbă globală + fallback).
- **`drawZones(): după onload pe imaginea de teren, fiecare celulă foloseşte pattern-ul de iarbă, nu palette.fill`** și **`drawZones(): fără onload..., celulele folosesc palette.fill (fallback T-10)`** — `drawZones()` nu mai desenează NICIUN fill (nici pattern, nici `palette.fill`); testele presupuneau exact comportamentul eliminat de T-15 (item 3 din brief-ul coder-ului). Înlocuite de testul nou #4.
- **`drawZones(): conturul (strokeStyle) zonei rămâne culoarea de proiect indiferent dacă terenul s-a încărcat sau nu`** — simplificată/fuzionată în testul rescris `drawZones(): un strokeRect (contur) per celulă ... FĂRĂ fill propriu`, fiindcă distincția "cu/fără teren încărcat" nu mai are sens (drawZones() nu mai citește deloc starea de încărcare a terenului pentru propriile desenări).
- **Toate cele 4 teste T-14 de nori** (`updateClouds()` avansează x, reciclare la `-CLOUD_DEST_WIDTH`, ordinea nori-vs-zone, norii nu se scalează cu zoom-ul) — eliminate, `drawClouds`/`updateClouds`/`CLOUD_DEST_WIDTH`/`CLOUD_DEST_HEIGHT`/`clouds`/`cloud1Image`/`cloud2Image` nu mai există în `app.js`.

## Adaptări NEprevăzute explicit în brief-ul T-15-tester.md, dar necesare

Brief-ul cerea explicit doar adaptarea testelor de **apă/nori**. În timpul lucrului am descoperit că **schimbarea zoom-ului implicit (1→2, item 4 din brief-ul coder-ului)** rupe silent o serie de teste T-04/T-10/T-11/T-12/T-14 preexistente, complet independente de apă/nori, pentru că `spriteSize`/dimensiunea celulelor scalează cu `camera.zoom` peste tot în `app.js`, iar acele teste presupuneau implicit zoom=1 (niciodată nu apelau `wheel()` înainte de a măsura). Le-am adaptat pe toate (motivate individual mai jos), altfel suita ar fi picat masiv din cauze fără nicio legătură cu un bug real:

1. **`draw() desenează un indicator de status ...`** (arc+fill) — `cx`/`spriteX`/`spriteY` foloseau `SPRITE_HALF` fix; adaptat să folosească `SPRITE_HALF * getZoom(app)`.
2. **`la agent selectat, strokeRect e chemat cu zona sprite-ului`** — filtra după `w === 56` fix; adaptat să filtreze după `spriteSize = SPRITE_DEST_SIZE * zoom` (112 la zoom implicit), titlul actualizat.
3. **`drawZones(): un dreptunghi per celulă...`** → rescris ca **`un strokeRect (contur) per celulă, FĂRĂ fill propriu`**: (a) elimină așteptarea unui `fillRect` per celulă (item 3 al brief-ului coder), (b) filtrează după `ZONE_CELL_SIZE * zoom` (160, nu 80 fix) — `worldToScreen` aplică zoom-ul dimensiunii celulei desenate.
4. **`T-11 apariție: agent nou primește o intrare la SPAWN_POINT...`** — `expectedSize` nu includea `camera.zoom`; corectat la `SPRITE_DEST_SIZE * expectedScale * zoom`.
5. **`T-11 plecare critică: agent arhivat imediat după apariție...`** — `scaleBefore`/`scaleAfter` derivate din `dw / SPRITE_DEST_SIZE`, ceea ce la zoom≠1 dă `scale*zoom`, nu `scale` pur, stricând formula `expectedScaleAfter`; corectat la `dw / (SPRITE_DEST_SIZE * zoom)`.
6. **`T-12 dimensiunile desenate ale sprite-ului scalează cu zoom-ul camerei`** — presupunea explicit „zoom implicit (1)"; rescris să verifice mai întâi că zoom-ul implicit chiar e 2 (regresie testabilă separat), apoi zoom-ul OUT la 1 (evitând clamp-ul `MAX_ZOOM=3` pe care l-ar fi lovit o dublare directă din 2), verificând înjumătățirea `dw`/`dh`.
7. **`T-14 poziționare: dreptunghiul decorației NU se suprapune...`** — folosea `SPRITE_HALF`/`SPRITE_DEST_SIZE` fixe pentru dreptunghiul sprite-ului agentului; corectat cu `SPRITE_HALF * zoom`.

Aceste 7 adaptări nu ating deloc apă/nori — sunt consecința directă a itemului 4 din brief-ul coder-ului (zoom implicit 2x), pe care le-am tratat ca parte a aceleiași livrări T-15 fiindcă altfel suita ar fi raportat eșecuri false, mascând orice regresie reală.

## Ce NU am acoperit și de ce

- **Nu am testat culoarea hex exactă a `FALLBACK_GRASS_COLOR`** — interzis explicit în brief ("Ce NU e un test valid").
- **Nu am adăugat teste pentru existența fizică a fișierului `public/sprites/tower.png`** — testele rulează cu `Image()` mock-uit (`vm` sandbox), nu ating disk-ul; verificarea fișierului real e responsabilitatea planner-ului (rulare vizuală), conform raportului coder-ului.
- **Nu am modificat testele din `zones.test.mjs`, `merge-state.test.mjs`, `state.test.mjs`, `rank.test.mjs`, `status.test.mjs`, `api-open.test.mjs`** — T-15 nu a atins acele module de producție (constrângere dură a coder-ului), deci nu aveau nimic de adaptat.

## Comanda exactă de rulare

```powershell
node --test test/
```

sau, doar acest fișier:

```powershell
node --test test/app.test.mjs
```
