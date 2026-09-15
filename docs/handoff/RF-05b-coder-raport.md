## Ce am implementat
`migrations/003-layout.sql`, `layout.js`, `world.js` (backend, pur), `server.js` (wiring `GET /api/world` + `layoutStore` + wrapper `close()`), `public/world.js` (frontend, desen), `public/index.html` (secțiune nouă `#world-section` cu `<canvas id="world-canvas">` și `<script src="world.js">`), `public/hud.css` (stil `#world-canvas-wrap`/`#world-canvas`).

## De ce hex_layout stochează JSON, nu o tabelă normalizată per celulă
Pentru acest lot, layout-ul unui proiect se citește și se scrie mereu integral: `getLayout()` întoarce tot blob-ul de celule al fiecărui proiect, `saveLayout()` înlocuiește tot blob-ul. Nu există niciodată nevoia de a interoga sau modifica o singură celulă izolat, deci o celulă n-are identitate proprie utilă — ar fi doar o normalizare care adaugă un JOIN și un DELETE/INSERT per celulă fără niciun beneficiu real, pentru un caz de folosire care e mereu „citește tot, rescrie tot”.

## De ce NU există CAS/expectedRevision pe layout.js
Singurul scriitor e serverul însuși, dintr-un singur loc (`GET /api/world`) — nu există niciun endpoint de mutație expus unui client extern care ar putea intra în conflict cu o intenție de schimbare a altcuiva. Riscul rămas e doar cel benign al două cereri HTTP simultane care recalculează aproape simultan, ambele plecând de la același `previous` și ambele producând un rezultat la fel de valid — exact raționamentul din `observeRun` (`runs.js`): un flux automat de recalculare/ingestie, nu o intenție de schimbare protejată de o citire prealabilă. Revizia tot crește la fiecare `saveLayout` (utilă pentru diagnosticare ulterioară), dar fără verificare optimistă la scriere.

## groupProjects — ordinea determinism (mărime desc, apoi alfabetic)
`groupProjects` numără câte profiluri au fiecare `last_project` (profilurile cu `last_project` null/gol sunt excluse explicit), apoi sortează descrescător după acel număr; la egalitate, sortează alfabetic după numele proiectului (`a.id < b.id`). Asta face ordinea independentă de ordinea de întoarcere din SQLite (care e `ORDER BY created_at ASC, id ASC` pe profiluri, nu pe proiecte).

## pickAccent — cum am ales paleta și hash-ul, verificare lizibilitate light/dark
Am portat direct cele 12 culori din `PLOT_PALETTE` (bot-crossing), transformate din hex numeric Three.js în șiruri CSS (`'#c96442'`, etc.), și `hashString` ca FNV-1a simplu (`hash % PALETTE.length`), determinist pe numele proiectului. Am verificat vizual (nu am putut rula browser) că toate cele 12 culori au luminozitate/saturație medie — nu sunt nici prea deschise, nici prea închise — deci se disting pe fondul întunecat curent al `hud.css` (`#111`/`#161616`).

**Contradicție găsită** (vezi și secțiunea dedicată): `hud.css` nu are, de fapt, un sistem de teme light/dark — există o singură temă întunecată (`body { background: #111 }`), fără `prefers-color-scheme` sau clase de temă. Am proiectat paleta/textul să fie lizibile pe acest fond întunecat unic; nu am inventat un sistem de teme care nu există în cod, ca să nu depășesc scopul lotului.

## CELL (dimensiunea hexagonului în pixeli) — valoarea aleasă și de ce
`CELL = 34` (raza centru-la-colț, în pixeli CSS) — suficient de mare ca textul proiectului și sloturile să rămână lizibile, suficient de mic ca 8-9 celule (limita `MAX_CELLS=9` din `hex-layout.js`, plus câteva inele goale) să încapă vizual pe lățimea unui canvas de laptop obișnuit fără scroll. `TILE = CELL * 0.92` (puțin mai mic decât `CELL`) las un gol vizibil între hexagoane vecine din zone diferite — analog cu inset-ul `TILE = CELL * 0.992` din sursă, dar cu marjă mai mare fiindcă acolo scopul era doar să evite z-fighting 3D, aici scopul e să se distingă clar o zonă de alta la desen 2D simplu.

## Polling propriu din public/world.js — single-flight + request token
`public/world.js` are propriul `pollOnce()`, complet separat de ciclul din `hud.js`: variabile proprii (`requestToken`, `zones`), propriul `setTimeout` recursiv, aceeași disciplină de gardă (`myToken !== requestToken` -> ignoră răspunsul vechi). Nu am reutilizat/importat nimic din `hud.js` — izolare de lot explicită cerută în brief (§4.2), ca harta să rămână verificabilă independent de ecranul de tabele.

