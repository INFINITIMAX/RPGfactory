# RF-05e — brief coder: sprite-uri reale (Tiny Swords) pentru teren, clădire și pawn — înlocuiește RF-05d

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Lot:** RF-05e — **înlocuiește complet** RF-05d (respins de reviewer pentru o depășire geometrică de ~1.9px la colțul acoperișului procedural). Lucian a cerut explicit sprite-uri reale din pachetul Tiny Swords, nu forme desenate procedural. Vezi `docs/handoff/RF-05d-reviewer-raport.md` pentru motivul exact al respingerii — NU repeta aceeași greșeală de verificare geometrică (vezi §4 mai jos).

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Sarcina

Înlocuiește `drawGround`/`drawBuilding` (forme procedurale, RF-05d) și desenul pawn-ilor (cercuri cu inițială, RF-05c) cu sprite-uri REALE din pachetul **Tiny Swords** (Pixel Frog), deja licențiat și deja folosit de jocul vechi (`public/game.js`) — licența e confirmată în `assets/README.md`, nu o re-verifica, doar respect-o (nicio redistribuire a fișierelor brute, doar folosire în aplicație — deja respectat de faptul că sprite-urile sunt deja exportate în `public/sprites/`).

**Nu exportă sprite-uri noi din `assets/raw/`** — tot ce ai nevoie e deja exportat, de la jocul vechi:

- `/sprites/terrain-tilemap.png` — teren (folosit deja ca petic de iarbă decupat, vezi §2.1).
- `/sprites/tower.png` — o clădire (turn), o singură variantă de culoare (albastru) exportată momentan.
- `/sprites/pawn-idle.png` — sheet cu 8 cadre, animație de stat pe loc.
- `/sprites/pawn-run.png` — sheet cu 6 cadre, animație de mers/lucru.

## 2. Referință obligatorie — codul deja existent, nu reinventa

`public/game.js` (jocul vechi, T-13/T-15) rezolvă deja exact aceste probleme, cu aceleași sprite-uri. **Citește-l înainte să scrii cod** — portezi tehnica, nu o ghicești:

### 2.1 Terenul — petic de iarbă decupat + pattern repetat

```js
// public/game.js, liniile ~104-124
const GRASS_PATCH_SX = 40;
const GRASS_PATCH_SY = 60;
const GRASS_PATCH_SIZE = 64;

const terrainImage = new Image();
let grassPattern = null;
terrainImage.onload = () => {
  const patchCanvas = document.createElement('canvas');
  patchCanvas.width = GRASS_PATCH_SIZE;
  patchCanvas.height = GRASS_PATCH_SIZE;
  const patchCtx = patchCanvas.getContext('2d');
  patchCtx.drawImage(
    terrainImage,
    GRASS_PATCH_SX, GRASS_PATCH_SY, GRASS_PATCH_SIZE, GRASS_PATCH_SIZE,
    0, 0, GRASS_PATCH_SIZE, GRASS_PATCH_SIZE
  );
  grassPattern = ctx.createPattern(patchCanvas, 'repeat');
};
terrainImage.src = '/sprites/terrain-tilemap.png';
```

**Portează EXACT această tehnică** (aceleași coordonate de decupare `40,60,64,64` — sunt deja verificate vizual, dau un petic de iarbă fără cusătură la repetare) în `public/world.js`. Înlocuiește `drawGround` (gradientul procedural din RF-05d) cu umplerea zonei de teren folosind `grassPattern` (`ctx.fillStyle = grassPattern; ctx.fill()`), pe aceeași formă (cerc/oval) pe care o desena deja `drawGround` — doar umplutura se schimbă, din gradient în pattern de imagine.

**Încărcare asincronă**: `grassPattern` e `null` până la `onload` — `draw()` trebuie să verifice asta și să nu deseneze nimic (sau să deseneze un fallback discret, ca un dreptunghi cu o culoare solidă apropiată de verde) până se încarcă. Nu bloca restul desenului (hexagoane/pawn-uri) cât timp imaginea nu s-a încărcat încă.

### 2.2 Clădirea — `tower.png`, un singur `drawImage`

