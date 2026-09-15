# RF-05b — Raport reviewer (persistență Layout + endpoint + randare statică Canvas 2D)

## Verdict: ACCEPT (lotul RF-05b, inclusiv corecția RF-05b-b)

Am citit, în ordine, toate fișierele cerute: AGENTS.md, brief coder RF-05b, migrations/003-layout.sql, layout.js, world.js (backend), secțiunea /api/world + wrapper close() din server.js, raportul coder-ului, brief-ul tester-ului, cele trei fișiere de test, raportul tester-ului, public/world.js (versiunea curentă, cu IIFE), și brief-ul + raportul corecției RF-05b-b. Nu am modificat nimic.

## 1. Cod inutil față de brief

Nu am găsit. `layout.js`/`world.js` (backend) conțin exact CRUD-ul și funcțiile pure cerute, fără opțiuni/abstracții suplimentare. Nu există `hex_layout_cells` normalizat inutil, nu există endpoint de mutație pe `/api/world` (confirmat: singurul bloc de rută verifică `req.method !== 'GET' && req.method !== 'HEAD'` → 405, nicio ramură POST/PUT/DELETE nicăieri pentru `/api/world`).

## 2. Întrebările punctuale

**(1) `saveLayout` chiar șterge, nu doar ignoră** — confirmat în cod (`layout.js` L73-81): calculează `toDelete` ca proiecte din tabelă absente din `layoutMap` și rulează `DELETE FROM hex_layout WHERE project = ?` pentru fiecare, într-o tranzacție unică cu upsert-ul. Testul 3 din `layout.test.mjs` verifică asta prin `getLayout()` public, corect conform brief.
`getLayout`/`saveLayout` nu ating discul la simpla construcție — `getDb()` deschide lazy, memoizat (`dbHandle`), exact ca `profiles.js`/`runs.js`. Testul 5 (`layout.test.mjs`) verifică explicit că fișierul bazei nu există înainte de prima operație reală.

**(2) Raționamentul „fără CAS”** — coerent: singurul scriitor e serverul, dintr-un singur loc, fără endpoint de mutație expus. Confirmat direct în `server.js` că nu există nicio rută POST/PUT/DELETE pe `/api/world` — doar validarea metodei GET/HEAD urmată de 405 pentru orice altceva. Motivația e documentată explicit atât în `layout.js` cât și în migrația SQL, cu paralelă corectă la `observeRun`.

**(3) `groupProjects`** — verificat direct în cod (`world.js` L23-37): `if (!project) continue` exclude atât `null` cât și `''` (string gol e falsy în JS), corect. Sortare: `b.size - a.size` apoi tie-break alfabetic pe `a.id < b.id`. Determinist, independent de ordinea SQLite.

**(4) Wiring `server.js`** — `layoutStore` construit lazy exact ca `profilesStore`/`runsStore` (`createLayoutStore({ dbPath, migrationsDir, now })`, linia 188). Wrapper de `close()`: confirmat, ACELAȘI `nativeClose` (linia 687) extins cu `layoutStore.close()` (linia 697), nu un wrapper paralel. `server.closeLayoutStore` adăugat simetric cu `closeProfilesStore`/`closeRunsStore`.

**(5) Testele** — fiecare test verifică ceva ce ar pica la o implementare greșită, nu am găsit teste tautologice sau redundante:
- `layout.test.mjs`: toate cele 6 puncte au aserțiuni concrete (deepEqual pe conținut, nu doar `toBeDefined`); testul de `revision` folosește corect fișier real (nu `:memory:`) pentru un al doilea handle — motivat corect.
- `world.test.mjs`: acoperă null, string gol (separat, cum a cerut brief-ul), egalitate+alfabetic, mărime diferită, plus testul suplimentar pentru listă goală. Pentru `pickAccent`, testul de "culori distincte pe eșantion mare" e o adăugire utilă — fără el, testul de format ar trece și pentru o implementare degenerată `return '#000000'`, exact ce a semnalat corect tester-ul.
- `server-world.test.mjs`: punctul 15 (persistență reală) chiar dovedește persistență — compară `cells` din a doua cerere cu prima prin `deepEqual`, nu doar verifică status 200; ar pica dacă `layoutStore.getLayout()` n-ar fi citit corect layout-ul anterior sau dacă `allocateCells` ar recalcula de la zero. Punctul 16 (proiect nou, celule vechi neschimbate) e o dovadă indirectă suplimentară validă a memoriei RF-05a. Punctul 17 verifică explicit lipsa mutației după 405 (nu doar statusul).

