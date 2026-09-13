# T-15 — Simplificare fundal (doar iarbă), zoom implicit 2x, turn în centrul hărții

## Context / bug real diagnosticat de planner

Lucian a semnalat: „ai creat un sprite în care muncitorul și iarba sunt un singur element, când se spawnează un muncitor se spawnează cu iarba". Nu e un sprite unit greșit — e o cuplare arhitecturală reală: în `drawZones()`, iarba (`grassPattern`) se desenează DOAR pe celulele unei zone (`state.plots[projectId]`), iar o zonă există DOAR cât timp acel proiect are cel puțin un agent viu (`updateZones()`). Restul hărții era fundalul de apă (T-13). Rezultat: vizual, iarba apărea și dispărea exact quando apărea/dispărea agentul — de-aici impresia de „sprite unit".

Cerința lui Lucian, verbatim: elimină apă/nori/cer complet, vrea doar iarbă peste tot pe hartă (independent de zone/agenți), zoom implicit de minim 2x (acum e 1x), spawn point rămâne în centrul hărții (deja e acolo, nu se schimbă), și un turn (asset din Tiny Swords, `assets/raw/Tiny Swords (Free Pack)/Tiny Swords (Free Pack)/Buildings/Blue Buildings/Tower.png`, deja copiat de planner la `public/sprites/tower.png`) plasat în centrul hărții.

## Sarcină

Modifică DOAR `public/app.js`:

### 1. Elimină complet apa și norii

Șterge:
- `waterImage`, `waterPattern`, blocul `waterImage.onload`, `waterImage.src` (liniile ~111-116).
- `CLOUD_DEST_WIDTH`, `CLOUD_DEST_HEIGHT`, `cloud1Image`/`cloud2Image` + flag-urile `*Loaded`, array-ul `clouds`, funcțiile `drawClouds()` și `updateClouds()` (liniile ~157-203).
- Apelul `drawClouds()` din `draw()` (linia ~490).
- Apelul `updateClouds()` din bucla de mișcare (`setInterval(..., MOVEMENT_TICK_MS)`, linia ~836).
- Comentariul de deasupra array-ului `clouds` care explică poziționarea în spațiul de ecran (nu mai are obiect).

Nu atinge `terrainImage`/`grassPattern`/`GRASS_PATCH_*` — rămân, dar li se schimbă rolul (vezi pasul 2).

### 2. Fundal de iarbă pe tot ecranul, independent de zone

În `draw()`, înlocuiește blocul care desena `waterPattern` cu unul care desenează `grassPattern` pe tot canvas-ul, mereu (nu doar în zone):

```js
ctx.fillStyle = grassPattern || FALLBACK_GRASS_COLOR;
ctx.fillRect(0, 0, canvas.width, canvas.height);
```

Adaugă constanta `const FALLBACK_GRASS_COLOR = '#4a7c3f';` lângă celelalte constante de culoare/paletă, folosită doar înainte ca `terrainImage` să se încarce (evită ecran gol/alb la primul frame).

Acest fill trebuie să fie primul lucru desenat în `draw()` (după `clearRect`), la fel cum era apa — fundal de ecran, nu urmărește camera (același comportament ca apa dinainte, doar altă textură).

### 3. Simplifică `drawZones()` — elimină fill-ul redundant

Acum că fundalul e deja iarbă peste tot, fill-ul per-celulă din `drawZones()` (`ctx.fillStyle = grassPattern || palette.fill; ctx.fillRect(...)`) devine redundant (ar desena aceeași textură peste ea însăși). Elimină acest fill. Păstrează:
- `ctx.strokeStyle = palette.stroke; ctx.lineWidth = 1; ctx.strokeRect(...)` — conturul zonei (marchează vizual unde e proiectul), neschimbat.
- Restul (decorațiuni, etichetă cu numele proiectului) — neschimbat.

Nu mai ai nevoie de `palette.fill` în `drawZones()` după acest pas (verifică dacă `colorForProject`/`palette` mai are alt scop pentru `fill` — dacă nu, poți lăsa funcția `colorForProject` neschimbată, doar nu-i mai folosești `.fill` acolo; NU șterge `colorForProject` sau `.fill` din ea, poate fi folosit în altă parte sau ulterior).

### 4. Zoom implicit 2x

Schimbă:
```js
const camera = { x: 0, y: 0, zoom: 1 };
```
în:
```js
const camera = { x: 0, y: 0, zoom: 2 };
```
`MIN_ZOOM`/`MAX_ZOOM` (0.3/3) rămân neschimbate — 2 e deja în interval, nu necesită alt calcul. Punctul de spawn (`SPAWN_POINT = { x: 0, y: 0 }`, origine, mereu centrul ecranului prin `worldToScreen`) NU se schimbă — rămâne corect indiferent de zoom.

### 5. Turn în centrul hărții

Asset deja copiat la `public/sprites/tower.png` (128×256px, sprite static, un singur cadru, fără foaie de animație).

Adaugă, lângă celelalte imagini (după blocul `terrainImage`, înainte de `pawnImage`):

```js
const TOWER_WORLD_X = 0;
const TOWER_WORLD_Y = 0;
const TOWER_DEST_WIDTH = 64;
const TOWER_DEST_HEIGHT = 128;

const towerImage = new Image();
let towerImageLoaded = false;
towerImage.onload = () => { towerImageLoaded = true; };
towerImage.src = '/sprites/tower.png';

function drawTower() {
  if (!towerImageLoaded) return;
  const pos = worldToScreen(TOWER_WORLD_X, TOWER_WORLD_Y);
  const destW = TOWER_DEST_WIDTH * camera.zoom;
  const destH = TOWER_DEST_HEIGHT * camera.zoom;
  ctx.drawImage(towerImage, pos.x - destW / 2, pos.y - destH, destW, destH);
}
```

Turnul e ancorat la BAZĂ (nu la centru): `pos.y - destH` (nu `pos.y - destH/2`), ca să pară că „stă" pe pământ la punctul `(0,0)` din lume (unde e și spawn point-ul), nu plutește centrat pe el. Lățimea rămâne centrată (`pos.x - destW/2`).

Apelează `drawTower()` în `draw()`, imediat după fill-ul de iarbă pe tot ecranul (pasul 2) și ÎNAINTE de `drawZones()` — turnul face parte din decorul fix al hărții, zonele/agenții se desenează peste el dacă se suprapun spațial.

## Constrângeri dure

- Nu modifica `zones.js`, `state.js`, `merge-state.js`, `rank.js`, `status.js`, `server.js`.
- Nu adăuga npm dependencies.
- Nu schimba mașina de stare a mișcării agenților (T-11) și nici decorațiunile de zonă (T-14/T-14b) — doar ce e cerut mai sus.
- Nu rula comenzi (planner rulează testele).

## Ce NU are voie să atingă

Orice fișier în afară de `public/app.js`.

## Predare

`docs/handoff/T-15-coder-raport.md`: ce ai șters exact (linii/nume), ce ai adăugat, confirmă că `MIN_ZOOM ≤ 2 ≤ MAX_ZOOM`, și explică ancorarea turnului (bază vs. centru) cu un calcul scurt de poziție la zoom implicit (2x).
