# T-13 — Teste pentru terenul real (apă + iarbă)

## Sarcină

Scrie teste pentru randarea de teren adăugată la T-13 (vezi `docs/handoff/T-13-coder.md` și `docs/handoff/T-13-coder-raport.md`).

**Notă**: planner a reparat deja mock-ul rupt de T-13 (indexul fix `imageInstances[0]/[1]` pentru pawn-idle/pawn-run nu mai era valid, fiindcă T-13 a adăugat două `new Image()` noi ÎNAINTEA lor — reparat prin căutare după `.src`, cu getteri noi `app.pawnIdleImage`/`app.pawnRunImage`; a adăugat și `ctx.createPattern()` + `document.createElement('canvas')` în mock). Toate 134 de teste trec acum. Extinde de-acolo, nu re-repara ce e deja reparat.

## Cazuri de acoperit

1. **Fundal de apă apare doar după încărcare**: înainte de a declanșa `onload` pe imaginea de apă, `draw()` NU trebuie să apeleze `fillRect` cu pattern-ul de apă pe tot canvas-ul (verifică absența unui `fillRect(0,0,canvas.width,canvas.height,...)` sau echivalent, înainte de încărcare).
2. **Fundal de apă după încărcare**: declanșează `onload` pe imaginea de apă (ai nevoie de un helper nou, `triggerWaterImageLoad()`, analog cu `triggerImageLoad()` — caută după `.src` conținând `water-bg`) → `draw()` apelează `fillRect` cu argumentele `(0, 0, canvas.width, canvas.height)` folosind `ctx.fillStyle` setat la rezultatul lui `createPattern()` (marker-ul `{__fakePattern:true}` din mock).
3. **Iarbă în loc de culoare plată, după încărcare**: declanșează `onload` pe imaginea de teren (helper nou, `triggerTerrainImageLoad()`, caută după `.src` conținând `terrain-tilemap`) → `drawZones()` folosește `fillStyle` = pattern-ul de iarbă (nu `palette.fill` string), pentru fiecare celulă a unei zone.
4. **Fallback pe culoare plată înainte de încărcare**: fără să declanșezi `onload`-ul terenului, `drawZones()` tot funcționează (nu aruncă) și folosește `palette.fill` (comportamentul T-10, neschimbat) — verifică explicit că fallback-ul chiar există în cod, nu doar că nu aruncă.
5. **Conturul per proiect rămâne neschimbat**: indiferent dacă terenul s-a încărcat sau nu, `strokeStyle`/apelurile `strokeRect` pentru conturul zonei rămân identice cu comportamentul de la T-10 (culoare din `ZONE_PALETTE`, neafectată de pattern-ul de umplere).
6. **Decuparea peticului de iarbă**: verifică (prin spy pe `drawImage` al contextului OFFSCREEN, dacă poți accesa acel apel — altfel documentează ca netestabil izolat și de ce) că decuparea folosește exact coordonatele raportate de coder (`sx=40, sy=60, sw=64, sh=64`) — sau, dacă nu ai acces la acel context, testează măcar că `document.createElement('canvas')` a fost apelat o singură dată (nu de fiecare draw()).

## Ce NU e un test valid

- Nu testa conținutul vizual real al pattern-urilor (nu avem canvas real) — testează doar apelurile/argumentele.
- Nu presupune valori exacte de dimensiune canvas offscreen fără să le verifici din raportul coder-ului.

## Constrângeri dure

- Nu modifica `public/app.js`.
- Nu rula comenzi — planner rulează.
- `node --test`, fără dependențe noi.

## Predare

Modificări în `test/app.test.mjs` (helpere noi + teste) + `docs/handoff/T-13-tester-raport.md`: ce ai testat, ce NU (motivat), comanda exactă de rulare a întregii suite.
