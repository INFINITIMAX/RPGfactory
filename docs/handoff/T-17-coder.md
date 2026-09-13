# T-17 — Zone tematice: pădure (tăiat lemne, jos-dreapta) și aur (minat, sus-dreapta)

## Context / decizie de design (aprobată de Lucian)

Lucian a cerut 2 zone pe hartă: una jos-dreapta cu copaci, unde un agent care „merge în direcția aia" să facă animație de tăiat copaci; una sus-dreapta cu aur, cu animație de adunat aur.

Decizie: legătura e de **cadran geografic**, nu de proiect specific. Fiecare proiect primește o celulă din `zones.js` (algoritmul T-08/T-16, care crește o spirală de romburi în jurul originii, în toate direcțiile). Poziția în lume a acelei celule (`zoneCellToPixels`) cade natural într-un cadran: dacă `x>0 și y>0` (dreapta-jos, cum canvas-ul are Y crescător în jos) → cadranul „pădure"; dacă `x>0 și y<0` (dreapta-sus) → cadranul „aur"; orice altă poziție (stânga, sau exact pe axe) → cadran neutru, comportament neschimbat (sprite normal). Nu se schimbă `zones.js` — doar `app.js` interpretează poziția rezultată.

Asset-uri deja copiate de planner (variantă **Blue**, ca să se potrivească cu turnul și pawn-ul existent, ambele albastre):
- `public/sprites/pawn-run-axe.png` — 1152×192, 6 cadre de 192×192 (alergare cu topor)
- `public/sprites/pawn-interact-axe.png` — 1152×192, 6 cadre de 192×192 (tăiat lemne, în buclă)
- `public/sprites/pawn-run-pickaxe.png` — 1152×192, 6 cadre de 192×192 (alergare cu tîrnăcop)
- `public/sprites/pawn-interact-pickaxe.png` — 1152×192, 6 cadre de 192×192 (minat, în buclă)
- `public/sprites/tree.png` — 1536×256, 8 cadre de 192×256 (copac cu animație de legănare, ca tufele T-14)
- `public/sprites/gold-stone.png` — 128×128, static (o singură imagine, ca stâncile T-14)

## Sarcină

Modifică DOAR `public/app.js`.

### 1. Funcție de cadran

```js
// T-17 — cadranul geografic în care cade o poziție din lume, folosit pentru
// tema vizuală/animația agentului aflat acolo. Y crescător în jos (canvas).
function regionForWorldPos(x, y) {
  if (x > 0 && y > 0) return 'forest';
  if (x > 0 && y < 0) return 'gold';
  return null;
}
```

### 2. Încarcă noile sprite-uri (lângă `pawnRunImage`)

```js
const pawnRunAxeImage = new Image();
let pawnRunAxeImageLoaded = false;
pawnRunAxeImage.onload = () => { pawnRunAxeImageLoaded = true; };
pawnRunAxeImage.src = '/sprites/pawn-run-axe.png';

const pawnInteractAxeImage = new Image();
let pawnInteractAxeImageLoaded = false;
pawnInteractAxeImage.onload = () => { pawnInteractAxeImageLoaded = true; };
pawnInteractAxeImage.src = '/sprites/pawn-interact-axe.png';

const pawnRunPickaxeImage = new Image();
let pawnRunPickaxeImageLoaded = false;
pawnRunPickaxeImage.onload = () => { pawnRunPickaxeImageLoaded = true; };
pawnRunPickaxeImage.src = '/sprites/pawn-run-pickaxe.png';

const pawnInteractPickaxeImage = new Image();
let pawnInteractPickaxeImageLoaded = false;
pawnInteractPickaxeImage.onload = () => { pawnInteractPickaxeImageLoaded = true; };
pawnInteractPickaxeImage.src = '/sprites/pawn-interact-pickaxe.png';
```

Toate 6 cadre de 192×192 — reutilizează `SPRITE_FRAME_SIZE` (192) existent. Numărul de cadre pentru run/interact e 6, EXACT cât `RUN_SPRITE_FRAME_COUNT` deja existent — reutilizează-l, nu adăuga o constantă duplicată cu aceeași valoare.

### 3. Alege setul de sprite corect la desenare

În bucla de desenare a agenților din `draw()` (unde acum se alege `running ? pawnRunImage : pawnImage`), înlocuiește cu o alegere pe 2 axe (mișcare × cadran). Calculează cadranul din poziția CURENTĂ afișată a agentului (`entry.x`, `entry.y` — nu ținta), ca tranziția să fie naturală (agentul intră vizual în zonă înainte să schimbe animația):

