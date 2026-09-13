# T-16b — Tester — raport

## Ce am modificat

Un singur fișier: `test/app.test.mjs`. Am rescris DOAR testul care cade efectiv
(„T-11 (bug suspectat) plecare: ...”, fostele linii ~2027-2079). Celelalte
2 teste cu tiparul „ancoră ocupă originea” (mișcarea monotonă ~1843-1894,
hit-test în mișcare ~2154-2208) au rămas **neschimbate** — motivul e la
punctul 2.

## 1. Testul rescris (fostul ~2027)

### De ce nu merge soluția sugerată literal în brief

Brief-ul sugera „ancora să termine complet plecarea (ajunsă ȘI scale=0) în
MAI PUȚINE tick-uri decât `ticksForScaleZero`, păstrând-o la ring(1)”. Am
verificat concret și e **imposibil de satisfăcut integral** pentru orice
proiect-ancoră cu ≥2 agenți pe aceeași celulă din ring(1):

- Orice celulă din ring(1) e la distanță exactă `CELL_SIZE=80` de origine
  (axă X sau Y, niciodată diagonală — `ring(1)` din `zones.js` produce doar
  `(±1,0)`/`(0,±1)`).
- `ticksForScaleZero = Math.ceil(1/(0.05*2.2))+1 = 11`.
- Un agent SOLO (fără grupare, deci fără jitter) pe o celulă ring(1) are
  nevoie de `Math.ceil(80/7) = 12` tick-uri — deja peste 11, indiferent ce
  facem.
- Jitter-ul (`ZONE_JITTER_RADIUS=12`) e aplicat pe un unghi ABSOLUT
  (`2*pi*i/n`), NU radial față de origine. Într-un grup de 2 pe aceeași
  celulă, un singur agent se apropie de origine (cel mult `80-12=68` ->
  10 tick-uri, sub prag), dar celălalt se depărtează (`80+12=92` ->
  14 tick-uri) — exact bug-ul de test raportat de planner (ancora „de
  rezervă” rămânea desenată, `arcCalls.length===2`).
- Pentru celulele perpendiculare (`(0,±1)`), jitter-ul pe axa X mărește
  distanța pentru AMBII membri ai grupului (deplasare perpendiculară pe raza
  către origine mărește mereu distanța, Pitagora) — deci nu există nicio
  configurație de grup pe ring(1) în care toți membrii ajungă sub pragul de
  11 tick-uri.

Am ales altă abordare (permisă explicit de brief: „sau altă abordare,
motivează-ți alegerea”).

### Soluția aleasă

4 proiecte-„filler” separate, fiecare cu UN SINGUR agent (fără grupare, deci
fără jitter, deci distanță EXACTĂ, nu aproximată):

- `fillers[i]`, cwd distinct (`/proj/t11-far-leave-filler-{0..3}`), inserate
  ÎNAINTE de agentul testat în array-ul dat lui `setAgents()`.
- Toate au `size=1`, egal cu al agentului testat — la egalitate,
  `Array.prototype.sort` e stabil (garantat ES2019+, deja exploatat de
  `app.js` la sortarea proiectelor: `.sort((a,b)=>b.size-a.size)`), deci cele
  4 fillere tot ocupă, în ordine, cele 4 celule din ring(1) (singurele rămase
  după excluderea `(0,0)` de T-16), înaintea agentului testat — fără să fie
  nevoie de dimensiuni artificial diferite.
- Agentul testat (al 5-lea proiect „fresh”) primește prima celulă liberă din
  ring(2): `(-2,0)`, distanță **160** — dublu față de fillere (**80** fiecare,
  exact, verificat programatic, nu presupus).

### Calculul exact (verificat prin cod, nu presupus)

Poziția fiecărui agent e citită din `app.sandbox.computeAgentPositions(liveAgents)`
(aceeași funcție de producție pe care `updateAgentMovement()` o folosește
intern), NU derivată pe hârtie din geometria jitter-ului — evită orice
presupunere greșită despre direcția jitter-ului per celulă.

```
MOVEMENT_DT = 0.05, WALK_SPEED = 140  => pas = 7 unități/tick
LEAVING_SHRINK_RATE = 2.2

ticksForScaleZero      = ceil(1/(0.05*2.2)) + 1 = ceil(9.09) + 1 = 11
maxFillerDist           = 80   (exact, fillere solo, fără jitter — verificat prin cod)
ticksForFillersToArrive = ceil(80/7)  = 12
distFromSpawn (agent)   = 160  (ring(2), exact, verificat prin cod)
ticksNeededToArrive     = ceil(160/7) = 23

waitTicks = max(11, 12) = 12
verificare: waitTicks(12) < ticksNeededToArrive(23)  -> marjă de 11 tick-uri (~77px)
```

