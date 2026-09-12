# T-12 — Coder — raport

## Fișiere modificate

- `D:\RPGfactory\public\app.js`
  - Adăugat `camera = { x, y, zoom }`, `MIN_ZOOM`/`MAX_ZOOM`, `worldToScreen`/`screenToWorld`.
  - `zoneCellToPixels(cell)` întoarce acum coordonate de LUME (`cell.x * CELL_SIZE`, fără `CANVAS_CENTER_X/Y`, care au dispărut).
  - `SPAWN_POINT = { x: 0, y: 0 }` (originea lumii, în loc de `{ x: 40, y: canvas.height - 40 }`).
  - `drawZones()` și `draw()`: fiecare poziție de lume trece prin `worldToScreen()` chiar înainte de `fillRect`/`strokeRect`/`drawImage`/`arc`/`fillText`; dimensiunile desenate (`CELL_SIZE`, `SPRITE_DEST_SIZE`, `STATUS_DOT_RADIUS`, offsetul textului) sunt înmulțite cu `camera.zoom`.
  - Hit-test-ul de click a fost mutat din listener-ul `click` în `mouseup` (vezi mai jos) și folosește `screenToWorld(clickX, clickY)` comparat cu poziția de LUME din `agentMovement`, cu `CIRCLE_RADIUS` neschimbat (rază în unități de lume).
  - Adăugat `resizeCanvas()` (setează `canvas.width/height` = `innerWidth/innerHeight`, apoi `draw()`), apelat la încărcare și pe `window.resize`.
  - Adăugat handler `wheel` pe canvas (`preventDefault`, zoom ancorat pe cursor conform formulei din brief, clamp la `MIN_ZOOM`/`MAX_ZOOM`).
  - Adăugat pan prin drag: `mousedown` pe canvas, `mousemove`/`mouseup` pe `window`.
  - `agentMovement`/`stepAgentTowards`/`updateAgentMovement`/`computeAgentPositions`/`updateZones` — logica neschimbată (rămân în coordonate de LUME, cum cerea brief-ul).

- `D:\RPGfactory\public\index.html`
  - `<canvas id="canvas">` fără `width="720" height="720"` (dimensiunea vine acum din `resizeCanvas()`).
  - Titlul (`<h3>`) a primit `id="title"` ca să poată fi poziționat ca overlay (nu l-am șters — nu era cerut, doar l-am scos din fluxul normal de document, vezi CSS).

- `D:\RPGfactory\public\style.css`
  - `html, body { margin:0; padding:0; overflow:hidden }` — necesar ca și canvas-ul de `100vw/100vh` să nu producă scrollbar-uri (padding-ul vechi de 20px pe body ar fi lăsat o bandă vizibilă în afara canvas-ului).
  - `#canvas { display:block; ... }` fără `border` (border-ul de 1px ar fi scos canvas-ul din 100% × 100% real, lăsând o linie vizibilă la margine — pe fundal de aceeași culoare aproape, contează mai puțin, dar am eliminat problema la sursă).
  - `#title`, `.details`, `#hidden-panel` → `position: fixed`, câte un colț distinct (`#title` sus-stânga, `.details` sus-dreapta, `#hidden-panel` jos-stânga), fundal semi-transparent (`rgba(.., 0.75-0.9)`) + border, `z-index: 10`, ca să rămână lizibile peste harta desenată dedesubt fără să se suprapună între ele.

## Decizii care nu erau explicit în task

