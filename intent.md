# Intent — RPGfactory

## Ce este

Un vizualizator local, 2D, pentru agenții reali de coding ai lui Lucian (Claude Code, ulterior alte harness-uri). Scop declarat: „mă laud cu el" — un produs terminat, arătos, pe care îl poate arăta public (LinkedIn etc.), nu doar un experiment intern.

## Scopul de funcționalitate — paritate cu bot-crossing

**Produsul nostru e produsul lor (bot-crossing), cu toată funcționalitatea și toate elementele vizuale, doar că:**
- altă temă vizuală (nu colonie spațială/astronauți — temă proprie, în lucru; a trecut medieval → spațial → **înapoi medieval** (12-09-2026), Tiny Swords e pachetul activ; tema poate încă schimba, nu bloca funcționalitatea din cauza asta)
- **2D**, nu 3D (probabil stil pixelat/pixel art la final, nu vector neted)
- plus un **strat suplimentar, al nostru**, care nu există în bot-crossing: **hiperspecializare pe agent** — rang (Fleet Admiral/Captain/Cadet, din model), specializare (ce fel de task face agentul), și ideea de nivel care crește când agentului i se încarcă knowledge persistent.

Nu construim un subset minimal și gata — obiectivul e să acoperim, în timp, toată lista de funcționalități reale pe care le are bot-crossing (vezi harta de arhitectură făcută în conversație, sau re-derivată din codul lor la nevoie), reconstruite de la zero, cu referință activă la codul lor când rezolvă deja o problemă (parsare, cache, alt harness) — nu ghicim ce au făcut ei, verificăm.

### Lista de funcționalitate bot-crossing, de acoperit (bifează pe măsură ce se face)

**Important, clarificat 13-09-2026**: Lucian vrea paritate REALĂ — nu doar aceleași date, ci **aceeași funcționalitate, aceeași interpretare vizuală, agenți care se mișcă similar cu originalul** (doar în 2D, nu 3D, pentru claritate). Stratul de hiperspecializare (rang/nivel) se adaugă **DOAR după** ce toată lista de mai jos e acoperită — nu în paralel, nu înainte.

- [x] Citire sesiuni Claude Code (poziție live, status, pid) — T-01
- [x] Rang din model (Fleet Admiral/Captain/Cadet) — T-02 *(parte din stratul de hiperspecializare, făcută deja înainte de clarificarea de mai sus — nu se reface, dar restul stratului așteaptă)*
- [x] Click → deschide sesiunea înapoi în harness (deep link `claude://...`) — T-03
- [x] Stare reală working/waiting/sleeping — T-05 (algoritm exact bot-crossing, `awaitingReply` pe coada transcript-ului)
- [x] Arhivare/ascundere agent, persistată local — T-06 (backend) + T-07 (frontend, buton Hide, listă ascunși, merge pe 3 căi la conflict)
- [x] Layout stabil la scară — T-08 (algoritm de alocare, hexagoane→pătrat) + T-09 (persistență `plots`) + T-10 (integrare în randare: zone per proiect)
- [x] Elemente vizuale: sprite-uri reale, animație idle — T-04 (muncitor Pawn, Tiny Swords)
- [x] **Mișcare reală** (apare, merge spre zonă, pleacă) — T-11 (mașină de stare spawning→walking→at-site→leaving, sprite de alergare, fără pathfinding/obstacole — nu ne trebuie la 2D plat)
- [x] Zoom + pan cameră, spawn în centrul ecranului, zona de lucru pe tot ecranul — T-12
- [x] Teren concret (fundal de apă + iarbă din tilemap real) — T-13
- [x] Lume vie: decorații pe celule (tufe animate, stânci statice) + nori în mișcare pe fundal — T-14 + T-14b (fix suprapunere decorație/agent)
- [x] Simplificare fundal: doar iarbă peste tot (apă/nori eliminate, independent de zone/agenți), zoom implicit 2x, turn central (Tiny Swords) la spawn point — T-15
- [x] Fix: celula `(0,0)` (turn/spawn point) rezervată, exclusă din alocarea `zones.js` — portat din `SHIP_CELL` (bot-crossing) — T-16 + T-16b (fix ripple teste ancoră)
- [x] Zone tematice: pădure (tăiat lemne, cadran jos-dreapta) + aur (minat, cadran sus-dreapta), legate de poziția geografică a celulei, nu de proiect — T-17 + T-17b (fix ripple teste semănare stare)
- [ ] `blocat` — verificat 13-09-2026: **nici bot-crossing nu rezolvă asta pentru CLI** (doar pentru bookkeeping-ul aplicației desktop, la care noi n-avem acces). Ar necesita heuristic propriu (scanare `is_error` în coada transcriptului) — decizie amânată explicit de Lucian, nu e o simplă portare
- [ ] `sărbătorește` (PR merged) — necesită integrare git/GitHub, complet absentă la noi
- [ ] Indicator „?" dedicat pentru „are nevoie de tine" (separat de punctul de culoare de status)
- [ ] `viewedAt` — marchezi ca „văzut", stinge indicatorul „?"
- [x] „New session" + „Reveal in folder" — meniu de acțiuni per agent, portat din `/api/new-session`/`/api/reveal` (bot-crossing), stilizat cu assets Tiny Swords — T-18
- [ ] `hiddenProjects` — ascunde tot proiectul dintr-o dată, nu doar agenți individuali
- [ ] Validare Host/Origin pe server (securitate minimă anti-DNS-rebinding/CSRF) — gol real, nu decizie
- [ ] Dezambiguizare proiecte cu nume de folder identic (`disambiguateProjects`)
- [ ] Alte harness-uri (Codex, Cursor, ...) — **exclus explicit de Lucian**, nu e gol, e decizie
- [ ] Strat de hiperspecializare complet (al nostru, nu din bot-crossing): specializare pe task, nivel din knowledge persistent — **așteaptă până se bifează tot ce e deasupra**

## Ce NU e obiectivul

- Nu copiem cod din bot-crossing (MIT ar permite-o, dar Lucian a ales explicit „de la zero, cu referință").
- Nu ținem 3D, camera, post-procesare, pipeline de asset .glb — inutile la 2D.
- Nu blocăm progresul funcțional în așteptarea temei vizuale finale — funcționalitatea se construiește cu placeholder-e, tema se schimbă oricând peste ea.

## Disciplină de lucru

Fluxul de 4 agenți (planner→coder→tester→reviewer) pentru orice task cornerstone, cu brief-uri și rapoarte în `docs/handoff/`, conform regulilor globale ale lui Lucian. Lucian vrea implicare și explicație la fiecare decizie de arhitectură — nu se decide tacit.
