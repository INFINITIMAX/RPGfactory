# T-17 + T-17b — Raport reviewer

## VERDICT: ACCEPT

Am citit, în ordine, brief-ul coder-ului (T-17), codul (`public/app.js`), raportul coder-ului, brief-ul tester inițial (T-17), brief-ul follow-up (T-17b), secțiunea T-17 din `test/app.test.mjs` (liniile ~2705-3149, plus helperele de la ~543-602), și raportul tester T-17b.

### 1. Cod inutil în plus față de brief?
Nu. `public/app.js`: `regionForWorldPos` (liniile 195-201), cele 4 imagini axe/pickaxe (203-221), constantele + `drawRegionLandmarks()` (223-270), alegerea sprite-ului în bucla `draw()` (554-567) și apelul `drawRegionLandmarks()` (540) reproduc exact brief-ul, fără constante duplicate (reutilizează `RUN_SPRITE_FRAME_COUNT`), fără fișiere în plus, fără opțiuni neceurte. Corespunde 1:1 cu raportul coder-ului.

### 2. Diagnosticul planner-ului despre cele 5 eșecuri e corect?
Da, confirmat prin citirea directă a codului: `tick()` (linia 868) apelează `updateZones()` (874) și `initState().then(() => { tick(); ... })` (880) rulează automat la încărcarea scriptului, înaintea oricărui `setAgents()` explicit din test. `updateZones()` (500-522) calculează `projects` doar din `agents` vii — cu `agentsOnServer` gol la acel moment, `allocateCells([], previous)` întoarce un layout gol, ștergând orice celulă semănată prin `initialState`. Comportamentul `updateZones()` e corect pentru un proiect fără agenți; bug-ul era strict în tehnica de test, exact cum a scris planner-ul.

### 3. Tehnica "filler" e verificată programatic sau presupusă?
Verificată programatic. `assertAgentInCell()` (linia 2795) cheamă `computeAgentPositions()` real din sandbox și compară `.x`/`.y` cu celula așteptată, cu mesaj explicit de eșec la „presetup” dacă numărul de fillere/ordinea `ring()` nu s-ar potrivi — și e apelat în toate cele 7 teste relevante (2843, 2865, 2887, 2909, 2936, 2966-2967, 2986), înaintea aserțiunii centrale. Nu e un calcul pe hârtie neverificat.

### 4. Cele 2 reparații directe ale planner-ului sunt corect încadrate ca infrastructură mecanică?
Da. Ambele sunt vizibile în fișierul curent:
- `assertAgentInCell` compară explicit `.x`/`.y` separat, cu comentariu care documentează exact pitfall-ul cross-realm — nicio decizie de interpretare a testului, doar corectarea unei erori mecanice de `assert.deepEqual` pe obiect din alt realm `vm`.
- Testul de frameCount golește `app.drawImageCalls.length = 0` la fiecare iterație — pur mecanic, nu schimbă nicio așteptare de comportament.
Corect încadrate ca infrastructură, nu necesitau tester.

### 5. Testele T-17 finale sunt redundante sau ar trece indiferent de cod?
Nu am găsit teste fără valoare. Fiecare test verifică o schimbare de cod concretă care l-ar face să cadă: `regionForWorldPos` (4 cazuri, inclusiv strict `>`/`<` pe axe), alegerea sprite corectă per cadran × stare (idle/run) × temă (forest/gold), non-regresie cadran neutru (acum verificată real, nu din întâmplare), fallback fără `onload` (acum verificat că agenții chiar sunt în cadranele corecte, nu doar calea generică), frameCount pe 6 nu 8, cele 3 landmark-uri (poziții, ciclare copaci vs. static aur, ancorare la bază, ordine față de `drawZones()`). Nu am găsit teste redundante — testele „idle” vs „walking” verifică ramuri de cod diferite (`running` true/false), iar testele forest/gold sunt paralele dar necesare (verifică imagini diferite, nu duplicat).

Munca coder-ului respectă strict brief-ul, diagnosticul planner-ului e corect confirmat prin cod, iar testele T-17/T-17b sunt riguroase, verificate programatic și fără teste-fantomă.

---

## Decizia planner-ului

Accept T-17 și T-17b. Rulare finală: 175 teste, 0 eșecuri.

T-17 + T-17b închise. Zonele de pădure (jos-dreapta) și aur (sus-dreapta) sunt funcționale, cu tranziție automată idle/run între sprite-ul normal și cel tematic, în funcție de cadranul geografic în care cade celula agentului.
