# T-12 — Cameră 2D (zoom + pan), canvas pe tot ecranul, punctul de start în centru

## Sarcină

Trei schimbări legate între ele, toate în jurul introducerii unui sistem de coordonate "lume" (world space), separat de pixelii de pe ecran:

1. Canvas-ul ocupă tot ecranul (nu 720×720 fix).
2. Zoom cu rotița mouse-ului, ancorat pe cursor (nu pe centrul ecranului).
3. Pan prin drag cu mouse-ul.
4. Punctul de apariție al agenților (`SPAWN_POINT`) devine originea lumii — cade exact în centrul ecranului la zoom implicit.

## Context — principiul de zoom, verificat în `src/core/camera.js` (bot-crossing)

Citat din comentariul lor:
> "The wheel zooms at the cursor, not at the screen centre. The ground point under the pointer is held still while the camera dollies."

La ei e camera 3D orbit, complexă. Noi portăm doar **principiul** (zoom ancorat pe cursor), cu matematică 2D simplă, nu portăm codul lor (irelevant, alt sistem de coordonate).

## Rezultat așteptat

### 1. Sistem de coordonate: lume vs. ecran

Introdu o stare de cameră la nivel de script:
```js
const camera = { x: 0, y: 0, zoom: 1 }; // camera.x/y = punctul din LUME aflat curent în centrul ecranului
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
```

Două funcții de conversie, folosite peste tot unde acum se calculează poziții pe canvas:
```js
function worldToScreen(wx, wy) {
  return {
    x: canvas.width / 2 + (wx - camera.x) * camera.zoom,
    y: canvas.height / 2 + (wy - camera.y) * camera.zoom,
  };
}
function screenToWorld(sx, sy) {
  return {
    x: camera.x + (sx - canvas.width / 2) / camera.zoom,
    y: camera.y + (sy - canvas.height / 2) / camera.zoom,
  };
}
```

### 2. Refactorizare: totul ține poziții în LUME, conversia la ecran se face doar la desenare/click

- `zoneCellToPixels(cell)` — redenumește-o conceptual (poate păstra numele, dar acum întoarce coordonate de LUME, nu de ecran): `{ x: cell.x * CELL_SIZE, y: cell.y * CELL_SIZE }`, FĂRĂ `CANVAS_CENTER_X/Y` (acelea dispar — originea lumii e `{0,0}`, nu mai are legătură cu dimensiunea canvas-ului).
- `agentMovement` (poziția x/y ținută acolo) rămâne în coordonate de LUME — `stepAgentTowards` calculează distanțe/pași tot în lume, neschimbat ca logică.
- `SPAWN_POINT = { x: 0, y: 0 }` — chiar originea lumii. La `camera = {x:0,y:0,zoom:1}` (starea implicită), asta cade exact în centrul ecranului (`worldToScreen(0,0)` = centrul canvas-ului) — exact cerința "punctul de start în centrul ecranului".
- **`draw()`**: pentru fiecare poziție de lume calculată (zone, agenți), aplică `worldToScreen(...)` chiar înainte de `ctx.fillRect`/`drawImage`/`arc`/`fillText`. Dimensiunile desenate (mărimea celulei, `SPRITE_DEST_SIZE`, `STATUS_DOT_RADIUS`) se înmulțesc cu `camera.zoom`, ca totul să se scaleze coerent la zoom (o celulă de 80px în lume devine `80*camera.zoom` px pe ecran).
- **Hit-test de click**: transformă coordonatele de click cu `screenToWorld(clickX, clickY)`, apoi compară cu poziția de LUME a agentului (`agentMovement.get(id)`), cu raza de hit-test tot în unități de lume (neschimbată de zoom) — mai simplu decât să scalezi raza.

### 3. Canvas pe tot ecranul

- `canvas.width`/`canvas.height` = `window.innerWidth`/`window.innerHeight`, setate la încărcare ȘI la evenimentul `resize` (adaugă un listener; re-desenează după resize).
- Layout (`index.html`/`style.css`): canvas-ul trebuie să ocupe tot viewport-ul; panourile UI existente (`#details`, `#hidden-panel`) trebuie să rămână utilizabile, poziționate ca overlay (ex. `position: fixed`, colț din ecran), nu înghesuite sub canvas în flux normal de document. Ajustează CSS-ul minim necesar ca să nu se suprapună neplăcut peste hartă (ex. un colț, cu fundal semi-transparent ca să rămână lizibil peste orice e desenat dedesubt).

### 4. Zoom cu rotița, ancorat pe cursor

Pe `wheel` (canvas), cu `event.preventDefault()`:
1. Calculează poziția de lume sub cursor ÎNAINTE de schimbarea zoom-ului: `const before = screenToWorld(cursorX, cursorY);`
2. Schimbă `camera.zoom` (înmulțire, nu adunare — ex. `camera.zoom *= (1 - event.deltaY * 0.001)`), clampat între `MIN_ZOOM`/`MAX_ZOOM`.
3. Recalculează `camera.x`/`camera.y` ca punctul de sub cursor să rămână EXACT sub cursor după schimbare: din formula `worldToScreen`, rezolvă `camera.x = before.x - (cursorX - canvas.width/2) / camera.zoom` (și similar pentru y, cu noul `camera.zoom`).
4. Redesenează.

### 5. Pan prin drag

- `mousedown` pe canvas → începe drag, reține poziția curentă a cursorului.
- `mousemove` (pe `window`, nu doar pe canvas, ca drag-ul să continue chiar dacă cursorul iese momentan din canvas) → cât timp e activ drag-ul, calculează delta de ecran față de ultima poziție, convertește în delta de lume (împarte la `camera.zoom`), scade din `camera.x`/`camera.y` (conținutul urmează cursorul 1:1). Redesenează la fiecare mișcare.
- `mouseup` (pe `window`) → oprește drag-ul.
- Un simplu drag (fără mișcare semnificativă) nu trebuie să declanșeze accidental selecția unui agent — dacă mișcarea totală depășește un prag mic (ex. 4px), tratează ca pan, nu ca click de selecție (verifică ce e mai simplu de implementat corect, motivează în raport).

## Constrângeri dure

- Nu modifica `zones.js`, `state.js`, `merge-state.js`, `rank.js`, `status.js`, `server.js`.
- Nu adăuga npm dependencies.
- Nu atinge logica de `updateAgentMovement`/`updateZones`/butoanele Open/Hide/Unhide — doar sursa de conversie poziție→pixel și interacțiunea de cameră.
- Nu implementa zoom pe touch/pinch — doar rotiță + drag cu mouse-ul, suficient acum.

## Ce NU are voie să atingă

`public/zones.js`, `state.js`, `public/merge-state.js`, `rank.js`, `status.js`, `server.js`, `.env*`, `.gitignore`, `README.md`, `assets/`.

## Predare

`docs/handoff/T-12-coder-raport.md`: cum ai rezolvat layout-ul CSS pentru panourile overlay peste canvas-ul de tot ecranul, pragul ales pentru distincția drag-vs-click, cum se testează manual (zoom pe o zonă, pan, verifică poziția stabilă a punctului de sub cursor la zoom). **Include comanda/output-ul exact al oricărei verificări.**
