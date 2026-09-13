# T-16 + T-16b — Raport reviewer

## Verdict: ACCEPT

Am verificat toate cele 9 fișiere cerute, inclusiv calcul matematic independent pentru T-16b. Nu am găsit probleme care să justifice respingerea.

### 1. Coder T-16 (`public/zones.js`)

Portarea din bot-crossing e fidelă briefului, exact la cele 3 puncte cerute:
- `RESERVED_CELL = {x:0,y:0}` adăugată lângă `ORIGIN`.
- `free.delete(key(RESERVED_CELL.x, RESERVED_CELL.y))` adăugat imediat după bucla de umplere a pool-ului, în locul exact indicat.
- `isConnected()` înlocuită exact cu varianta "stepping stone" (`passable` include `reservedKey`, `seen.delete(reservedKey)` înainte de comparație).

Nu există cod în plus față de brief — `growBlob`, `ring()`, `manhattanDistance()` neatinse, niciun fișier în afară de `zones.js` modificat. Am urmărit manual scenariul "primul proiect nou" prin cod (`ring(0)` exclus din `free`, primul liber din `ring(1)` e `{-1,0}`) și confirm calculul din raportul coder-ului.

### 2. Teste T-16 (`test/zones.test.mjs`)

Cele 6 teste noi + adaptarea testului vechi sunt toate discriminante — pentru fiecare am verificat "ce schimbare în cod l-ar face să cadă":
- testele 1-3 ar cădea dacă `free.delete(RESERVED_CELL)` ar lipsi;
- testul "stepping stone" ar cădea cu flood-fill vechi (fără `passable` extins) — verificat manual: `{-1,0}` și `{1,0}` sunt la distanță Manhattan 2, neconectate direct, doar prin `(0,0)`;
- testul `seen.delete` ar cădea (fals-negativ, `seen.size=3` vs `cells.size=2`) dacă cineva ar uita `.delete(reservedKey)` — verificat manual prin BFS pe hârtie, coincide cu raportul.
- adaptarea `{-1,0}` pentru `ring(1)` e determinist justificată din bucla `ring()`, nu presupusă.

Nu sunt redundanțe, nu sunt asertări slabe (`toBeDefined`-echivalent).

### 3. T-16b — verificare matematică independentă

Am recalculat de la zero, independent de raport:
- `ticksForScaleZero = ceil(1/(0.05×2.2))+1 = ceil(9.09)+1 = 11` ✓
- Fillere solo pe `ring(1)`: distanță exactă `CELL_SIZE=80`, `ticksForFillersToArrive = ceil(80/7) = 12` ✓
- Am urmărit manual ordinea de alocare în `layOut`: 4 fillere (size=1, fresh) iau, pe rând, cele 4 celule din `ring(1)` = `[{-1,0},{0,1},{0,-1},{1,0}]`; al 5-lea proiect (agentul testat) cade pe `ring(2)`, prima celulă liberă fiind `{-2,0}` (pe axă, nu diagonal) → distanță `2×80=160`.
- `ticksNeededToArrive = ceil(160/7) = 23` ✓

Toate cele trei valori coincid exact cu cele cerute în verificare. `waitTicks = max(11,12) = 12 < 23`, deci la tick 12: fillerele au ambele praguri (`arrived && scale≤0`) → șterse; agentul testat are `scale≤0` dar NU `arrived` → dacă regula ar fi fost SAU, ar fi fost șters greșit.

Testul rescris **nu e slăbit**: verifică `arcCalls.length===1` (nu doar "nu aruncă eroare") plus `fillTextCalls` conține exact numele agentului, nu al vreunui filler — asta testează direct regula ȘI (`arrived && scale<=0`) din `app.js`, la fel de strict ca varianta veche, doar cu geometrie corectă.

Diagnoza tester-ului că soluția planner-ului (ring(1) + jitter) era imposibilă e corectă: jitter-ul e pe unghi absolut, nu radial, deci pentru orice grup ≥2 pe aceeași celulă din ring(1), cel puțin un membru se depărtează de origine (verificat: `80+12=92px → 14 ticks > 11`).

### 4. Deciziile de a NU modifica celelalte 2 teste

Ambele verificate ca solide:
- Testul "mișcare monotonă" (~1843): garda `steps<maxSteps=500` (3500 unități) depășește orice distanță posibilă generată de `zones.js` (plafon `r<12` → max 960 unități) — marjă suficientă indiferent de inel, nu e coincidență fragilă.
- Testul "hit-test în mișcare" (~2208): are deja `assert.ok(distToTarget > CIRCLE_RADIUS, ...)` explicit ca presetup (confirmat la linia 2244-2247) — exact disciplina cerută de T-16b, deja prezentă.

### Fișiere verificate
- `D:\RPGfactory\docs\handoff\T-16-coder.md`, `T-16-coder-raport.md`
- `D:\RPGfactory\public\zones.js`
- `D:\RPGfactory\docs\handoff\T-16-tester.md`, `T-16-tester-raport.md`
- `D:\RPGfactory\test\zones.test.mjs`
- `D:\RPGfactory\docs\handoff\T-16b-tester.md`, `T-16b-tester-raport.md`
- `D:\RPGfactory\test\app.test.mjs` (liniile 1820-2260)

Nu am nimic de respins — ambele livrări (T-16 și T-16b) sunt acceptate.

---

## Decizia planner-ului

Accept T-16 și T-16b. Am rulat suita completă înainte de review (157 teste, 0 eșecuri) și confirm rezultatul reviewer-ului.

T-16 + T-16b închise. Turnul/spawn point-ul nu mai poate fi ocupat de zona de lucru a niciunui proiect — fix real, portat verificat din mecanismul `SHIP_CELL` al bot-crossing. Următorul: task B (zonele fixe de pădure/aur cu animații de tăiat/minat).
