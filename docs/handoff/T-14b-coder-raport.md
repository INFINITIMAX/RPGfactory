# T-14b — Raport coder

## Fișier modificat

`D:\RPGfactory\public\app.js` (liniile 139-140):

```js
const DECORATION_DEST_SIZE = 8; // desenată mult mai mică decât celula, ca să nu se suprapună cu sprite-ul agentului
const DECORATION_OFFSET = 2; // px, distanță față de colțul celulei
```

Valori vechi: `DECORATION_DEST_SIZE = 40`, `DECORATION_OFFSET = 4`.
Valori noi: `DECORATION_DEST_SIZE = 8`, `DECORATION_OFFSET = 2`.

Nu am atins nimic altceva în `drawZones()`/`decorationForCell()` — doar cele două constante.

## De ce am ales alte valori decât sugestia din brief (20-24px)

Sugestia „20-24px” din brief nu e geometric posibilă cu poziționarea în colț folosită de cod. Am recalculat exact:

- Celula are 80×80 (local, la zoom 1), cu centrul la (40,40).
- Sprite-ul agentului (56×56, centrat) ocupă `[12,68] × [12,68]`.
- Marginea liberă dintre marginea sprite-ului (68) și marginea celulei (80) este de doar **12px**.
- Decorația e desenată din colțul dreapta-jos: `destX = 80 - destSize - offset` (stânga decorației), `destX_right = 80 - offset` (dreapta decorației); la fel pe axa Y.
- Pentru ca decorația să nu intersecteze deloc zona sprite-ului, marginea stângă/de sus a decorației trebuie să fie strict mai mare decât 68: `80 - destSize - offset > 68`, adică `destSize + offset < 12`.
- Cu `destSize=20-24` și orice offset pozitiv, suma depășește mereu 12 → suprapunere garantată. De aceea am coborât sub acest prag.

## Calculul explicit cu valorile noi

Cu `DECORATION_DEST_SIZE = 8`, `DECORATION_OFFSET = 2` (coordonate locale în celulă, zoom = 1, colțul stânga-sus al celulei = (0,0)):

- Dreptunghi decorație: `x ∈ [80 - 8 - 2, 80 - 2] = [70, 78]`, `y ∈ [70, 78]`.
- Dreptunghi sprite agent: `x ∈ [12, 68]`, `y ∈ [12, 68]`.
- Comparație pe axa X: `70 > 68` → intervalele `[70,78]` și `[12,68]` sunt disjuncte (gap de 2px).
- Comparație pe axa Y: identic, `70 > 68` → disjuncte.
- Deoarece intervalele sunt disjuncte pe cel puțin o axă (de fapt pe ambele), cele două dreptunghiuri **nu se intersectează**, indiferent de zoom (scalarea liniară cu `camera.zoom` păstrează proporțiile și raportul dintre margini).

## Ce nu am făcut

- Nu am scris teste (rol tester).
- Nu am modificat `zones.js`, `state.js`, `merge-state.js`, `rank.js`, `status.js`, `server.js`, conform constrângerilor.

## Ce ar trebui verificat de planner

- Rulează `test/app.test.mjs` (secțiunea T-14) pentru a confirma că testul de suprapunere trece cu noile valori.
- Verificare vizuală opțională la zoom implicit: decorația ar trebui să apară foarte mică, strict în colțul celulei.
