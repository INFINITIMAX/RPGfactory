# T-16b — Ripple T-16: tiparul „ancoră ocupă originea" nu mai e valid

## Bug real găsit de planner (rulare teste după T-16)

După T-16 (celula `(0,0)` rezervată pentru turn/spawn point, exclusă din `zones.js`), testul din `test/app.test.mjs`:

```
T-11 (bug suspectat) plecare: intrarea NU ar trebui să dispară doar pentru că scale-ul
a ajuns la 0, dacă poziția e încă departe de SPAWN_POINT
```

eșuează: `arcCalls.length` e `2`, nu `1` cum aștepta testul.

**Cauza exactă** (verificată de planner, nu doar presupusă): testul folosește un tipar „proiect-ancoră" (2 agenți în `/proj/anchor`, sortați înaintea proiectului testat `/proj/t11-far-leave`) — comentariul din test spune explicit „proiect-ancoră mai mare ocupă originea (=SPAWN_POINT)". ÎNAINTE de T-16, asta era adevărat: `/proj/anchor` (mai mare) primea celula `(0,0)`, deci distanța lui față de `SPAWN_POINT` era 0 — ancora „pleca" instant, dispărea din `agentMovement` foarte repede.

DUPĂ T-16, `(0,0)` e rezervat — NICIUN proiect, nici ancora, nu mai poate primi acea celulă. Ancora primește acum prima celulă liberă din `ring(1)` (Manhattan distance 1, adică `CELL_SIZE = 80` unități de lume distanță de `SPAWN_POINT`). La `WALK_SPEED=140`, `MOVEMENT_DT=0.05` (7 unități/tick), ancora are nevoie de `Math.ceil(80/7) = 12` tick-uri să ajungă înapoi la `SPAWN_POINT`. Dar `ticksForScaleZero = Math.ceil(1/(0.05*2.2))+1 = 11` — scale-ul ancorei ajunge la 0 ÎNAINTE ca ea să fi ajuns înapoi (12 > 11), deci intrarea ei din `agentMovement` NU e ștearsă (regula ȘI: `arrived && scale<=0`) la momentul verificării — rămâne desenată, alături de agentul testat, dând `arcCalls.length === 2` în loc de `1`.

Nu e un bug de producție (logica `arrived && scale<=0` din `app.js`, verificată deja la T-11/T-12, rămâne corectă) — e o presupunere de test invalidată de o schimbare de comportament legitimă (T-16). Cere recalcul/redesign al scenariului de test, nu doar o constantă schimbată — de-aia vine la tine, nu o repar direct.

## Sarcină

În `test/app.test.mjs`, verifică toate cele 3 teste care folosesc tiparul „ancoră ocupă originea" (caută comentariul „ocupă originea" — sunt la liniile aproximative 1849-1854, 2027-2035, 2158-2162 din fișierul curent):

1. Pentru testul care CADE efectiv (linia ~2027), rescrie scenariul astfel încât invariantul pe care se bazează testul să rămână adevărat sub noile reguli (ancora rezervată exclude `(0,0)`, deci minim `ring(1)` distanță pentru orice proiect). Ai nevoie ca ANCORA să termine complet plecarea (ajunsă ȘI scale=0) în mai puține tick-uri decât `ticksForScaleZero`, iar proiectul TESTAT (`agent`) să rămână mult mai departe (`ticksNeededToArrive` mult mai mare decât `ticksForScaleZero`, ca înainte). Poți, de exemplu: mări numărul/mărimea proiectelor-ancoră ca să împingă proiectul testat mai departe (mai multe inele), păstrând totuși ancora însăși la distanță mică (ring 1) — sau altă abordare, motivează-ți alegerea. Adaugă în test un `assert.ok` explicit de presetup care verifică și END-TO-END că ancora (nu doar agentul testat) chiar termină plecarea în mai puține tick-uri decât `ticksForScaleZero` — la fel cum testul deja verifică presetup-ul pentru `agent` (liniile 2042-2054) — ca să nu se mai strice silențios la o viitoare schimbare de geometrie.
2. Pentru celelalte 2 teste cu același tipar (liniile ~1849-1854, ~2158-2162) — care AU TRECUT la rularea curentă — verifică totuși dacă se bazează pe vreo presupunere de distanță/timing similară care ar putea deveni fragilă (chiar dacă azi trece, ar putea fi coincidență de numere, nu o garanție structurală). Dacă da, aplică aceeași disciplină (presetup explicit, verificat). Dacă nu (testele nu depind de timing-ul ancorei, doar de faptul că zona testată e "suficient de departe"), lasă-le neschimbate și motivează de ce sunt sigure.

## Ce NU e un test valid

- Nu slăbi asertarea centrală a testului (ce se întâmplă cu agentul FAR de spawn) doar ca să treacă — scopul testului rămâne verificarea regulii ȘI (arrived && scale<=0), nu doar „să nu pice".
- Nu presupune valori fără sa le calculezi/verifici (ca la T-11/T-12) — arată calculul în raport.

## Constrângeri dure

- Nu modifica `public/app.js`, `public/zones.js` — problema e strict de test, nu de producție (deja verificat de planner).
- Nu rula comenzi — planner rulează.
- `node --test`, fără dependențe noi.

## Predare

Modificări în `test/app.test.mjs` + `docs/handoff/T-16b-tester-raport.md`: calculul exact (tick-uri, distanțe) pentru noul scenariu, ce ai schimbat la fiecare din cele 3 teste (sau de ce nu era nevoie), comanda exactă de rulare a întregii suite.
