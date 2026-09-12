# T-14 — Raport tester

## Fișier modificat

- `D:\RPGfactory\test\app.test.mjs` (singurul fișier atins; nu am modificat `public/app.js`).

## Ce am adăugat în infrastructura de test (`loadApp()`)

1. `callOrder` — jurnal unificat de apeluri `fillRect`/`drawImage`, în ordinea EXACTĂ în care s-au produs (necesar ca să verific că norii se desenează înaintea zonelor — `fillRectCalls`/`drawImageCalls` separate nu păstrează ordinea relativă între ele).
2. `triggerBushImageLoad()`, `triggerRockImagesLoad()` (rock1 + rock2), `triggerCloudImagesLoad()` (cloud1 + cloud2) — după modelul `triggerImageLoad()`/`triggerRunImageLoad()`/`triggerTerrainImageLoad()` existent, căutare după `.src`, nu index fix.

## Teste noi (secțiunea „11. Decorațiuni de zonă + nori (T-14)”)

Helper nou: `findCellWithDecoration(app, type)` — brute-force pe cwd-uri `/proj/t14-deco-<type>-<i>` (proiect cu un singur agent → o singură celulă), calculează `decorationForCell` REAL pentru fiecare și întoarce prima celulă cu tipul cerut. Evită să ghicesc un cwd anume care produce `bush`/`rock` — testul rămâne corect indiferent de valorile hash-ului.

1. **`decorationForCell` determinist** (3 perechi `(projectId, cell)`, inclusiv un cwd cu backslash-uri) — ar cădea dacă funcția ar introduce orice sursă de nedeterminism (ex. `Math.random()`, oridine de iterare, cache mutabil greșit).
2. **Distribuție 300 celule (30×10), interval 20%-45% per categorie** — ar cădea dacă pragurile `h % 3` s-ar schimba spre o distribuție dezechilibrată (ex. `h % 5 === 0` pentru bush).
3. **Fără onload → 0 `drawImage` din `drawZones()`** (proiect cu 8 agenți, ≥2 celule) — ar cădea dacă decorațiile s-ar desena necondiționat de flag-ul `*Loaded`.
4. **Tufă animată: sx ciclează 0..7×128px** — folosește un cwd real găsit cu `findCellWithDecoration('bush')`, `triggerBushImageLoad()`, apoi 10×`advanceAnimationFrame()`. Ar cădea dacă animația tufei nu ar folosi `currentFrame % BUSH_FRAME_COUNT` sau ar folosi un contor propriu nesincronizat.
5. **Stâncă statică: aceleași argumente `drawImage` între avansări de cadru** — ar cădea dacă stânca ar fi animată din greșeală sau și-ar schimba poziția.
6. **Poziționare — test de suprapunere geometrică decorație/sprite agent.** Am calculat dreptunghiul real desenat pentru decorație (din `drawImage`) și dreptunghiul sprite-ului agentului (`agentPixelPosition` ± `SPRITE_HALF`), pentru **exact aceeași celulă** (proiect cu un singur agent). **Acest test EȘUEAZĂ cu codul curent** — vezi „Bug găsit” mai jos.
7. **Nori — mișcare**: `updateClouds()` avansează `x` cu `speed*MOVEMENT_DT` per apel, verificat prin poziția citită din `drawClouds()`. Ar cădea dacă viteza sau `MOVEMENT_DT` folosit ar fi altul.
8. **Nori — reciclare**: al treilea nor din array (`x=900, speed=10`) pornește deja peste `canvas.width` (720 în mock) — un singur `updateClouds()` îl reciclează determinist la `x = -CLOUD_DEST_WIDTH`. Am ales acest caz în loc de sute de iterații, pentru determinism și viteză. Ar cădea dacă pragul de reciclare sau valoarea de reset s-ar schimba.
9. **Ordinea de desenare**: folosind `callOrder`, verific că primul `drawImage` de nor apare înaintea primului `fillRect` de fundal de zonă (`ZONE_CELL_SIZE×ZONE_CELL_SIZE`). Ar cădea dacă `drawClouds()` ar fi mutat după `drawZones()` în `draw()`.
10. **Nori NU scalează cu zoom, decorațiile DA** — la `camera.zoom=2` (`wheel` central), verific în aceeași rulare că dimensiunea desenată a norului rămâne `CLOUD_DEST_WIDTH/HEIGHT` nescalată, iar decorația de tufă se dublează (`DECORATION_DEST_SIZE*2`). Ar cădea dacă oricare din cele două comportamente s-ar inversa.

## Bug găsit (nu l-am corectat — doar l-am demonstrat prin test)

Testul **„T-14 poziționare: dreptunghiul decorației NU se suprapune cu dreptunghiul sprite-ului agentului...”** cade cu codul curent din `public/app.js`.

Calcul, la zoom implicit (1), pentru un agent unic într-o celulă cu decorație:
- `cellSizeScreen = 80`, `destSize = DECORATION_DEST_SIZE*zoom = 40`, `offset = 4`.
- `destX = pos.x + 40 - 40 - 4 = pos.x - 4` → decorația ocupă ecranul `[pos.x-4, pos.x+36]` (la fel pe y).
- Sprite-ul agentului (`SPRITE_HALF=28`) ocupă `[pos.x-28, pos.x+28]`.
- Suprapunere: `[max(-4,-28), min(36,28)] = [-4, 28]` → **32px de suprapunere**, nu doar o atingere de colț.

Raportul coder-ului afirmă explicit intenția "ca să nu domine celula și să nu se suprapună cu centrul unde apar agenții" — geometria aleasă (`destSize` prea mare relativ la `offset`) nu îndeplinește asta. Recomand planner-ului să decidă dacă vrea `offset` mai mare sau `destSize` mai mic, nu am modificat eu codul (nu e rolul meu).

## Ce NU am acoperit (și de ce)

- **Nu am testat exact ce variantă de stâncă (`rock1` vs `rock2`) e aleasă pentru un `h%2` anume** — brief-ul cere doar „statică între avansări de cadru”, nu maparea exactă hash→variantă; ar fi un test legat de implementare, nu de comportament.
- **Nu am testat vizual poziționarea exactă a decorației relativ la colțul celulei** (dincolo de testul de suprapunere) — brief-ul cerea explicit să NU presupun exact 1/3-1/3-1/3 și să nu ghicesc constante; am preferat un test de suprapunere geometrică (comportamental) în loc de a compara `destX`/`destY` cu o formulă exactă copiată din sursă, care s-ar rupe la orice refactorizare minoră fără schimbare de comportament.
- **Nu am testat `updateClouds()` invocat din bucla reală de 50ms** (`setInterval` din `updateAgentMovement`) — brief-ul cerea apelarea directă (`updateClouds()` „ca funcție expusă pe sandbox”), ceea ce am făcut; integrarea cu bucla de timer e deja acoperită indirect de testele T-11 existente pentru `advanceMovementTick`/`MOVEMENT_TICK_MS`.
- **Nu am testat reciclarea pentru celelalte 2 nori** (index 0 și 1) — ar necesita sute de iterații pentru un test lent și fragil; am ales norul care pornește deja peste prag pentru determinism, conform regulii „nu testa nedeterminism, eșantion mare doar unde chiar contează statistic”.

## Comanda exactă de rulat

```powershell
node --test test/app.test.mjs
```

(Suita completă, T-01…T-14, într-un singur fișier — nu există alte fișiere de test în `test/`.)
