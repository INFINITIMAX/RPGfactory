# T-11 — Mișcare reală a agenților (apar, merg spre zonă, pleacă)

## Sarcină

Agenții nu mai stau ficși la poziția din zonă — apar dintr-un punct fix ("ieșirea"), merg spre poziția lor din zonă, și când dispar (arhivați sau nu mai sunt vii), se întorc la punctul de ieșire înainte să dispară complet.

## Context — verificat direct în `src/agents/astronauts.js` (bot-crossing)

Mașina lor de stare: `spawning → walking → at-site → leaving → gone`. Citat relevant (motivul contează):
> "It adopts the spot it got to... a threade a fost sunt worse than one standing a little short of where it meant to be."

**Ce NU portăm** (simplificare conștientă, motivată): pathfinding pe grilă, steering în jurul obstacolelor, "doorway logic" (evitarea blocajului la ieșire) — la ei există pentru că au clădiri/obstacole 3D pe hartă; noi avem un canvas 2D plat, fără obstacole, deci mișcare în linie dreaptă e suficientă și corectă. **Ce portăm**: semantica stărilor, ideea de scale-in la apariție/scale-out la plecare, prag de "am ajuns" (arrive radius), prag de "a durat prea mult, renunț" (opțional, vezi mai jos).

## Rezultat așteptat, în `public/app.js`

### 1. Punctul de ieșire ("nava" simplificată)

```js
const SPAWN_POINT = { x: 40, y: canvas.height - 40 }; // colț fix, sub toate zonele
```

### 2. Stare de mișcare per agent, separată de poziția-țintă

`computeAgentPositions()` (existentă) calculează unde AR TREBUI să fie un agent (poziția din zona lui). Adaugă o structură nouă care ține poziția AFIȘATĂ curentă și starea de mișcare:

```js
const agentMovement = new Map(); // sessionId -> { state, x, y, scale, stateAge }
```

- Un `sessionId` nou (nu există încă în `agentMovement`) → inserat la `SPAWN_POINT`, `state:'spawning'`, `scale:0`, `stateAge:0`.
- Un `sessionId` care dispare din lista de agenți vii (arhivat sau proces mort) → NU se șterge imediat din `agentMovement` — trece în `state:'leaving'`, ca să apuce să "plece" vizual, apoi se elimină din `agentMovement` când ajunge înapoi la `SPAWN_POINT` sau `scale` ajunge la 0.

### 3. Buclă de mișcare (constante — alege valori rezonabile, documentează-le în raport dacă le schimbi)

```js
const MOVEMENT_TICK_MS = 50; // 20 pași/secundă
const WALK_SPEED = 140; // px/secundă
const ARRIVE_RADIUS = 6; // px
const SPAWN_SCALE_RATE = 3; // scale/secundă la apariție
const LEAVING_SHRINK_RATE = 2.2; // scale/secundă la plecare
const dt = MOVEMENT_TICK_MS / 1000;
```

La fiecare pas (`setInterval`, separat de bucla de animație a sprite-ului existentă de la T-04):
- **`spawning`**: `scale = min(1, scale + dt*SPAWN_SCALE_RATE)`; când `scale` ajunge la 1 → `state = 'walking'`.
- **`walking`**: deplasează `(x,y)` liniar către poziția-țintă curentă (din `computeAgentPositions`), cu viteză `WALK_SPEED*dt` px pe pas; când distanța până la țintă < `ARRIVE_RADIUS` → `state = 'at-site'`, poziția se fixează exact pe țintă.
- **`at-site`**: dacă poziția-țintă s-a schimbat între timp (layout de zonă recalculat), NU sări direct — trece înapoi în `walking` (agentul "merge" la noua poziție, nu teleportează).
- **`leaving`**: deplasează `(x,y)` către `SPAWN_POINT` la fel ca la `walking`, ȘI `scale = max(0, scale - dt*LEAVING_SHRINK_RATE)`; când `scale <= 0` SAU a ajuns la `SPAWN_POINT` (distanță < `ARRIVE_RADIUS`) → elimină intrarea din `agentMovement` (agentul dispare complet).

### 4. Sprite de alergare, deja exportat

`public/sprites/pawn-run.png` — 6 cadre de 192×192px (verifică tu dimensiunea exactă cu un `node -e` dacă vrei să confirmi, nu presupune). Încarcă-l la fel ca `pawn-idle.png` (`Image` + flag de loaded). Folosește-l când `state` e `walking` sau `leaving`; folosește `pawn-idle.png` când `state` e `at-site` sau `spawning` (după ce a apărut, cât încă nu s-a pornit spre țintă).

### 5. Randare

`draw()` iterează acum peste `agentMovement` (nu doar peste agenții vii direct) — un agent în `leaving` tot trebuie desenat, chiar dacă nu mai apare în `/api/agents`. Poziția desenată = `(x,y,scale)` din `agentMovement`, nu poziția-țintă brută. `scale` afectează dimensiunea sprite-ului (`SPRITE_DEST_SIZE * scale`) — un agent care tocmai apare/pleacă e vizibil mai mic.

### 6. Hit-test de click

Trebuie să folosească poziția AFIȘATĂ curentă (`agentMovement.get(id)`), nu poziția-țintă — un agent în mișcare trebuie să fie clicabil acolo unde e desenat efectiv, nu unde va ajunge.

## Constrângeri dure

- Nu modifica `zones.js`, `state.js`, `merge-state.js`, `rank.js`, `status.js`, `server.js`.
- Nu adăuga npm dependencies.
- Nu implementa pathfinding/steering/evitare de obstacole — mișcare în linie dreaptă, simplu.
- Nu atinge butonul Open/Hide/Unhide, `renderDetails`, `renderHiddenList` — doar sursa poziției/desenul se schimbă.

## Ce NU are voie să atingă

`public/zones.js`, `state.js`, `public/merge-state.js`, `rank.js`, `status.js`, `server.js`, `.env*`, `.gitignore`, `README.md`, `assets/`.

## Predare

`docs/handoff/T-11-coder-raport.md`: valorile exacte alese pentru constante (dacă diferă de cele sugerate, motivează), cum ai gestionat un agent care dispare fără să fi apucat să ajungă la `at-site` (ex. arhivat imediat după apariție), cum se testează manual. **Include comanda/output-ul exact al oricărei verificări.**
