# T-11 — raport tester

## Fișier modificat

`test/app.test.mjs` — singurul fișier atins (nu am modificat `public/app.js`).

## Reparații aduse harness-ului (`loadApp()`)

1. **`advanceMovementTick()`** — helper nou, analog cu `advanceAnimationFrame()`:
   apelează direct `sandbox.updateAgentMovement()` o dată (un pas de 50ms), fără
   să cheme `draw()` — testele decid explicit când redesenează, ca să poată
   inspecta `drawImageCalls`/`arcCalls` între avansări succesive.
2. **`triggerRunImageLoad()`** — analog cu `triggerImageLoad()`, dar pentru a
   doua imagine instanțiată de `app.js` (`pawnRunImage`). Fără el nu puteam
   verifica selecția sprite-ului (idle vs. alergare) din cazul 9 al brief-ului.
3. **`imageInstances`** expus în obiectul întors de `loadApp()` — ca testele să
   poată verifica prin identitate ce imagine a ajuns în `ctx.drawImage(...)`
   (`args[0]`), nu doar cadrul sursă.
4. **`settleMovement(app, ticks=400)`** (helper la nivel de modul, nu în
   `loadApp()`) — apelează `advanceMovementTick()` de `ticks` ori. 400 pași ×
   7px/pas (`WALK_SPEED*MOVEMENT_DT`) = 2800px, mult peste diagonala
   canvas-ului de test (720×720 ≈ 1018px) + cele ~7 tick-uri de apariție —
   suficient ca orice agent să ajungă garantat `at-site` sau să dispară complet
   din `leaving`.
5. Constante T-11 documentate direct în fișierul de test (nu sunt expuse de
   `app.js`, fiindcă `const` la nivel de script nu devine proprietate a
   sandbox-ului): `MOVEMENT_TICK_MS=50`, `MOVEMENT_DT=0.05`, `WALK_SPEED=140`,
   `ARRIVE_RADIUS=6`, `SPAWN_SCALE_RATE=3`, `LEAVING_SHRINK_RATE=2.2`,
   `TEST_SPAWN_POINT={x:40,y:680}` (canvas-ul mock e 720×720), plus
   `CIRCLE_RADIUS=28` (lipsea ca și constantă separată, era doar hardcodat).
6. `assertClose(actual, expected, msg, epsilon=1e-6)` — comparație cu toleranță
   pentru poziții/scale calculate din formule, nu valori ghicite.

## Teste vechi reparate (afectate de trecerea la `agentMovement`)

`draw()`/click-ul citesc acum din `agentMovement`, populat DOAR de
`updateAgentMovement()` — `setAgents()` nu-l avansează. Am adăugat
`app.advanceMovementTick()` (un pas, unde era nevoie doar de o intrare cu
scale>0) sau `settleMovement(app)` (unde testul depindea de poziția FINALĂ,
calculată de `computeAgentPositions`, ca agentul să fie "at-site") în:

- `poziția unui agent pe grilă nu depinde de ordinea din array-ul de agenți`
- `click exact pe centrul unui cerc selectează agentul...`
- `click în afara razei cercului NU selectează agentul`
- `renderDetails formatează updatedAt ca string nevid...`
- `draw() NU cheamă drawImage cât timp imaginea sprite-ului nu s-a "încărcat"`
- `după "încărcarea" imaginii, draw() cheamă drawImage cu cadrul 0...`
- `cadrele de animație avansează ciclic 0..7...`
- `draw() desenează un indicator de status suplimentar...`
- `la agent selectat, strokeRect e chemat cu zona sprite-ului...`
- `click pe poziția unui agent arhivat NU îl selectează...`
- `initState() la pornire încarcă archived existent...` (întărit: verifică
  explicit că `updateAgentMovement()` nu-l adaugă retroactiv)
- `unhideAgent (...)`

## Teste vechi REWRITE (comportament schimbat intenționat de T-11)

Două teste din secțiunea „Arhivare" presupuneau dispariția INSTANTĂ a unui
agent arhivat — exact ce T-11 schimbă intenționat (agentul pleacă vizibil spre
`SPAWN_POINT`, nu dispare brusc). Le-am înlocuit cu:

1. `un agent arhivat NU mai e desenat abia după ce animația de plecare
   (leaving) s-a terminat complet` — verifică dispariția eventuală (după
   `settleMovement` suplimentar), nu instantanee.
2. `un agent arhivat e TOT desenat imediat după Hide, cât timp e în leaving
   (nu dispare brusc)` — verifică explicit noul comportament (sprite de
   alergare, tot desenat).

De asemenea, în `hideAgent (prin butonul Hide) arhivează agentul...`, am
schimbat cele două asertări `arcCalls.length === 0` /
`drawImageCalls.length === 0` "imediat după Hide" în `=== 1` — sub vechiul cod
agentul dispărea instant din `agents`/`agentPositions`; acum rămâne vizibil în
`agentMovement` (stare `leaving`) exact cât ține animația de plecare. Vechea
asertare ar fi contrazis explicit funcționalitatea nouă cerută de T-11 (cazul
critic din brief).

## Teste noi T-11 (secțiunea 9, la finalul fișierului)