```js
// public/game.js, liniile ~129-144
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

Portează tehnica (`Image` + `onload` + flag `Loaded`, `drawImage` cu ancoră la BAZA turnului, nu la centru — `pos.x - destW/2, pos.y - destH`), dar **dimensiunile trebuie recalculate pentru hexagonul nostru mic** (`TILE ≈ 31px`, nu lumea deschisă a jocului vechi). Vezi §4 pentru cum verifici că încape.

O singură variantă de culoare există exportată (`tower.png`, turn albastru) — **NU tinta/recolorezi** sprite-ul per accent de zonă în acest lot (ar cere compunere de canale suplimentară, în afara scopului). Toate clădirile arată la fel (turnul albastru) — limitare acceptată, documentează, poate fi extinsă ulterior dacă se exportă și celelalte culori din `assets/raw/Tiny Swords (Free Pack)/.../Buildings/`.

### 2.3 Pawn-ii — `pawn-idle.png`/`pawn-run.png`, sheet cu cadre

```js
// public/game.js, liniile ~31-35 și ~180-193, ~564-572
const SPRITE_FRAME_SIZE = 192; // fiecare cadru din sheet e 192x192px
const SPRITE_FRAME_COUNT = 8; // 8 cadre de idle, așezate orizontal
const RUN_SPRITE_FRAME_COUNT = 6; // 6 cadre de alergare, așezate orizontal

// ... pawnImage/pawnRunImage încărcate la fel ca towerImage (Image + onload + flag) ...