La `waitTicks=12`: toate fillerele au ambele praguri atinse (arrived &&
scale<=0) -> șterse din `agentMovement`. Agentul testat: scale deja 0 (de la
tick 11), dar a parcurs doar `12*7=84` din 160 -> încă departe de
`SPAWN_POINT` -> intrarea lui NU ar trebui ștearsă dacă regula e ȘI (cum e
în cod). Verific asta cu `assert.equal(app.arcCalls.length, 1, ...)` +
`assert.ok` pe `fillTextCalls` (numele agentului prezent, al niciunui filler
absent).

**Ce ar face acest test să cadă:** dacă `updateAgentMovement()` ar folosi
`arrived || scale<=0` (SAU) în loc de `arrived && scale<=0` (ȘI), intrarea
agentului testat ar fi ștearsă la acest tick (scale===0 deja), și
`arcCalls.length` ar deveni 0, nu 1 — testul ar eșua. De asemenea, dacă
oricare filler n-ar fi dispărut la timp (presupunere de geometrie greșită),
presetup-ul `assert.equal(app.arcCalls.length, 1, ...)` ar prinde imediat
problema (>1), izolat de aserția finală.

### Notă despre o inconsistență preexistentă (neatinsă, doar semnalată)

Testul VECHI (rândurile ~2040-2050, înainte de rescriere) amesteca distanțe
de ECRAN (`agentPixelPosition`, care aplică `worldToScreen`, scalat de
`camera.zoom=2`) cu `WALK_SPEED`, care e definit în unități de LUME — o
inconsistență dimensională (distanța de ecran e de 2x cea de lume). Nu
schimba rezultatul testului vechi în mod greșit (doar umfla artificial
`ticksNeededToArrive`, făcând `assert.ok(ticksForScaleZero < ticksNeededToArrive)`
și mai ușor de trecut, nu mai greu), deci nu era un bug care ar fi cauzat
un fals-pozitiv — dar am evitat s-o reproduc în rescriere: am calculat totul
în coordonate de LUME (`computeAgentPositions` întoarce direct lume, fără
`worldToScreen`), consistent cu `WALK_SPEED`/`ARRIVE_RADIUS`, care sunt tot
în lume în `app.js`. Nu am atins celelalte teste care mai folosesc acest
tipar (nu e cerut, și nu cauzează falsuri-pozitive acolo).

## 2. Celelalte 2 teste cu tiparul „ancoră ocupă originea” — neschimbate

### „T-11 mișcare spre țintă: ... monotonă” (~1843-1894)

Nu depinde de nicio valoare exactă de distanță/tick — verifică doar că
distanța scade monoton la fiecare pas, cu `steps>0` și `steps<maxSteps=500`
ca gărzi (500 pași * 7px = 3500 unități, mult peste orice distanță atinsă de
`allocateCells` — plafonul e `r<12` inele * 80 = 960 unități maxim). T-16 nu
schimbă acest calcul: indiferent unde ajunge ținta (ring 1, 2, ...), ambele
margini rămân valabile cu marjă enormă. Anchor-ul de 2 agenți e folosit doar
ca să garanteze că ținta ≠ SPAWN_POINT — lucru pe care acum T-16 îl
garantează oricum, singur, prin excluderea `(0,0)`. Nu era nevoie de
presetup suplimentar — l-am lăsat neschimbat.

### „T-11 hit-test în mișcare” (~2154-2208)

Are deja un `assert.ok` de presetup explicit (`distToTarget > CIRCLE_RADIUS`,
rândurile 2190-2193) care verifică END-TO-END, din poziții reale, că agentul
testat e vizibil departe de propria țintă la momentul click-ului — exact
disciplina cerută de brief. Dacă geometria s-ar schimba din nou (alt inel,
altă distanță), acest assert ar eșua zgomotos ÎNAINTE de aserțiunile
principale de click, nu s-ar strica silențios. Indexul `drawImageCalls[2]`
(al treilea desenat) depinde de ordinea de inserare în `agentMovement`
(ordinea din array-ul dat lui `setAgents`), nu de geometria zonelor — neatins
de T-16. Nu era nevoie de nicio schimbare — l-am lăsat neschimbat.

## Ce NU am acoperit

- Nu am adăugat un test nou dedicat exclusiv geometriei `zones.js`
  (`ring()`/`RESERVED_CELL`) — T-16 (coder) presupun că are deja acoperire
  proprie; task-ul meu era strict cele 3 teste cu tiparul „ancoră ocupă
  originea” din `app.test.mjs`.
- Nu am atins inconsistența screen/world semnalată la punctul 1 (notă) în
  restul fișierului — nu era cerută și nu cauzează falsuri-pozitive.

## Constrângeri respectate

- Nu am atins `public/app.js` sau `public/zones.js`.
- Nu am rulat nicio comandă.
- Nicio dependență nouă.

## Comanda exactă de rulare (planner)

```
node --test test/app.test.mjs
```
