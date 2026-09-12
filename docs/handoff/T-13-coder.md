# T-13 — Teren real (apă + iarbă), în loc de fundal gri/dreptunghi plat

## Sarcină

Înlocuiește fundalul complet gol al canvas-ului cu un pattern de apă (Tiny Swords), și umplerea plată `rgba(...)` a zonelor cu un pattern de iarbă (tot Tiny Swords), în loc de culoare solidă.

## Assets deja exportate

- `public/sprites/water-bg.png` — 64×64px, o singură culoare (teal) — deja perfect tileable, folosește-l direct.
- `public/sprites/terrain-tilemap.png` — 576×384px, sheet complex (platforme de iarbă cu stânci dedesubt, mai multe piese, margini rotunjite). **Nu încerca să reproduci exact platformele lor** (formă complexă, ar necesita tăiere pe măsura formei fiecărei zone, care are formă neregulată de la `zones.js`) — decupează doar un petic curat de iarbă, din interiorul unei zone mari, departe de orice margine/colț rotunjit (verifică vizual imaginea cu unealta ta de citire — ai acces la fel ca mine — înainte să alegi coordonatele exacte de decupare; nu ghici). Un petic de 48-64px pătrat, curat, e suficient.

## Rezultat așteptat

1. **Fundal de apă**: la începutul lui `draw()` (înainte de `drawZones()`), umple tot canvas-ul (`ctx.fillRect(0,0,canvas.width,canvas.height)`) cu un `CanvasPattern` creat din `water-bg.png` (`ctx.createPattern(img, 'repeat')`). Simplificare asumată: pattern-ul de apă rămâne fix în spațiul ecranului (nu urmează camera la pan) — un fundal ambiental, nu ceva ancorat de lume. Creează pattern-ul o singură dată, după ce imaginea s-a încărcat (flag de loaded, la fel ca sprite-urile).

2. **Iarbă în loc de culoare plată pe zone**: în `drawZones()`, pentru fiecare celulă, `ctx.fillStyle` devine un `CanvasPattern` de iarbă (nu `palette.fill` de la T-10) — dar generat dintr-un petic decupat, nu din imaginea întreagă:
   - Creează un canvas offscreen mic (`document.createElement('canvas')`, dimensiune egală cu peticul ales, ex. 64×64), desenează în el O SINGURĂ DATĂ (la încărcarea imaginii) porțiunea decupată din `terrain-tilemap.png` (`ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)`).
   - `ctx.createPattern(offscreenCanvas, 'repeat')` — folosește asta ca `fillStyle` pentru dreptunghiurile de zonă.
   - **Păstrează conturul colorat per proiect** (`palette.stroke`, din `ZONE_PALETTE`, T-10) — doar umplerea devine iarbă, conturul rămâne culoarea distinctivă a proiectului, ca zonele să rămână ușor de distins una de alta.
   - Simplificare asumată: pattern-ul de iarbă NU se recalculează la schimbarea `camera.zoom` (rămâne la dimensiunea nativă a peticului, indiferent de zoom) — poate arăta ușor neconcordant la zoom extrem; acceptabil acum, nu e cerut să fie perfect.

## Constrângeri dure

- Nu modifica `zones.js`, `state.js`, `merge-state.js`, `rank.js`, `status.js`, `server.js`.
- Nu adăuga npm dependencies.
- Nu atinge logica de poziționare/cameră (`worldToScreen`, `camera`, zoom/pan) — doar CE se desenează ca fundal/umplere, nu UNDE.
- Nu integra decorațiuni (tufe, stânci, nori) — doar apă + iarbă, cerute explicit.

## Ce NU are voie să atingă

`public/zones.js`, `state.js`, `public/merge-state.js`, `rank.js`, `status.js`, `server.js`, `.env*`, `.gitignore`, `README.md`, `assets/`.

## Predare

`docs/handoff/T-13-coder-raport.md`: coordonatele exacte alese pentru decuparea peticului de iarbă din `terrain-tilemap.png` (și cum le-ai verificat vizual — ai citit imaginea, nu ai ghicit), cum se testează manual. **Include comanda/output-ul exact al oricărei verificări.**
