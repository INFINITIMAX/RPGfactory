# T-13 — Raport coder

## Fișiere modificate

- `public/app.js` — singurul fișier atins:
  - Adăugat bloc nou (după `lastPlotsSignature`, înainte de `pawnImage`): `waterImage`/`waterPattern` (încărcat din `/sprites/water-bg.png`, pattern creat în `onload`) și `terrainImage`/`grassPattern` (încărcat din `/sprites/terrain-tilemap.png`; la `onload`, decupează un petic `64×64` la `sx=40, sy=60` într-un canvas offscreen și creează pattern-ul din acel canvas).
  - `drawZones()`: linia `ctx.fillStyle = palette.fill;` a devenit `ctx.fillStyle = grassPattern || palette.fill;` — fallback pe culoarea plată din T-10 cât timp imaginea nu s-a încărcat încă. `ctx.strokeStyle = palette.stroke` a rămas neschimbat (conturul colorat per proiect e păstrat, cum cere brief-ul).
  - `draw()`: la început, după `clearRect`, adăugat blocul `if (waterPattern) { ctx.fillStyle = waterPattern; ctx.fillRect(0,0,canvas.width,canvas.height); }`, înainte de `drawZones()`.

Nu am atins `zones.js`, `state.js`, `merge-state.js`, `rank.js`, `status.js`, `server.js`, `.env*`, `.gitignore`, `README.md`, `assets/`.

## Verificare vizuală a coordonatelor de decupare (nu am ghicit)

Am citit `public/sprites/terrain-tilemap.png` (576×384px) cu unealta de citire de imagini. Sheet-ul conține două grupuri de piese: stânga (pătrat mare de iarbă + o coloană îngustă + un dreptunghi orizontal + un pătrat mic + două piese triunghiulare cu stânci dedesubt) și dreapta (pătrat mare de iarbă + altă piesă + platforme late cu stânci dedesubt).

Piesa aleasă: **pătratul mare din colțul stânga-sus**, care ocupă aproximativ `x: 0–155, y: 0–195`. Are o margine ondulată/scalonată, de culoare mai închisă (turcoaz-verde-închis), groasă de cca 15–20px pe tot conturul, iar interiorul e un galben-verzui uniform, curat, fără zgomot vizual.

Am ales peticul de decupare **la distanță sigură de orice margine**:

```
sx = 40, sy = 60, sw = 64, sh = 64
```

Aceasta cade în intervalul `x: 40–104` și `y: 60–124`, complet în interiorul pătratului `0–155 / 0–195`, cu marjă de minim 40px față de marginile stânga/sus și minim ~50px față de dreapta/jos ale piesei — deci în afara zonei scalonate/închise la culoare de pe margini.

## Cum se testează manual

1. Rulează serverul (`node server.js` sau echivalent din README) și deschide `http://localhost:<port>` în browser.
2. Verifică vizual:
   - Fundalul canvas-ului (zona fără nicio zonă de proiect) trebuie să fie un pattern de apă turcoaz repetat, nu gri/negru gol.
   - Zonele de proiect (dreptunghiurile din `drawZones()`) trebuie să aibă interiorul umplut cu un pattern de iarbă repetat (nu culoare plată transparentă ca înainte), iar conturul zonei să rămână colorat distinct per proiect (culoarea din `ZONE_PALETTE`, ca la T-10).
   - La pan (drag) fundalul de apă nu trebuie să se miște (rămâne fix pe ecran); zonele de iarbă se mișcă odată cu lumea (urmăresc `worldToScreen`).
   - La zoom, peticul de iarbă nu se recalculează la dimensiune nouă (comportament acceptat explicit în brief).
3. Deschide DevTools → Network și confirmă că `water-bg.png` și `terrain-tilemap.png` se încarcă cu status 200.

Nu am rulat nicio comandă (nu am acces la shell) — verificarea de mai sus e doar descrierea pașilor pentru planner; nu am executat niciun test sau server.

## Ce nu am făcut

- Nu am scris teste (rol tester).
- Nu am rulat nimic (build, server, teste) — nu am unelte de shell.
- Nu am adăugat decorațiuni (tufe/stânci/nori) — doar apă + iarbă, cum s-a cerut explicit.

## Ce ar trebui verificat de planner

- Rularea vizuală descrisă mai sus, într-un browser real, pentru confirmarea că peticul de iarbă ales (`sx=40, sy=60, 64×64`) arată curat la repetare (fără artefacte de margine vizibile la seam-uri).
- Dacă există teste existente (Playwright/altele) care verifică `ctx.fillStyle` sau culoarea zonelor direct (ex. teste de la T-10) — acestea ar putea eșua acum, fiindcă `fillStyle` devine un `CanvasPattern`, nu un string `rgba(...)`. De verificat cu tester-ul/reviewer-ul dacă există asemenea teste ce trebuie actualizate.
