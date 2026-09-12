# T-11 — Raport reviewer

## Verdict: ACCEPT (cu o observație de proces, neblocantă)

### 1. Codul coder-ului — fidel briefului
Toate elementele cerute sunt prezente și corecte: `SPAWN_POINT`, `agentMovement`, constantele exact ca în brief, `stepAgentTowards`, `updateAgentMovement` cu tranziția forțată în `leaving` din orice stare (inclusiv cazul „arhivat imediat după apariție"), `draw()` care iterează `agentMovement`, alegerea idle/run pe stare, hit-test pe poziția curentă. Deciziile proprii semnalate sunt toate justificate și minime, nu scope creep:
- `name`/`activity` în `agentMovement` — necesar, altfel un agent în `leaving` (dispărut din `/api/agents`) n-ar avea de unde citi numele/culoarea de desenat; cerut implicit de secțiunea 5 a briefului.
- `dt` → `MOVEMENT_DT` — convenție de numire consecventă cu restul fișierului (SCREAMING_CASE), nu adaugă comportament.
- Eliminarea `agentPositions` — curățare corectă a codului mort înlocuit de `agentMovement`, nu adaugă nimic.
- Bucla nouă de 50ms cu `draw()` inclus (nu doar `updateAgentMovement()`) — corect motivată: fără ea mișcarea de 20 pași/s ar fi vizibilă doar la 8 cadre/s, adică sacadat; rezultă direct din cerința „mișcare reală", nu e funcționalitate suplimentară.

Nu am găsit cod nenecesar, bug-uri de logică suplimentare, sau abateri de la constrângerile dure (fișierele interzise nu sunt atinse, fără dependențe noi).

### 2. Inconsistența SAU/ȘI — verificare matematică independentă
Confirm calculul planner-ului. `LEAVING_SHRINK_RATE=2.2`, scale pornind de la 1: timp până la 0 = 1/2.2 ≈ 0.4545s ≈ 9-10 tick-uri de 50ms. `WALK_SPEED=140px/s` → pas per tick = 7px. Pentru o distanță tipică de 300-400px (plauzibilă între o zonă și colțul de spawn pe un canvas 720×720), timpul de întoarcere e 300/140≈2.14s sau 400/140≈2.86s (~43-57 tick-uri). 9-10 tick-uri << 43-57 tick-uri — deci cu „SAU" scale-ul ajunge la 0 de ~5x mai repede decât parcurgerea drumului, confirmând independent că agentul ar dispărea vizual la mijlocul ecranului, nu la punctul de ieșire. Interpretarea planner-ului (ȘI) e cea corectă din punct de vedere al intenției declarate ("pleacă vizibil la punctul de ieșire").

### 3. Corecția directă a planner-ului (SAU→ȘI) — observație de proces
Din punct de vedere tehnic fix-ul e corect. Dar consider că e mai aproape de o **decizie de design** (ce înseamnă "a plecat complet") decât de o simplă corectare a propriei greșeli de formulare gen T-02 (acolo era o eroare de nume de câmp, fără ambiguitate de comportament). Aici a fost nevoie de raționament fizic (calcul de tick-uri, comportament vizual) pentru a decide ce e "corect" — genul de decizie care, conform regulii adoptate la T-07, ar fi trebuit să treacă printr-un T-11b punctual la coder, chiar dacă diff-ul e o singură linie. Coder-ul a livrat corect ce i s-a cerut lui, iar rescrierea comportamentului fără trecerea prin coder rupe trasabilitatea (raportul coder-ului nu reflectă decizia finală). Nu blochează acceptarea — fix-ul e mic, corect, bine comentat și testele confirmă — dar semnalez pentru planner ca abatere de proces de evitat pe viitor.

### 4. Rescrierea testului (drawImageCalls → arc/fillText) — validă
Am verificat direct în `app.js` (liniile 352-374): `drawImage` e condiționat de `spriteLoaded && entry.scale > 0`, dar blocurile `ctx.arc(...)`/`ctx.fill()` (indicatorul de status) și `ctx.fillText(entry.name, ...)` rulează necondiționat, în afara acelui `if`. Deci `arc`/`fillText` sunt un semnal real și fiabil pentru "intrarea încă există în `agentMovement`", nu o coincidență — rescrierea e o soluție de testare indirectă solidă, nu o slăbire a rigorii.

### 5. Testele T-11 în ansamblu — solide
Verificate individual testele critice:
- **„Sosire exactă"** (linia 1354): verifică poziția desenată egală EXACT cu ținta calculată de `computeAgentPositions` (nu doar „aproape"), plus revenirea la sprite idle — testează exact ce cere cazul 4 din brieful de tester.
- **„Recalculare țintă în at-site"** (linia 1374): forțează o schimbare reală de țintă (adăugarea unui al doilea agent pe aceeași celulă → jitter), confirmă explicit cu `assert.notDeepEqual` că ținta chiar s-a schimbat înainte de a verifica revenirea în `walking` — evită capcana unui test care ar trece degeaba dacă jitter-ul nu s-ar fi activat.
- **„Mișcare monotonă"**: verifică `dist <= prevDist` la fiecare pas real, cu limită de siguranță (`maxSteps`), nu presupune un număr fix de tick-uri.
- Testul „bug suspectat" e documentat corect ca atare, iar cel rescris de planner verifică un invariant real, nu o coincidență de implementare.

Nu am găsit teste care ar trece indiferent de cod sau teste redundante în lotul T-11. Reparările la testele vechi (schimbarea `arcCalls.length===0` în `===1` imediat după Hide) sunt corect motivate de noua semantică (agentul rămâne vizibil în `leaving`), nu ascund o regresie.

**Fișiere verificate:** `D:\RPGfactory\docs\handoff\T-11-coder.md`, `D:\RPGfactory\public\app.js`, `D:\RPGfactory\docs\handoff\T-11-coder-raport.md`, `D:\RPGfactory\docs\handoff\T-11-tester.md`, `D:\RPGfactory\test\app.test.mjs`, `D:\RPGfactory\docs\handoff\T-11-tester-raport.md`.

---

## Decizia planner-ului

Accept ambele livrări. Toate 125 de teste trec (`node --test` pe toate fișierele din `test/`).

Adopt definitiv observația de proces (a doua oară la rând, după T-10): o corecție care cere **raționament de design** (nu doar o greșeală clară de formulare fără ambiguitate, gen câmp JSON greșit numit) merge la coder ca task punctual, oricât de mic ar fi diff-ul. Diferența față de T-02 (unde am reparat direct): acolo nu exista nicio ambiguitate de comportament, doar o structură de date descrisă greșit; aici a fost nevoie de calcul fizic (rate de scale vs. viteză de mers) ca să decid ce înseamnă "a plecat corect" — asta e judecată de design, nu corectare de fapt.

T-11 e închis. Rămân 8 din cele 10 puncte de paritate identificate (am sărit #2 „blocat" — nici referința nu-l rezolvă pentru CLI).
