# T-15 — Raport reviewer

## Verdict: ACCEPT

Am citit briefurile, `public/app.js` complet, ambele rapoarte, și testele relevante (secțiunile T-15 noi + cele 7 adaptări neprevăzute).

### 1. Cod inutil în plus față de brief (coder)
Nu am găsit niciunul. `app.js` conține exact ce cerea briefful T-15:
- apă (`waterImage`/`waterPattern`) și nori (`clouds`, `drawClouds`, `updateClouds`) complet șterse — am confirmat cu grep că nu mai există nicio referință `water`/`cloud` în fișier.
- fill global de iarbă (`FALLBACK_GRASS_COLOR` + `grassPattern`) exact ca în brief, primul lucru desenat după `clearRect`.
- fill per-celulă eliminat din `drawZones()`, `strokeRect` păstrat neschimbat.
- `camera.zoom` implicit 2, `MIN_ZOOM`/`MAX_ZOOM` neatinse.
- `drawTower()` adăugat identic cu specificația din brief (constante, ancorare, poziție în cod, apel înainte de `drawZones()`).
Coder-ul a lăsat intenționat neatins comentariul vechi T-13 ("fundal de apă") de deasupra `GRASS_PATCH_*`, motivând explicit în raport că brief-ul cerea ștergerea doar a comentariului de deasupra `clouds`. E o decizie corectă și conservatoare, nu cod inutil — cel mult o mică inconsistență documentară, nu un motiv de respingere.

### 2. Ancorarea turnului la bază — verificare matematică independentă
`destH = TOWER_DEST_HEIGHT * camera.zoom = 128 * 2 = 256`. Desenarea pornește de la `pos.y - destH` și se întinde `destH` px, deci marginea de jos cade exact pe `pos.y` (= proiecția lui `(0,0)` din lume, care e și `SPAWN_POINT`). Calculul din raportul coder-ului e corect și testul tester-ului (`destY + destH === CANVAS_CENTER_Y`, cu `assert.notEqual` explicit pe varianta greșită `destY + destH/2`) confirmă independent aceeași concluzie. Lățimea rămâne centrată (`pos.x - destW/2`), corect.

### 3. Testele T-15 noi (tester)
Toate cele 10 teste din brief sunt prezente, specifice și ar cădea real la o regresie (fundal condiționat de zone, lipsă fallback, apă/nori reapărute, fill per-celulă reintrodus, zoom revenit la 1, turn centrat greșit, ordine de desenare inversată etc.). Nu sunt teste "mereu adevărate" — fiecare verifică un apel concret pe canvas (fillRect/drawImage/strokeRect) cu argumente derivate matematic, nu `toBeDefined()`-uri slabe.

### 4. Cele 7 adaptări neprevăzute (zoom 1→2) — verificare matematică independentă
Am verificat fiecare formulă direct în `app.js`:
- `spriteSize = SPRITE_DEST_SIZE * scale * camera.zoom` (linia 471) → adaptările care înmulțesc/împart cu `getZoom(app)` pentru `half`/`spriteSize`/`expectedSize` sunt corecte.
- `cellSizeScreen = CELL_SIZE * camera.zoom` (linia 376) → adaptarea la `ZONE_CELL_SIZE * zoom = 160` e corectă.
- Testul "T-11 plecare critică": `scaleBefore/After = dw / (SPRITE_DEST_SIZE * zoom)` — corect, pentru că `dw` din producție include deja `* camera.zoom`; împărțirea suplimentară la zoom recuperează `scale`-ul pur, comparabil cu `SPAWN_SCALE_RATE`/`LEAVING_SHRINK_RATE`. Nu maschează niciun bug — dimpotrivă, dacă formula de producție ar omite `camera.zoom`, `getZoom(app)` ar întoarce 1 oricum (calculat din `worldToScreen`, aceeași sursă), iar testul ar detecta discrepanța prin celelalte teste de zoom explicit (T-15 zoom implicit, T-12/T-15 scalare).
- Testul T-12/T-15 de scalare cu zoom verifică explicit presetup-ul `zoomBefore === 2` înainte de a măsura relativ — nu presupune orbește valoarea, deci nu ascunde o eventuală regresie la zoom implicit.
- Toate adaptările folosesc `getZoom(app)`, care citește indirect `camera.zoom` prin `worldToScreen` (funcție de producție reală, nu o reimplementare) — deci un bug real în calculul de zoom tot s-ar propaga și ar fi prins de testele dedicate de zoom (`T-15 zoom implicit e 2`, `T-12/T-15 dimensiunile ... scalează`).

Nu am găsit nicio adaptare care să reducă acoperirea sau să transforme un test într-unul mereu-trece; sunt corecturi matematice legitime, motivate individual și consistente cu codul de producție.

### Fișiere verificate
- `D:\RPGfactory\docs\handoff\T-15-coder.md`
- `D:\RPGfactory\public\app.js`
- `D:\RPGfactory\docs\handoff\T-15-coder-raport.md`
- `D:\RPGfactory\docs\handoff\T-15-tester.md`
- `D:\RPGfactory\test\app.test.mjs`
- `D:\RPGfactory\docs\handoff\T-15-tester-raport.md`

Nicio problemă de blocaj. Recomand planner-ului să integreze ambele livrări ca atare.

---

## Decizia planner-ului

Accept T-15. Am rulat suita completă (152 teste, 0 eșecuri) înainte de review și confirm rezultatul. Am reparat singur, separat, un comentariu T-13 rămas ("fundal de apă") — text pur, fără schimbare de comportament — reviewer-ul a notat aceeași inconsistență documentară dar corect a clasificat-o ca neblocantă.

T-15 închis. Notă pentru lista de lucru: rămâne cunoscut (nu e parte din T-15) faptul că singura celulă de lucru curentă a proiectului activ e la `(0,0)` — exact unde stă și turnul/spawn point-ul — asta e task-ul A, următorul de făcut.