1. **Titlul `<h3>agent-map</h3>`** — brief-ul nu-l menționează. L-am păstrat (nu l-am șters, ar fi fost o schimbare de conținut neceută) dar l-am scos din flux (`position: fixed`) ca să nu împingă canvas-ul în jos și să nu strice "canvas pe tot ecranul". Dacă planner-ul preferă să dispară complet, e o singură linie de șters.
2. **Eliminat `border: 1px solid #333` de pe `#canvas`** — cu border, `canvas` de `100vw × 100vh` ar depăși viewport-ul cu 2px pe fiecare axă (box model), producând scrollbar. Am scos border-ul în loc să adaug `box-sizing: border-box`, mai simplu și canvas-ul oricum ocupă tot fundalul întunecat.
3. **Drag-vs-click**: am ales să NU folosesc un listener separat `click`, ci am mutat tot hit-test-ul de selecție direct în handler-ul `mouseup`, condiționat de `!dragMoved`. Motiv: la `mouseup` știu deja, din urmărirea mișcării totale de la `mousedown`, dacă pragul de 4px a fost depășit — nu mai am nevoie de un flag suplimentar ca să "anulez" un eveniment `click` separat care oricum ar fi urmat. E mai puțin cod și mai greu de dezaliniat (single sursă de adevăr pentru "a fost pan sau click").

## Ce NU am făcut

- Nu am atins `zones.js`, `state.js`, `merge-state.js`, `rank.js`, `status.js`, `server.js`, `.env*`, `.gitignore`, `README.md`, `assets/` — confirmat, nu apar în diff.
- Nu am implementat pinch/touch — doar rotiță + drag mouse, conform constrângerii.
- Nu am modificat `updateAgentMovement`/`updateZones`/butoanele Open/Hide/Unhide — logica lor e neschimbată; am atins doar `zoneCellToPixels` (conversie poziție→lume) și `draw()`/`drawZones()` (conversie lume→ecran).
- Grila legacy `hashToCellIndex`/`cellIndexToPosition`/`GRID_COLS`/`GRID_ROWS`/`GRID_OFFSET` — comentariul din cod spune că sunt păstrate doar pentru că teste existente le exercitează direct; nu le-am atins, nu erau în scopul task-ului.

## Cum se testează manual (pentru planner, nu am rulat nimic — nu am acces la shell/browser)

1. Pornește serverul (`node server.js` sau echivalent din proiect) și deschide `http://localhost:<port>` în browser.
2. **Canvas pe tot ecranul**: canvas-ul trebuie să acopere tot viewport-ul, fără scrollbar; redimensionează fereastra browser-ului → canvas-ul trebuie să se ajusteze imediat (fără refresh).
3. **Spawn în centru**: la încărcare, cu `camera` implicit (`{0,0,1}`), un agent nou apărut (stare `spawning`) trebuie să apară exact în centrul ecranului.
4. **Zoom ancorat pe cursor**: poziționează cursorul peste un element vizual fix (ex. colțul unei zone), rotește rotița — punctul de sub cursor trebuie să rămână la același loc pe ecran în timp ce restul hărții se scalează în jurul lui (nu al centrului ecranului). Testează la ambele capete (`MIN_ZOOM=0.3`, `MAX_ZOOM=3`) — zoom-ul nu trebuie să treacă de aceste limite.
5. **Pan**: apasă click-stânga pe canvas și trage — harta trebuie să urmeze cursorul 1:1 (nu proporțional cu zoom-ul, adică la zoom mare mișcarea pe ecran a hărții trebuie să corespundă exact mișcării cursorului). Eliberează mouse-ul în afara canvas-ului (pe restul paginii) — pan-ul trebuie să se oprească oricum (listener pe `window`).
6. **Drag nu declanșează selecție**: fă un drag clar (>4px) peste un agent — nu trebuie să-l selecteze. Un click simplu (fără mișcare) pe un agent trebuie să-l selecteze normal (panoul `#details` apare).
7. **Panourile overlay**: `#details` (colț dreapta-sus) și `#hidden-panel` (colț stânga-jos) trebuie să rămână vizibile și clicabile peste harta desenată, indiferent de zoom/pan.

Nu am comandă/output de verificare automată de inclus — nu am acces la shell; toate verificările de mai sus sunt manuale, în browser, de rulat de planner.