1. **Apariție** — la SPAWN_POINT, `scale` = `MOVEMENT_DT*SPAWN_SCALE_RATE`
   (0.15) după un tick, sprite idle. Ar cădea dacă `SPAWN_POINT` sau formula de
   scale s-ar schimba.
2. **Tranziția spawning→walking** — verifică exact pragul `scale>=1` (7
   tick-uri, nu 6 sau 8) prin identitatea sprite-ului (idle vs. alergare). Ar
   cădea dacă pragul sau `SPAWN_SCALE_RATE` s-ar schimba.
3. **Mișcare monotonă** — buclă care avansează tick cu tick și verifică
   `dist <= prevDist` la fiecare pas, până la sosire. Ar cădea dacă mișcarea
   ar oscila sau ar sări peste țintă.
4. **Sosire exactă** — poziția finală == ținta calculată de
   `computeAgentPositions`, nu doar apropiată; sprite revine la idle. Ar cădea
   dacă `stepAgentTowards` n-ar fixa poziția exact la sosire.
5. **Recalculare țintă în at-site** — al doilea agent din același proiect
   schimbă ținta (jitter) — verifică revenirea explicită în `walking`. Ar cădea
   dacă `at-site` nu recalculează ținta.
6. **Plecare critică** (cazul din brief) — agent arhivat imediat, încă
   `spawning` — trece direct în `leaving`, scale continuă de unde a rămas (nu
   sare la 0 sau 1). Ar cădea dacă entry-ul s-ar reseta/teleporta.
7. **Plecare — bug suspectat** (vezi mai jos) — documentează condiția de
   ștergere din `agentMovement`.
8. **Plecare completă** — după `settleMovement` suplimentar, agentul dispare
   complet (`drawImageCalls.length === 0`).
9. **Leaving tot desenat** — agent absent din `/api/agents`, dar prezent în
   `agentMovement` → tot produce `drawImage`.
10. **Alegerea sprite-ului** — parcurge toate cele 4 stări (spawning, walking,
    at-site, leaving) și verifică identitatea imaginii (`imageInstances[0]`
    idle / `[1]` alergare) la fiecare.
11. **Hit-test pe poziția curentă** — click pe ținta finală (unde agentul încă
    nu a ajuns) NU selectează; click pe poziția afișată curentă SELECTEAZĂ. Ar
    cădea dacă hit-test-ul ar folosi ținta brută din `computeAgentPositions` în
    loc de `agentMovement`.

## Suspiciune de bug găsită (raportez, nu repar)

**Condiția de ștergere din `updateAgentMovement()` (ramura `leaving`) folosește
SAU, nu ȘI:**

```js
if (arrived || entry.scale <= 0) {
  agentMovement.delete(sessionId);
}
```

Brief-ul (cazul 7) cere explicit: *"când AMBELE praguri sunt atinse, intrarea
dispare"*. Cum `LEAVING_SHRINK_RATE` (2.2/s) duce scale-ul la 0 în ~10
tick-uri (500ms), mult mai repede decât drumul de întoarcere la `SPAWN_POINT`
pentru un agent aflat departe pe canvas, entry-ul dispare din desen quand
`scale` ajunge la 0 — **chiar dacă agentul e încă la jumătatea drumului spre
colț**, nu în colț. Vizual: agentul dispare brusc undeva pe ecran, nu se
"scurge" în colțul de apariție, contrar descrierii comportamentului dorit.

Testul `T-11 (bug suspectat) plecare: intrarea NU ar trebui să dispară doar
pentru că scale-ul a ajuns la 0...` din secțiunea 9 demonstrează exact acest
caz și **ar trebui să EȘUEZE** cu codul curent din `public/app.js` (linia cu
`if (arrived || entry.scale <= 0)`). Planner-ul decide dacă e o simplificare
acceptată (poate fi intenționată — dispariția rapidă evită agenți "eterni" în
`leaving` dacă rămân blocați departe) sau un bug de trimis înapoi la coder
(schimbarea în `if (arrived && entry.scale <= 0)`).

## Ce NU am acoperit (și de ce)

- **Precizia exactă a distanței parcurse per tick în cazuri cu jitter multiplu
  (3+ agenți pe aceeași celulă)** — testele de zonă (T-10) deja acoperă
  distribuția/jitter-ul independent de mișcare; nu am dublat acoperirea aici,
  ca să nu creez teste redundante.
- **Interacțiunea dintre bucla de animație a cadrelor (125ms) și bucla de
  mișcare (50ms) rulând simultan prin `setInterval`-urile reale** — harness-ul
  de test nu avansează timere reale; am testat funcțiile de producție direct
  (`updateAgentMovement`/`draw`), nu integrarea celor două `setInterval`-uri.
  Aceasta e o limitare structurală a harness-ului `node:vm`, documentată deja
  în comentariile fișierului pentru T-04.
- **Verificarea vizuală/manuală cerută în raportul coder-ului** (pornire
  server, deschidere browser) — în afara sarcinii tester-ului (fără shell).

## Comanda de rulare

```powershell
node --test test/app.test.mjs
```

sau, pentru toată suita de test-uri din proiect (dacă există alte fișiere
`*.test.mjs`):

```powershell
node --test test/
```
