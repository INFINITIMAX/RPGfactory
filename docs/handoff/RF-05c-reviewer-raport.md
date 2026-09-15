# RF-05c — Raport reviewer (posturi persistente + pawn-uri + animație minimă)

## Verdict: ACCEPT

Am citit, în ordine, toate documentele indicate: AGENTS.md, docs/handoff/RF-05c-coder.md, migrations/004-sloturi.sql, world.js (profilesByProject/assignSlots), slot-store.js, secțiunea /api/world din server.js + wrapper-ul close(), docs/handoff/RF-05c-coder-raport.md, docs/handoff/RF-05c-tester.md, test/world.test.mjs, test/slot-store.test.mjs, test/server-world.test.mjs (versiunile curente, post RF-05c-b), docs/handoff/RF-05c-tester-raport.md, docs/handoff/RF-05c-b-tester.md, docs/handoff/RF-05c-b-tester-raport.md, public/world.js.

## Codul coder-ului (world.js, slot-store.js, server.js, public/world.js)

Niciun cod în plus față de brief. Cele patru livrabile corespund exact §1 din RF-05c-coder.md, fără extensii de scop.

1. **`assignSlots` — cele trei reguli de memorie, verificate direct în cod (world.js:132-161):**
   - Păstrare post valid: pasul 1 parcurge `profileIds` în ordine, păstrează `prevSlot` doar dacă `prevSlot !== undefined && prevSlot < capacity && !takenSlots.has(prevSlot)` — corect, inclusiv garda defensivă anti-coliziune.
   - Eliberare la dispariție: un profil absent din `profileIds` nu apare niciodată în buclă, deci nu ajunge în `result` — eliberarea e implicită și corectă.
   - Alocare determinist crescătoare pentru cei noi: pasul 2, `nextFree` pornește de la 0 și crește doar peste sloturi deja ocupate (`while (nextFree < capacity && takenSlots.has(nextFree)) nextFree++`), aplicat în ordinea din `profileIds` — determinist, fără hash/random.
   - Cazuri de graniță: `capacity === 0` → bucla `nextFree` iese imediat, niciun rezultat (verificat cu testul de la world.test.mjs:214-220). Overflow (`profileIds.length > capacity`) → `continue` fără excepție, exact `capacity` sloturi ocupate (world.test.mjs:203-211). Post vechi peste noua capacitate → `prevSlot < capacity` fals, realocat prin pasul 2 dacă mai încape (world.test.mjs:178-183), exclus dacă nu mai încape nimeni (world.test.mjs:185-191, capacity=0).
   - **Testele world.test.mjs chiar ar pica la o implementare greșită** — am verificat mental fiecare: dacă s-ar elimina garda `slotIndex < capacity` la păstrare, testul (8) ar pica; dacă alocarea nouă ar fi în altă ordine decât `profileIds`, testul (5) ar pica; dacă overflow ar arunca excepție, testele (10)/(11) ar pica cu `assert.doesNotThrow`. Nu sunt teste "care trec oricum".

2. **`slot-store.js` — `saveSlots`:**
   - Șterge corect doar rândurile proiectului curent absente din `assignment` (`existingRows` filtrate cu `WHERE project = ?`, apoi `toDelete` = cele care nu mai apar în `assignment`) — nu atinge alte proiecte, pentru că interogarea inițială e deja scopată pe `project`.
   - Fără CAS — motivația din comentariu (slot-store.js:13-23) e coerentă și identică ca structură cu `layout.js`: singurul scriitor e serverul dintr-un singur loc, fără endpoint de mutație expus, risc benign de recalculare concurentă.

3. **Testele corectate RF-05c-b (`slot-store.test.mjs`)** — verificate concret (nu doar raportul):
   - Testul (14), linia 67-92: `makeSharedStores(dir)` deschide `profilesStore`/`slotStore` pe ACELAȘI fișier disc (`path.join(dir, 'shared.db')`), profilurile create real prin `profiles.createProfile({ name: ... })`, id-urile reale (UUID) folosite apoi în `assignment` — corect, nu `:memory:` separate.
   - Testul (16), linia 125-154: profiluri reale `x`, `y`, `z`, verifică izolarea corectă între proiecte A/B.
   - Testul de revizie, linia 211-236: folosește fișier real (`dbPath`, nu `:memory:`), creează profil real, verifică SQL direct `revision === 2` după a doua scriere.
   - Modelul e identic cu `makeSharedStores` din `runs.test.mjs`, conform brief-ului de corecție.

4. **Testul corectat din `server-world.test.mjs`** (linia 102-106): `assert.deepEqual(json, { zones: [], pawns: [] })` — reflectă corect noul contract, fără nicio slăbire (nu s-a eliminat nimic, doar s-a adăugat câmpul lipsă la asertare).

5. **Wiring `server.js`:**
   - `capacity = zone.cells.length * 7` (linia 602) calculat în bucla `for (const zone of zones)`, DUPĂ ce `zones` a fost deja construit din `laid`/`projects` (liniile 574-585) — ordinea cerută respectată.
   - `workingIds` (liniile 593-598): filtrat STRICT `run.lifecycle === 'running'`, exclude explicit `queued`/`paused` — confirmat și de testele (21) din server-world.test.mjs.
   - Wrapper `close()`: `slotStore.close()` adăugat în ACELAȘI wrapper existent (`server.close = (callback) => nativeClose(...)`, linia 738-751), imediat lângă `layoutStore.close()`, nu un wrapper nou. `server.closeSlotStore = slotStore.close` adăugat simetric cu `closeLayoutStore`.

