# T-10 — Raport reviewer

# Verdict: ACCEPT

Am citit toate cele 7 fișiere/artefacte, plus `public/zones.js` (pentru a verifica direct afirmațiile despre `SLOTS_PER_CELL`, `CELL_SIZE` și determinismul `allocateCells`). Rezumat pe cele 4 întrebări:

## 1. Codul coder-ului (`public/app.js`, `public/index.html`)

Fidel briefului, punct cu punct:
- `updateZones()` — calcul `counts`/`projects` identic cu snippet-ul din brief, `allocateCells(projects, previousMap)`, semnătură JSON + salvare-doar-la-schimbare — tiparul exact din bot-crossing, inclusiv ramura "aceleași date, doar actualizăm referința" (linia 202 din app.js), corect, nu doar copiat superficial.
- `zoneCellToPixels`, `cellForAgent` (cu fallback `{x:0,y:0}`), `drawZones` (nume proiect = `cwd.split(/[\\/]/).pop()`) — toate exact ca în brief.
- Jitter la coliziune — implementat corect (grup sortat determinist după `sessionId`, deplasare circulară doar când `n>1`).
- `<script src="/zones.js">` în `index.html` e poziționat corect (după `merge-state.js`, înainte de `app.js`).

Singurul lucru "în plus" față de textul strict al briefului e `computeAgentPositions()` ca funcție separată, reutilizată de `draw()` și de handler-ul de click. Nu e scope creep — brief-ul cerea explicit ca poziția clicabilă să coincidă cu cea desenată, iar coder-ul a motivat clar decizia în raport. La fel, adăugarea câmpului `plots` în body-ul `PUT /api/state` (care lipsea) e necesară funcțional, nu cod inutil — fără ea, `queueSave()` din `updateZones()` n-ar fi persistat nimic pe disc.

Decizia de a păstra `cellIndexToPosition`/`GRID_*` ca "mort" e rezonabilă și corect documentată: brief-ul spune explicit să nu le șteargă dacă testele existente le exercitau direct, iar coder-ul a verificat și citat liniile exacte din testul vechi. Nu găsesc bug-uri de logică sau abateri de la constrângeri (fișierele interzise nu au fost atinse, nicio dependență nouă, sprite/culoare per-agent neschimbate).

## 2. Reparațiile tester-ului (Partea 1)

Ambele corecte și minimale:
- Încărcarea `zones.js` în `vm.runInContext`, în același sandbox, înainte de `app.js` — exact tiparul de la T-07 pentru `merge-state.js`.
- `fillRect` lipsă din `fakeCtx` — bug real, găsit singur, nesemnalat de coder; fără el aproape toată suita ar fi aruncat la orice `draw()` cu un proiect populat. Reparația (spy `fillRectCalls`) e corectă și proporțională.
- `defaultDiskState()` cu `plots: {}` — corect, sincronizat cu forma reală a stării.

Rescrierea celor 8 teste vechi via `agentPixelPosition`/`computeAgentPositions`: am verificat că toate cele 8 scenarii rescrise folosesc un singur agent viu în `setAgents(...)`, deci apelul oracol `computeAgentPositions([agent])` reproduce exact grupul folosit de `draw()` real (grup de 1 = fără jitter, deterministic) — nu există risc de drift între oracol și comportamentul real. Testele verifică în continuare exact ce verificau înainte (hit-test pe centru/în afara razei, formatare `updatedAt`, indicator de status, contur de selecție, filtrare agent arhivat, Hide/Unhide) — doar sursa poziției s-a schimbat, rigoarea a rămas identică. Nu găsesc niciun test slăbit.

## 3. Cele 10 teste noi pentru zone

Solide, nu redundante, nu trec necondiționat:
- Fiecare test are un "ce l-ar face să cadă" concret (verificat de mine): jitter dezactivat la grup de 1, distribuție degenerată pe o singură celulă, jitter lipsă/prea mare la coliziune, suprapunere de proiecte, `queueSave()` apelat necondiționat, semnătură de schimbare calculată greșit, număr greșit de dreptunghiuri/etichetă cu cale completă, fallback eliminat, determinism rupt.
- Oracolele (`allocateCells` apelat direct în test cu aceiași parametri ca la primul tick real — `previousMap` gol) reproduc corect condițiile din producție; am verificat că `allocateCells`/`layOut` nu au nicio sursă de nedeterminism (`Math.random` absent), deci comparațiile sunt stabile.
- Testul de distribuție pe 2+ celule nu fixează o valoare exactă (ar fi fragil), ci doar invariantul "nu toți pe aceeași celulă" — corect calibrat.
- Respectă explicit restricția din brief de a nu testa culorile hex exacte.