ctx.drawImage(
  spriteImage,
  (currentFrame % frameCount) * SPRITE_FRAME_SIZE, 0, SPRITE_FRAME_SIZE, SPRITE_FRAME_SIZE,
  spriteX, spriteY, spriteSize, spriteSize
);
```

Portează tehnica de decupare (`drawImage` cu 9 argumente, sursă = cadrul curent din sheet, destinație = poziția pe canvas). **Diferență obligatorie față de jocul vechi**: acolo `currentFrame` avansează într-o buclă de timp globală, indiferent de stare. La noi:

- `pawn.working === false` → desenează un SINGUR cadru static din `pawn-idle.png` (ex. cadrul 0) — NU anima, ca să nu consumi ciclu de redesenare pentru cineva care nu lucrează.
- `pawn.working === true` ȘI `!prefersReducedMotion()` → animă ciclic prin cele 6 cadre din `pawn-run.png`, bazat pe TIMP real (`performance.now()`), NU pe numărul de cadre desenate (aceeași regulă ca pulsația de la RF-05c — `Math.floor(nowMs / DURATA_PE_CADRU) % RUN_SPRITE_FRAME_COUNT`, alege tu `DURATA_PE_CADRU`, documentează, ceva rezonabil pentru mers, ex. 100-150ms/cadru).
- `pawn.working === true` ȘI `prefersReducedMotion()` → un singur cadru static din `pawn-run.png` (ex. cadrul 0), fără ciclare — lucrul confirmat tot trebuie să fie vizibil distinct de idle, dar fără mișcare.

**Bucla `requestAnimationFrame`** (`updateAnimationLoop`, deja existentă din RF-05c) rămâne cu ACEEAȘI condiție de pornire/oprire (există pawn `working` ȘI reduced-motion fals) — acum servește la avansarea cadrelor de mers, nu doar la pulsația cercului.

Nu mai desena cercul plin + inițiala din RF-05c — sprite-ul înlocuiește complet vechiul desen al pawn-ului (fără cerc, fără text de inițială).

## 3. Verificare transparență (obligatoriu, nu presupune)

`pawn-idle.png`/`pawn-run.png` ar putea avea fundal alb în loc de transparent (verifică vizual dacă poți deschide fișierul, sau documentează explicit dacă nu poți verifica din rolul tău) — dacă fundalul NU e transparent, un dreptunghi alb ar apărea în jurul fiecărui pawn peste teren/hexagon, ceea ce ar arăta prost. **Documentează în raport ce ai verificat/presupus** — planner-ul confirmă vizual, în browser, dacă transparența e reală.

## 4. Geometrie — ÎNVAȚĂ DIN GREȘEALA DE LA RF-05d, nu o repeta

Reviewer-ul a respins RF-05d pentru că verificarea coder-ului anterior compara distanța clădirii cu **raza `TILE`** (ca și cum hexagonul ar fi un cerc), când de fapt hexagonul e un **poligon** — muchiile lui sunt mult mai aproape de centru decât `TILE` în afara direcției exacte a unui vârf. Colțul acoperișului ieșea din poligon deși „părea" sub `TILE`.

**Pentru clădire (tower.png) în acest lot**: verifică toate cele 4 colțuri ale dreptunghiului destinație (`destX, destY, destX+destW, destY+destH`) față de MUCHIILE reale ale hexagonului (interpolare liniară pe segmentul dintre cele două colțuri hexagonale adiacente direcției folosite — `corner(cx, cy, i, TILE)` pentru `i` și `i+1`), NU față de `TILE` ca rază de cerc. Alege o poziție/dimensiune conservatoare (mai degrabă prea mică decât riscând o depășire) — o clădire mică dar clar în interior e mai bună decât una mare care iese din hexagon.

Sugestie de plecare (ajustează dacă geometria nu iese, dar verifică prin calcul, nu „ochiometric"): ancorează BAZA turnului (nu centrul) la aceeași direcție folosită la RF-05d (unghi 0, spre dreapta), la o rază mai mică decât înainte (ex. `TILE * 0.55`, nu `0.8` — turnul crește în SUS de la bază, deci vârful lui e mult mai departe de centru pe axa Y decât baza, trebuie loc și pentru înălțime). Dimensiune inițială de încercat: `destWidth ≈ TILE * 0.3`, `destHeight ≈ TILE * 0.6` (raport similar cu `TOWER_DEST_WIDTH/HEIGHT` din jocul vechi, dar mult mai mic). Verifică prin calcul explicit toate cele 4 colțuri, ajustează dacă e nevoie, și scrie calculul în raport (ca reviewer-ul să-l poată reface, exact cum a refăcut el calculul tău anterior).

**Pentru pawn-uri**: sprite-ul e mic și centrat pe poziția slotului (ca vechiul cerc) — nu ar trebui să iasă din hexagon dacă `spriteSize` rămâne comparabil cu vechiul cerc (`radius ~6px` → sprite echivalent ~14-18px lățime/înălțime), dar verifică totuși, aceeași disciplină.

## 5. Ce NU face acest lot

- Nu exportă sprite-uri noi din `assets/raw/` — folosește DOAR ce există deja în `public/sprites/`.
- Nu tintuiește/recolorează `tower.png` per accent de zonă — o singură variantă (albastru) pentru toate zonele, documentat ca limitare.
- Nu adaugă `pawn-run-axe`/`pawn-interact-pickaxe` sau alte variante specifice regiunilor din jocul vechi (forest/gold) — la noi nu există regiuni, doar `pawn-idle`/`pawn-run`.
- Nicio interacțiune nouă (click, hover) pe teren/clădire/pawn.
- Nicio schimbare la `hex-layout.js`, `layout.js`, `slot-store.js`, `world.js` (backend), `server.js`, `assets/README.md`.

## 6. Fișiere

**Poți modifica:** `public/world.js` (DOAR acest fișier).

**NU atinge:** orice alt fișier — `public/hud.js`, `public/index.html`, `public/hud.css`, `public/game.*`, `public/zones.js`, `public/sprites/**` (doar citești imaginile existente, nu le modifici/adaugi), `assets/**`, `hex-layout.js`, `layout.js`, `slot-store.js`, `world.js` (rădăcina proiectului, backend), `server.js`, `profiles.js`, `runs.js`, `db.js`, `migrations/**`, `test/**`, documentele de coordonare.

## 7. Raportul

`docs/handoff/RF-05e-coder-raport.md`:

```
## Ce am înlocuit
drawGround (pattern de iarbă din terrain-tilemap.png), drawBuilding (tower.png), drawPawns (pawn-idle.png/pawn-run.png cu cadre).

## Terenul — coordonatele de decupare folosite
Confirmă că ai portat exact GRASS_PATCH_SX/SY/SIZE = 40/60/64 din game.js, nu ai inventat altele.

## Clădirea — dimensiuni și poziție finale, cu calculul geometric
Cele 4 colțuri ale dreptunghiului destinație, verificate față de muchiile reale ale hexagonului (nu față de raza TILE) — arată calculul, ca la RF-05d dar corect de data asta.

## Pawn-ii — durata per cadru la animația de mers, și cadrul static ales pentru idle/reduced-motion

## Transparența pawn-idle.png/pawn-run.png
Ce ai verificat/presupus.

## Încărcare asincronă — ce se întâmplă înainte ca imaginile să se încarce

## Decizii pe care le-am luat singur

## Ce nu am făcut și de ce

## Contradicții găsite în brief
Dacă niciuna, scrie „niciuna".
```

## 8. Constrângeri

- Nu rulezi comenzi. Nu scrii teste. Nu afirma că ceva „arată bine" — nu poți verifica vizual, doar planner-ul poate.
- Română, în cod și raport.

### Citește înainte

1. `public/game.js` — liniile ~31-35, ~104-144, ~180-230, ~560-572 (tehnicile exacte de mai sus).
2. `public/world.js` — tot fișierul curent (RF-05b/c/d), ca să știi exact ce înlocuiești.
3. `docs/handoff/RF-05d-reviewer-raport.md` — motivul exact al respingerii, ca să nu-l repeți.
4. `assets/README.md` — regula licenței (deja respectată, doar confirmă că nu adaugi assets noi).