## Extinderea wrapper-ului de close()
Am extins EXACT același wrapper existent din `server.js` (`server.close = (callback) => nativeClose((err) => { server.stopPolling(); profilesStore.close(); runsStore.close(); ...})`), adăugând `layoutStore.close();` în aceeași funcție, fără să creez alt wrapper paralel. Am adăugat și `server.closeLayoutStore = layoutStore.close;`, analog cu `closeProfilesStore`/`closeRunsStore`.

## Decizii pe care le-am luat singur
- Am pus `require('./hex-layout')`/`require('./layout')`/`require('./world')` la începutul lui `server.js`, lângă restul require-urilor (nu inline în handler, cum sugera literal exemplul din brief la pasul 4) — consecvent cu restul stilului fișierului, unde toate dependențele sunt require-uite o singură dată la vârf.
- `saveLayout` folosește `INSERT ... ON CONFLICT(project) DO UPDATE SET ...` într-o singură interogare upsert per proiect, plus un `DELETE` explicit pentru proiectele dispărute din `layoutMap` — am citit reviziile existente într-un `SELECT` prealabil ca să pot incrementa corect `revision` per proiect (nu exista altă cale simplă de "revision = revision + 1 OR 1 dacă nu există" într-un singur upsert fără subquery).
- Text pe canvas: contur negru + fill alb (`#f4f2ee`, aceeași culoare ca titlurile din `hud.css`), ca numele proiectului să rămână lizibil indiferent de accentul de dedesubt.
- Canvas cu `width`/`height` fixe în HTML (800x480, doar ca fallback inițial înainte de primul resize) + CSS `width: 100%; height: 480px` + `resizeCanvasForDPR()` care recalculează `canvas.width/height` din `getBoundingClientRect()` * `devicePixelRatio` la fiecare desenare — redesenez și la `window.resize`, refolosind ultimele zone primite (nu repornesc polling-ul doar pentru resize).

## Ce nu am făcut și de ce
- Nu am atins `hex-layout.js`, `public/hud.js`, `public/game.*`, `profiles.js`, `runs.js`, `db.js`, migrațiile 001/002, `state.js`, `body.js`, `adapters/**`, `test/**` — conform listei „NU atinge” din brief.
- Nu am adăugat niciun listener de `click`/`mousemove`/`hover` pe canvas și nicio tranziție CSS/`requestAnimationFrame` — conform §4.2/§5.
- Nu am adăugat un indicator de eroare separat pentru eșecul de sondare a hărții (ex. „reîncercăm...” ca la `hud.js`) — brief-ul nu l-a cerut explicit pentru acest lot; harta rămâne pur și simplu cu ultimul desen valid la eșec. Semnalez planner-ului dacă vrea un indicator dedicat.

## Riscuri pentru tester
- `layout.js`: verifică `getLayout()` pe tabelă goală (Map goală), `saveLayout()` cu proiecte care dispar (trebuie șterse din tabelă), și incrementarea corectă a `revision` la scrieri succesive pe același proiect.
- `world.js`: `groupProjects` cu profiluri fără `last_project` (excluse), cu egalitate de mărime (ordine alfabetică), cu `last_project` gol string `''` (trebuie exclus la fel ca `null`). `pickAccent` — determinism (același input, aceeași ieșire, indiferent de câte ori e chemat).
- `GET /api/world`: verifică persistența reală între două cereri succesive (a doua cerere trebuie să pornească de la layout-ul salvat de prima, nu de la zero) și faptul că `zones` include `accent` pentru fiecare proiect din `projects`, chiar dacă `allocateCells` a întors listă goală de celule pentru vreunul (caz „complet încercuit”, posibil teoretic conform comentariilor din `hex-layout.js`).
- Frontend (`public/world.js`): fără acces la browser real, nu am putut verifica vizual desenul — testele DOM/fixture pot verifica cel mult apelul la `/api/world` și structura, nu integrarea vizuală live (asta cere dovadă browser reală, conform regulilor din `AGENTS.md`).

## Contradicții găsite în brief
Brief-ul (§3.4 pasul 2 exemplu de cod, §4.1) presupune că `public/hud.css` „are deja reguli de temă light/dark din RF-04” — nu e adevărat: fișierul curent are o singură temă întunecată fixă (`#111`), fără `prefers-color-scheme` sau clase de temă comutabile. Am proiectat paleta/textul pentru fondul întunecat existent, fără să inventez un sistem de teme absent din cod. Planner-ul ar trebui să confirme dacă acest decalaj e cunoscut sau dacă RF-04 a avut inițial un scop de temare care nu s-a mai implementat.
