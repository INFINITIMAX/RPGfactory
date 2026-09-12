# T-13 — Raport tester

## Fișier modificat

- `test/app.test.mjs` (singurul fișier atins, cum cere brief-ul):
  - Mock extins în `loadApp()`:
    - `fillRect`/`strokeRect` reținem acum și `fillStyle`/`strokeStyle` activ la momentul apelului, în array-uri noi index-corespondente: `fillRectStyles`, `strokeRectStyles` (nu am schimbat formatul `fillRectCalls`/`strokeRectCalls` existent, ca să nu rup testele T-10 care le folosesc deja).
    - `document.createElement('canvas')` (canvas-ul offscreen de decupare a peticului de iarbă) înregistrează acum apelurile în `offscreenCreateCalls` și apelurile `drawImage()` pe contextul lui în `offscreenDrawImageCalls`.
    - Helpere noi expuse pe obiectul întors de `loadApp()`: `triggerWaterImageLoad()` (caută `Image()` cu `.src` conținând `water-bg`), `triggerTerrainImageLoad()` (caută `.src` conținând `terrain-tilemap`), analoge cu `triggerImageLoad()`/`triggerRunImageLoad()` existente.
  - Secțiune nouă „8b. Teren real: apă + iarbă (T-13)” cu 7 teste noi, plus helper `setupZoneApp(app, cwd, agentCount)` care populează `state.plots[cwd]` cu cel puțin o celulă (același tipar ca testul T-10 existent pentru `drawZones()`).

## Teste noi și ce le-ar face să cadă

1. **`draw() NU umple tot canvas-ul cu apă înainte ca imaginea de apă să se "încarce"`**
   Verifică absența unui `fillRect(0,0,720,720)` în `draw()` cât timp `waterImage.onload` nu a fost declanșat.
   → Ar cădea dacă `waterPattern` ar fi folosit necondiționat (fără garda `if (waterPattern)`) sau dacă fundalul s-ar desena chiar și cu pattern `null`/`undefined`.

2. **`după onload pe imaginea de apă, draw() umple tot canvas-ul cu pattern-ul de apă`**
   Declanșează `triggerWaterImageLoad()`, apoi verifică exact apelul `fillRect(0,0,720,720)` cu `fillStyle` egal cu marker-ul `{__fakePattern:true}` din `createPattern()`.
   → Ar cădea dacă `draw()` n-ar mai apela `fillRect` pe tot canvas-ul după încărcare, dacă ar folosi coordonate greșite, sau dacă ar seta `fillStyle` la altceva decât rezultatul lui `createPattern()`.

3. **`drawZones(): după onload pe imaginea de teren, fiecare celulă foloseşte pattern-ul de iarbă, nu palette.fill`**
   Declanșează `triggerTerrainImageLoad()`, apoi verifică pentru FIECARE `fillRect` din `drawZones()` că `fillStyle` == marker-ul de pattern.
   → Ar cădea dacă `grassPattern` n-ar fi folosit (ex. dacă coder-ul ar fi uitat `||` și ar fi lăsat mereu `palette.fill`, sau dacă doar prima celulă ar primi pattern-ul și restul culoarea plată).

4. **`drawZones(): fără onload pe imaginea de teren, celulele folosesc în continuare palette.fill (fallback T-10)`**
   Fără să declanșeze onload-ul terenului, verifică `fillStyle === palette.fill` (string, comportamentul T-10) pentru fiecare celulă, și că `drawZones()` nu aruncă.
   → Ar cădea dacă fallback-ul ar lipsi (ex. `ctx.fillStyle = grassPattern` fără `|| palette.fill`, ceea ce ar seta `fillStyle` la `null`/`undefined` înainte de încărcare).

5. **`drawZones(): conturul (strokeStyle) zonei rămâne culoarea de proiect indiferent dacă terenul s-a încărcat sau nu`**
   Compară `strokeStyle` la fiecare `strokeRect` cu `palette.stroke` din `colorForProject(cwd)`, în ambele scenarii (teren încărcat / neîncărcat), pe două proiecte diferite (culori diferite garantate de determinism, nu de valori hardcodate).
   → Ar cădea dacă pattern-ul de iarbă ar „scurge” și în `strokeStyle` (bug de copy-paste între fill/stroke) sau dacă `strokeStyle` ar deveni identic între cele două proiecte.

6. **`decuparea peticului de iarbă: canvas-ul offscreen se creează o singură dată, nu la fiecare draw()`**
   Verifică `offscreenCreateCalls.length === 1` imediat după `triggerTerrainImageLoad()`, apoi rămâne `1` după două `draw()` suplimentare.
   → Ar cădea dacă decuparea s-ar face din greșeală în interiorul lui `draw()`/`drawZones()` în loc de `onload` (ar recrea canvas-ul offscreen la fiecare frame — problemă reală de performanță, nu doar stil).

7. **`decuparea peticului de iarbă: drawImage pe canvas-ul offscreen folosește exact sx=40, sy=60, sw=64, sh=64`**
   Verifică argumentele exacte raportate de coder în `T-13-coder-raport.md`.
   → Ar cădea dacă vreo constantă (`GRASS_PATCH_SX/SY/SIZE`) s-ar schimba fără actualizarea raportului, sau dacă decuparea ar folosi accidental alt punct din tilemap.

## Ce NU am acoperit (și de ce)

- **Conținutul vizual real al pattern-urilor** (cum arată efectiv apa/iarba la repetare) — imposibil fără canvas real, exclus explicit de brief ("Ce NU e un test valid").
- **Dimensiunea exactă a canvas-ului offscreen** (`patchCanvas.width/height`) — nu am verificat-o direct pentru că brief-ul cere să nu presupun valori fără să le confirm din raport; raportul coder-ului nu specifică explicit `width`/`height` setate pe canvas-ul offscreen ca valoare separată de `GRASS_PATCH_SIZE=64` (deși codul le setează la `GRASS_PATCH_SIZE`). Am acoperit indirect prin argumentele lui `drawImage` (sw/sh/dw/dh = 64), care e verificarea cerută explicit de brief (punctul 6).
- **Interacțiunea cu pan/zoom a fundalului de apă** (rămâne fix pe ecran, nu urmărește `worldToScreen`) — nu era în lista de cazuri de acoperit din brief; comportamentul curent (`fillRect(0,0,canvas.width,canvas.height)` necondiționat de cameră) e deja acoperit indirect de testul 2, dar n-am scris un test dedicat de pan/zoom fiindcă brief-ul nu l-a cerut explicit și ar fi dublat testele de cameră deja existente din T-12.

## Suspiciuni de bug

Niciuna găsită. Codul coder-ului respectă exact fallback-ul T-10 (`grassPattern || palette.fill`) și nu atinge `strokeStyle`. Singurul risc semnalat chiar de coder în raportul lui — teste vechi care ar compara `fillStyle` cu un string exact — nu există în suita curentă (verificat: niciun test dinainte de T-13 nu inspecta `fillStyle`/`fillRectStyles` pe zone).

## Comanda exactă pentru planner

```powershell
cd D:\RPGfactory
node --test
```

(Rulează întreaga suită, inclusiv cele 134 de teste existente + cele 7 noi de mai sus — total așteptat 141.)