6. **`public/world.js`:**
   - Convenția `slot_index = cellIndex*7 + localSlotIndex` aplicată identic (liniile 185-186 în `drawPawns`, aceeași formulă ca server.js).
   - `updateAnimationLoop()` (liniile 241-253): pornește bucla RAF doar dacă `!prefersReducedMotion() && pawns.some(p => p.working)`, o oprește (`cancelAnimationFrame`, `rafId = null`) imediat ce condiția devine falsă — apelată doar la fiecare `pollOnce()`, nu la fiecare cadru.
   - Pulsația (`Math.sin(nowMs / 300)`, cu `nowMs = performance.now()`) e bazată pe timp real, nu pe cadre — desenul e independent de rata de refresh.
   - Cazul `reduced-motion`: pawn-ii `working` primesc contur static (`lineWidth = 2.5`, culoare distinctă `#c96442`), fără pulsație — verificat în `drawPawns` liniile 200-219.

7. **`sizeFactor`** — fix la `1` în `server.js` (linia 620), cu comentariu explicit despre RF-06 la locul exact unde valoarea va deveni variabilă; frontend-ul îl folosește deja ca multiplicator (`baseRadius = 6 * (pawn.sizeFactor || 1)`), fără nicio aproximare din numărul de sesiuni sau alt proxy fals.

## Testele tester-ului

Nu am găsit teste care trec întotdeauna indiferent de cod, nici teste redundante nejustificate. Fiecare test din `world.test.mjs`/`slot-store.test.mjs`/`server-world.test.mjs` verifică o proprietate concretă care ar pica la o implementare greșită corespunzătoare (verificat prin inspecție directă a codului testat vs. asertări, nu doar prin citirea rapoartelor). Testele §2.4.19-25 din server-world.test.mjs acoperă exact cazurile numite explicit în brief (running/queued/paused, absență last_project, persistență slotIndex, 405 fără mutație). Testul de `revision` adăugat suplimentar de tester e justificat (simetric cu `layout.test.mjs`) și nu e redundant cu celelalte.

Corecția RF-05c-b e aplicată corect și complet: cauza reală (FK reală pe `profile_id`, id-uri sintetice fără profiluri reale) a fost rezolvată cu modelul `makeSharedStores` deja existent, iar testul vechi neactualizat pentru `pawns` a fost corectat fără slăbire de asertare.

## Concluzie

Nicio problemă de fond găsită. Cod fidel briefului, fără extensii nejustificate; teste care dovedesc corectitudinea (inclusiv cazurile de graniță cerute explicit) și corecția RF-05c-b e aplicată exact cum a cerut planner-ul.

Fișiere verificate (căi absolute):
- D:\RPGfactory\migrations\004-sloturi.sql
- D:\RPGfactory\world.js
- D:\RPGfactory\slot-store.js
- D:\RPGfactory\server.js
- D:\RPGfactory\public\world.js
- D:\RPGfactory\test\world.test.mjs
- D:\RPGfactory\test\slot-store.test.mjs
- D:\RPGfactory\test\server-world.test.mjs
- D:\RPGfactory\docs\handoff\RF-05c-coder.md, RF-05c-coder-raport.md, RF-05c-tester.md, RF-05c-tester-raport.md, RF-05c-b-tester.md, RF-05c-b-tester-raport.md

---

## Decizia planner-ului

Accept RF-05c. Rulare finală: **567/567 teste, 0 eșecuri**.

Un tur de corecție necesar, dar pe teste, nu pe cod de producție: am rulat suita înainte de reviewer și am găsit 6 eșecuri reale (5 din lipsa unor profiluri reale pentru cheia externă `profile_slots.profile_id → agent_profiles.id`, o constrângere pe care chiar eu am specificat-o în brief fără să atrag atenția tester-ului asupra ei explicit; 1 dintr-o asertare veche de la RF-05b neactualizată pentru câmpul nou `pawns`). Corectate la RF-05c-b, folosind modelul `makeSharedStores` deja existent în `test/runs.test.mjs` — nicio slăbire de test, doar setup corect.

Verificare vizuală reală, pe instanță izolată, cu un profil având o sesiune `running` asociată: harta desenează corect zonele și pawn-ii, poziționați exact pe sloturile lor (convenția `slot_index = cellIndex*7 + localSlotIndex` confirmată prin inspecția răspunsului JSON și a poziției vizuale), `working: true` corect reflectat. Pulsația animației nu a putut fi confirmată empiric — browserul de automatizare ține tab-ul `document.hidden = true`, ceea ce suspendă complet `requestAnimationFrame` (confirmat direct: `requestAnimationFrame` monkey-patchuit, zero apeluri în peste 2 secunde; diff pixel-cu-pixel pe canvas, zero diferențe pe 600ms) — o limitare a mediului de automatizare, nu un defect de cod. Am compensat verificând logica de animație direct în cod (pornire/oprire condiționată corect, pulsație bazată pe `performance.now()`, tratare corectă a `prefers-reduced-motion`), confirmată și de reviewer independent.

**RF-05c închis. RF-05 (harta) e complet închis** — toate cele trei sub-loturi (05a algoritm, 05b randare+persistență zone, 05c posturi+pawn-uri+animație) sunt gata, verificate, cu 3 bug-uri reale găsite și reparate pe parcursul întregului RF-05 (unul de layout logic evitat din start prin design corect, unul de coliziune de scop la RF-05b, unul de teste la RF-05c) — niciunul ascuns, toate documentate.

**Nu fac commit/push fără aprobare explicită** — aștept confirmarea lui Lucian.
