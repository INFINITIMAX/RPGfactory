# T-12 — Teste pentru camera 2D (zoom/pan) + repararea mock-ului pentru canvas full-screen

## Sarcină, în două părți

### Partea 1 — reparare (obligatorie întâi)

`canvas.width`/`canvas.height` nu mai sunt fixe (720) — vin din `resizeCanvas()`, care citește `window.innerWidth`/`innerHeight`. Mock-ul actual din `test/app.test.mjs` are `fakeCanvas.width/height` fixate la 720 și probabil nu are `window` deloc în sandbox. Verifică exact ce lipsește (`window.innerWidth/innerHeight`, `window.addEventListener('resize', ...)`, `addEventListener('wheel', ...)`/`mousedown`/`mousemove`/`mouseup` pe `canvas`/`window`) și adaugă mock-uri minime — la fel ca pentru elementele DOM anterioare, aruncă explicit pe orice apel neprevăzut, nu răspunde silențios.

Testele vechi care presupuneau `canvas.width/height === 720` fix, sau poziții calculate cu vechiul `CANVAS_CENTER_X/Y`, trebuie actualizate — poziția de ecran pentru un `SPAWN_POINT`/zonă depinde acum de `camera` (implicit `{x:0,y:0,zoom:1}`) ȘI de dimensiunea canvas-ului mock-uit. Alege o dimensiune fixă rezonabilă pentru mock (ex. `800x600` sau păstrează `720x720` dacă simplifică), documentează alegerea.

## Cazuri noi de acoperit

1. **`worldToScreen`/`screenToWorld` sunt inverse una alteia**: pentru puncte aleatorii, `screenToWorld(worldToScreen(x,y).x, worldToScreen(x,y).y)` ≈ `{x,y}` (cu toleranță pentru float), la zoom ≠ 1 și `camera.x/y` ≠ 0.
2. **Spawn în centru la camera implicită**: cu `camera = {x:0,y:0,zoom:1}`, `worldToScreen(0,0)` = `{canvas.width/2, canvas.height/2}` exact.
3. **Zoom ancorat pe cursor**: simulează un eveniment `wheel` la o poziție de cursor NU în centrul ecranului — verifică (folosind formula reală din cod, nu presupusă) că `screenToWorld(cursorX, cursorY)` întoarce ACELAȘI punct de lume înainte și după schimbarea zoom-ului (asta e testul care contează cel mai mult pentru acest task).
4. **Clamp de zoom**: simulează evenimente `wheel` repetate în aceeași direcție — `camera.zoom` nu trebuie să depășească `MAX_ZOOM`/`MIN_ZOOM`.
5. **Pan mută camera, nu conținutul direct**: simulează `mousedown`+`mousemove`(delta cunoscut)+`mouseup` — verifică schimbarea așteptată în `camera.x`/`camera.y` (ține cont de împărțirea la `camera.zoom`, testează la zoom ≠ 1 ca să prinzi o eventuală lipsă a acelei împărțiri).
6. **Prag drag-vs-click**: o mișcare sub 4px între `mousedown` și `mouseup` tot selectează agentul de sub cursor (dacă există); o mișcare peste prag NU selectează, chiar dacă punctul final e peste un agent.
7. **Resize**: apelează funcția de resize (sau simulează evenimentul, dacă e expusă/accesibilă) cu dimensiuni noi — verifică că poziții calculate ulterior reflectă noile `canvas.width/height`.
8. **Dimensiunile desenate scalează cu zoom-ul**: la `camera.zoom = 2`, dimensiunea sprite-ului desenat (parametrii `dw`/`dh` din `drawImage`, sau raza din `arc`) trebuie să fie dublă față de zoom 1 — verifică cu spy-urile existente.

## Ce NU e un test valid

- Nu testa evenimente reale de mouse/tastatură într-un DOM real (nu avem browser headless) — simulează direct apelarea handler-elor capturate din `addEventListener`, la fel ca `clickHandler`/`openBtnClickHandler` de la task-urile anterioare.
- Nu presupune valori exacte de framerate/timing pentru pan — testează efectul unei singure mișcări (delta cunoscut), nu o secvență lungă nedeterministă.

## Constrângeri dure

- Nu modifica `public/app.js`, `public/index.html`, `public/style.css`.
- Nu rula comenzi — planner rulează.
- `node --test`, fără dependențe noi.

## Predare

Modificări în `test/app.test.mjs` (reparare + extindere) + `docs/handoff/T-12-tester-raport.md`: ce ai reparat, ce ai testat, ce NU (motivat), comanda exactă de rulare a întregii suite.