```js
const region = regionForWorldPos(entry.x, entry.y);
let spriteImage, spriteLoaded;
if (region === 'forest') {
  spriteImage = running ? pawnRunAxeImage : pawnInteractAxeImage;
  spriteLoaded = running ? pawnRunAxeImageLoaded : pawnInteractAxeImageLoaded;
} else if (region === 'gold') {
  spriteImage = running ? pawnRunPickaxeImage : pawnInteractPickaxeImage;
  spriteLoaded = running ? pawnRunPickaxeImageLoaded : pawnInteractPickaxeImageLoaded;
} else {
  spriteImage = running ? pawnRunImage : pawnImage;
  spriteLoaded = running ? pawnRunImageLoaded : pawnImageLoaded;
}
```

`running` rămâne definit exact ca acum (`entry.state === 'walking' || entry.state === 'leaving'`). Frame count-ul pentru desenare: dacă `region` e `'forest'`/`'gold'`, e mereu `RUN_SPRITE_FRAME_COUNT` (6, atât pentru run cât și pentru interact — ambele foi au 6 cadre); altfel rămâne `frameCount` existent (`running ? RUN_SPRITE_FRAME_COUNT : SPRITE_FRAME_COUNT`). Restul logicii de desenare (poziție, scală, `currentFrame % frameCount`) NU se schimbă.

### 4. Decorațiuni fixe de cadran (copaci + aur), independente de agenți/zone

Ca turnul (T-15): desenate mereu, la poziții fixe din lume, indiferent de proiecte/agenți.

```js
const FOREST_TREE_POSITIONS = [
  { x: 220, y: 220 }, { x: 300, y: 260 }, { x: 260, y: 320 },
];
const GOLD_STONE_POSITIONS = [
  { x: 220, y: -220 }, { x: 300, y: -260 }, { x: 260, y: -320 },
];
const TREE_FRAME_SIZE = 192; // 8 cadre de 192x256
const TREE_FRAME_COUNT = 8;
const TREE_FRAME_HEIGHT = 256;
const TREE_DEST_WIDTH = 48;
const TREE_DEST_HEIGHT = 64;
const GOLD_STONE_SIZE = 128; // nativ, static
const GOLD_STONE_DEST_SIZE = 32;

const treeImage = new Image();
let treeImageLoaded = false;
treeImage.onload = () => { treeImageLoaded = true; };
treeImage.src = '/sprites/tree.png';

const goldStoneImage = new Image();
let goldStoneImageLoaded = false;
goldStoneImage.onload = () => { goldStoneImageLoaded = true; };
goldStoneImage.src = '/sprites/gold-stone.png';

function drawRegionLandmarks() {
  if (treeImageLoaded) {
    for (const p of FOREST_TREE_POSITIONS) {
      const pos = worldToScreen(p.x, p.y);
      const destW = TREE_DEST_WIDTH * camera.zoom;
      const destH = TREE_DEST_HEIGHT * camera.zoom;
      ctx.drawImage(
        treeImage,
        (currentFrame % TREE_FRAME_COUNT) * TREE_FRAME_SIZE, 0, TREE_FRAME_SIZE, TREE_FRAME_HEIGHT,
        pos.x - destW / 2, pos.y - destH, destW, destH
      );
    }
  }
  if (goldStoneImageLoaded) {
    for (const p of GOLD_STONE_POSITIONS) {
      const pos = worldToScreen(p.x, p.y);
      const destSize = GOLD_STONE_DEST_SIZE * camera.zoom;
      ctx.drawImage(goldStoneImage, 0, 0, GOLD_STONE_SIZE, GOLD_STONE_SIZE, pos.x - destSize / 2, pos.y - destSize, destSize, destSize);
    }
  }
}
```

Ancorare la BAZĂ (ca turnul): `pos.y - destH` (nu `pos.y - destH/2`), ca să pară că „stau pe pământ", nu plutesc. Copacii folosesc `currentFrame` (contorul de animație deja existent, la fel ca tufele T-14 — legănare sincronă cu restul animațiilor, nu-i nevoie de altul separat).

Apelează `drawRegionLandmarks()` în `draw()`, imediat după `drawTower()` și ÎNAINTE de `drawZones()` (aceeași logică: decor fix de hartă, desenat înainte de zone/agenți).

## Constrângeri dure

- Nu modifica `public/zones.js`, `state.js`, `merge-state.js`, `rank.js`, `status.js`, `server.js`.
- Nu adăuga npm dependencies.
- Nu schimba mașina de stare a mișcării (T-11), decorațiunile de zonă (T-14/T-14b, tufe/stânci pe celule), turnul (T-15) — doar adaugă ce e cerut mai sus.
- Nu introduce o constantă nouă pentru "6 cadre" — reutilizează `RUN_SPRITE_FRAME_COUNT`.

## Ce NU are voie să atingă

Orice fișier în afară de `public/app.js`.

## Predare

`docs/handoff/T-17-coder-raport.md`: ce ai adăugat exact (linii/nume), confirmă cu un exemplu concret de poziție (`x`,`y`) care cade în fiecare cadran (`forest`/`gold`/`null`), și ancorarea la bază a landmark-urilor cu un calcul scurt (ca la T-15 pentru turn).