## 4. Cele 2 corecții ale planner-ului

**(a) cross-realm deepEqual → equal pe proprietăți**: verificat — e exact tiparul cunoscut de la `merge-state.test.mjs`/T-06 (obiect din realm-ul `vm` vs literal din realm-ul de test, `Object.prototype` diferit). Schimbarea de la `assert.deepEqual(cell, {x:0,y:0})` la `assert.equal(cell.x,0); assert.equal(cell.y,0)` păstrează exact aceeași rigoare (verifică ambele valori exact), nu ascunde nimic. Corectă.

**(b) filtrarea strokeRect după lățime**: am confirmat direct în `app.js` — `drawZones()` apelează `ctx.strokeRect(pos.x-CELL_SIZE/2, pos.y-CELL_SIZE/2, CELL_SIZE, CELL_SIZE)` cu `CELL_SIZE=80`, iar conturul de selecție din `draw()` folosește `SPRITE_DEST_SIZE=56`. Filtrarea `w === SPRITE_DEST_SIZE` izolează corect, fără fals-pozitiv, cu datele actuale. Riscul teoretic semnalat (dacă `CELL_SIZE` ar deveni vreodată 56) e real dar minor și acceptabil — o soluție mai robustă ar fi marcarea sursei apelului (ex. un al 3-lea parametru/tag pe spy) în loc de a distinge după dimensiune, dar nu e un motiv de respingere acum, doar o notă pentru viitor dacă `CELL_SIZE` se schimbă vreodată.

Despre **oportunitatea** ca planner-ul să repare direct: (a) e clar infrastructură de test (tipar cunoscut, mecanic, fără decizie de design), potrivit ca planner s-o repare direct. (b) e mai degrabă o **asumpție de test invalidată de o schimbare de design legitimă** (introducerea `drawZones()`) — conceptual mai aproape de munca tester-ului decât de "infrastructură pură". Fixul e corect, dar aș recomanda ca pe viitor acest tip de corecție (reinterpretarea unui test funcțional, nu doar un mock stricat) să treacă printr-un ciclu scurt înapoi la tester, chiar dacă rezultatul e identic — nu pentru că fixul actual e greșit, ci ca disciplină de proces (patru ochi pe decizii de "ce anume testează un test", nu doar pe "de ce nu rulează mock-ul").

## Concluzie

Cod, teste și cele două corecții — toate corecte, minimale, fără cod inutil sau teste degenerate. Singura observație e de proces (nu de calitate): corecția (b) ar fi meritat, ideal, un pas retur la tester. Nu recomand retrimitere pentru asta — rezultatul verificat e corect.

Fișiere relevante:
- `D:\RPGfactory\docs\handoff\T-10-coder.md`
- `D:\RPGfactory\public\app.js`
- `D:\RPGfactory\public\index.html`
- `D:\RPGfactory\public\zones.js`
- `D:\RPGfactory\docs\handoff\T-10-coder-raport.md`
- `D:\RPGfactory\docs\handoff\T-10-tester.md`
- `D:\RPGfactory\test\app.test.mjs`
- `D:\RPGfactory\docs\handoff\T-10-tester-raport.md`

---

## Decizia planner-ului

Accept ambele livrări. Toate 113 teste trec (`node --test` pe toate fișierele din `test/`). Verificat manual, live: `/api/state` întoarce `plots:{}`, `index.html`/`zones.js` se servesc cu 200.

Adopt observația de proces a reviewer-ului: de acum, o corecție care **reinterpretează ce anume testează un test** (nu doar repară un mock stricat) merge înapoi la tester ca pas scurt, chiar dacă eu am deja soluția clară în minte — linia dintre "infrastructură pură" și "asumpție de test invalidată de design nou" contează, chiar când rezultatul final ar fi identic.

T-10 e închis. **Toată lista de paritate cu bot-crossing e completă** (mai puțin alte harness-uri, exclus explicit de Lucian încă de la început).
