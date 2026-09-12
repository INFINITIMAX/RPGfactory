# T-10 — Reparare mock + rescriere teste de poziționare (zone per proiect)

## Sarcină, în două părți

### Partea 1 — reparare (obligatorie întâi)

`public/app.js` folosește acum `allocateCells` din `public/zones.js`, încărcat separat în browser prin `<script>`, dar NEÎNCĂRCAT în `loadApp()` din `test/app.test.mjs` — orice test care ajunge la `tick()`/`updateZones()` va arunca `ReferenceError: allocateCells is not defined`. Repară la fel cum s-a procedat la T-07 pentru `merge-state.js`: încarcă și sursa lui `public/zones.js` cu `vm.runInContext` în ACELAȘI sandbox, înainte de `app.js`.

Verifică și `defaultDiskState()` (sau echivalentul din test) — dacă nu include `plots: {}`, adaugă-l, la fel cum s-a sincronizat la T-09.

### Partea 2 — rescrierea testelor de poziționare (schimbare de contract, intenționată)

Poziționarea nu mai vine din `hashToCellIndex(sessionId) → cellIndexToPosition` (grilă globală 8×8) — vine din `zoneCellToPixels(cellForAgent(agent, state.plots[agent.cwd]))`, cu jitter dacă mai mulți agenți din același proiect cad pe aceeași celulă. **Testele vechi din T-01/T-04 care presupun poziția pe grila globală (cele 8 locuri semnalate de coder în raport, liniile 457, 479, 504, 601, 625, 667, 710, 754 din `test/app.test.mjs`) trebuie rescrise** să calculeze poziția așteptată prin lanțul nou: agent → `cwd` → `state.plots[cwd]` (setat prin `setAgents`/fixture-uri de test, care acum trebuie să populeze și `state.plots` corespunzător, sau să declanșeze `tick()` complet ca zonele să se calculeze real prin `allocateCells`).

Decide, caz cu caz, dacă un test vechi:
- **testează ceva încă valabil** (ex. "un agent mort nu se desenează") → păstrează testul, doar actualizează CALCULUL poziției așteptate la noul lanț.
- **testa specific grila globală ca mecanism** (ex. "hash mod 64 dă exact celula X") → acel test nu se mai aplică conceptual (grila globală nu mai poziționează nimic) — rescrie-l ca test pentru noul mecanism echivalent (`cellForAgent` — hash mod numărul de celule ale proiectului), nu-l șterge fără înlocuire.

Nu îngheța `cellIndexToPosition`/`hashToCellIndex` ca "black box netestat" doar pentru că rămân definite — `hashToCellIndex` chiar mai e folosit (în `cellForAgent`, `colorForProject`), deci testele lui directe (determinism etc.) rămân valide neschimbate. `cellIndexToPosition` însă nu mai e apelată din `draw()`/click — dacă un test o testează DOAR ca sursă de poziție pe hartă, acel test trebuie rescris pentru noul lanț, nu păstrat ca a testat ceva ce codul nu mai face.

## Cazuri noi de acoperit

1. **Un singur proiect, un singur agent**: poziția lui = `zoneCellToPixels(primei celule din zona proiectului)`, fără jitter (grup de 1).
2. **Un singur proiect, mai mulți agenți**: toți primesc poziții în interiorul celulelor zonei; cel puțin un test verifică distribuția pe celule diferite ale zonei atunci când proiectul are mai multe celule alocate (nu toți suprapuși).
3. **Coliziune pe aceeași celulă → jitter**: doi agenți din același proiect care hash-uiesc pe aceeași celulă (poți construi acest caz alegând `sessionId`-uri care produc același `cellForAgent`) → pozițiile finale trebuie să difere (jitter aplicat), dar rămân aproape de centrul celulei (verifică o distanță maximă rezonabilă, nu doar "diferă").
4. **Două proiecte diferite**: agenți din `cwd`-uri diferite ajung în zone diferite, nesuprapuse (verifică folosind `state.plots` populat real prin `allocateCells`, nu presupus manual).
5. **`updateZones()` — salvare doar la schimbare**: două `tick()`-uri succesive cu ACEEAȘI listă de agenți (deci același layout calculat) → un singur `PUT /api/state` (verifică prin numărarea cererilor mock de `fetch`, la fel ca testul de debounce de la T-07), nu unul per tick.
6. **`updateZones()` — salvare la schimbare reală**: un agent nou dintr-un proiect nou apare între două tick-uri → layout-ul se schimbă → se declanșează un `PUT` (după debounce-ul de 500ms existent).
7. **`drawZones()`**: verifică prin spy pe `fillRect`/`strokeRect`/`fillText` că se desenează un dreptunghi per celulă a fiecărui proiect din `state.plots`, și că numele afișat e doar ultimul segment al căii (`cwd.split(/[\\/]/).pop()`), nu calea completă.
8. **Proiect fără nicio celulă** (`state.plots[cwd]` absent sau `[]`, ex. pool epuizat de la T-08): `cellForAgent` întoarce fallback `{x:0,y:0}` fără să arunce — verifică asta explicit.

## Ce NU e un test valid

- Nu testa exact culorile din `ZONE_PALETTE` una câte una fără motiv — testează că funcția de alegere a culorii e deterministă (același `cwd` → aceeași culoare la apeluri repetate), nu valoarea hex exactă (ar fi fragil la o simplă rearanjare a paletei).
- Nu slăbi un test relevant doar ca să scapi de rescriere — dacă un test vechi verifică ceva ce încă e adevărat, păstrează-l, doar cu calculul de poziție actualizat.

## Constrângeri dure

- Nu modifica `public/app.js`, `public/zones.js`, `public/merge-state.js`, `public/index.html`.
- Nu rula comenzi — planner rulează.
- `node --test`, fără dependențe noi.

## Predare

Modificări în `test/app.test.mjs` (reparare + rescriere + extindere) + `docs/handoff/T-10-tester-raport.md`: ce ai reparat, ce teste vechi ai rescris și de ce (listă explicită, linie cu linie dacă se poate), ce ai testat nou, ce NU (motivat), comanda exactă de rulare a întregii suite.