**(6) Fix IIFE din `public/world.js`** — verificat prin citire directă: `(function () {` la linia 15, imediat după comentariul de antet (liniile 1-13), și `})();` la linia 176, ultima linie a fișierului, după `pollOnce();`. Tot codul (declarații `const`/`let`, toate funcțiile, apelul final, `window.addEventListener`) e în interior — nimic scăpat în afara IIFE-ului. Geometria (`hexToWorld`, `corner`, `slotsForCell`) și logica de desen/polling sunt identice cu ce descrie brief-ul original RF-05b-coder.md §4.2 — nicio schimbă de contract, doar încapsulare de scop, exact cum cerea brief-ul de corecție.

**(7) Contradicția „hud.css are deja teme light/dark”** — confirmată reală: am căutat explicit `prefers-color-scheme`/`data-theme`/`light`/`dark` în `public/hud.css` și nu există niciun rezultat — o singură temă întunecată fixă. Coder-ul a documentat corect discrepanța (în raportul RF-05b, secțiunea `pickAccent` și „Contradicții găsite”) și a proiectat paleta/textul pentru fondul întunecat existent, fără să inventeze un sistem de teme absent — nu a produs cod defect, doar o presupunere greșită de planner corectată rezonabil.

## Context verificare vizuală (raportată de planner)

Consistent cu ce am găsit în cod: prima instanță (fără IIFE) ar fi produs exact simptomul descris — coliziune de `POLL_INTERVAL_MS`/`requestToken` la nivel de top între două `<script>` clasice. După fix, structura codului susține randarea corectă descrisă (hexagoane per zonă, accent din `pickAccent`, sloturi, etichetă text). Nota cosmetică (suprapunere etichetă la zone foarte apropiate) e coerentă cu faptul că poziționarea etichetei (`labelY = originY + root.y - TILE - 6`) nu ține cont de zonele vecine — acceptabil ca backlog de estetică fină, neblocant.

## Concluzie

ACCEPT, fără rezerve. Cod minimal și conform brief-ului, fără CAS inutil, fără endpoint de mutație, wiring corect pe wrapper-ul existent. Testele sunt substanțiale — niciunul dintre cele verificate nu e tautologic, iar cazurile critic semnalate în brief (string gol, persistență reală între cereri, lipsă mutație la 405) sunt acoperite cu aserțiuni care ar pica la o implementare greșită. Corecția RF-05b-b e minimală, țintită, verificată prin citire directă ca fiind completă și fără regresii de contract.

Fișiere verificate (căi absolute):
D:\RPGfactory\AGENTS.md, D:\RPGfactory\docs\handoff\RF-05b-coder.md, D:\RPGfactory\migrations\003-layout.sql, D:\RPGfactory\layout.js, D:\RPGfactory\world.js, D:\RPGfactory\server.js, D:\RPGfactory\docs\handoff\RF-05b-coder-raport.md, D:\RPGfactory\docs\handoff\RF-05b-tester.md, D:\RPGfactory\test\layout.test.mjs, D:\RPGfactory\test\world.test.mjs, D:\RPGfactory\test\server-world.test.mjs, D:\RPGfactory\docs\handoff\RF-05b-tester-raport.md, D:\RPGfactory\public\world.js, D:\RPGfactory\public\index.html, D:\RPGfactory\public\hud.css, D:\RPGfactory\docs\handoff\RF-05b-b-coder.md, D:\RPGfactory\docs\handoff\RF-05b-b-coder-raport.md

---

## Decizia planner-ului

Accept RF-05b (inclusiv corecția RF-05b-b). Rulare finală: **536/536 teste, 0 eșecuri** (497 RF-04 + 17 RF-05a + 22 RF-05b), confirmată de două ori (înainte și după corecție).

Cel de-al doilea bug real găsit prin verificare vizuală efectivă în browser (după cel de la RF-04) — de data asta o coliziune de scop global între două script-uri clasice, un defect pe care niciun test automat din `node:test` nu l-ar fi putut prinde vreodată (interacțiunea există doar când ambele fișiere se încarcă împreună, într-un document real). Harta era complet neagră, tăcut, fără nicio eroare vizibilă utilizatorului — exact genul de eșec silențios pe care regula proiectului de verificare vizuală reală există ca să-l prindă. Corectat printr-un IIFE minimal, reverificat vizual pe o instanță izolată nouă: hărțile se desenează corect, hexagoane distincte per proiect, sloturi marcate, nume lizibile.

Contradicția mea din brief (presupunerea greșită că `hud.css` are deja teme light/dark) a fost semnalată corect de coder și nu a produs cod defect — acceptată ca notă, nu ca motiv de corecție.

Nota cosmetică despre suprapunerea etichetelor la zone foarte apropiate e acceptată explicit ca backlog de estetică fină, conform `spec.md` §7 ("Estetica fină este backlog").

**RF-05b închis.** Harta există și se vede: zonele per proiect, colorate, cu memorie persistentă în SQLite (supraviețuiește restart-ului serverului). Următorul pas e RF-05c — personajele, animația și mărimea după consum.

**Nu fac commit/push fără aprobare explicită** — aștept confirmarea lui Lucian.
