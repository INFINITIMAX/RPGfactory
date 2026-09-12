# T-06 — Raport reviewer

## ACCEPT

**Cod coder (state.js, public/merge-state.js, server.js, .gitignore)**

- Fidel brief-ului: schema redusă corect la `version/archived/archivedAt/updatedAt`, fără `plots/seen/hiddenProjects/viewedAt/settings` — nimic în plus.
- Scriere atomică (tmp unic per pid+seq, rename), coadă serializată (`writeQueue.then(fn,fn)`), concurență optimistă cu `!==` (nu `<`) — reproduce exact mecanica citată din bot-crossing, cu motivarea corectă (fișier ce se poate întoarce în timp dintr-un backup).
- `baseUpdatedAt` lipsă/0 tratat ca "fără verificare" — conform brief.
- `merge-state.js` neintegrat încă în `index.html`, fără `module.exports` — corect, respectă scopul (T-07 separat).
- Rutele `/api/state` sunt plasate înainte de fallback-ul static, nu ating `/api/agents`/`/api/open`/serverul de fișiere.
- `.gitignore`: o singură linie `data/`, adăugată fără a atinge blocul `assets/`.
- Nu au fost atinse `rank.js`, `status.js`, `public/app.js`, `.env*`, `README.md`, `assets/` — verificat.

**Simplificările conștiente** — toate justificate, nu ascund abateri:
- `sameValue → ===`: corect, `archivedAt` are doar numere ca valori, nu structuri imbricate.
- Fără `migrate()`: corect, nu există stare anterioară de migrat.
- CommonJS în loc de `.mjs`: corect, tot restul proiectului (`server.js`, `rank.js`, `status.js`) e deja CommonJS; brief-ul cita `.mjs`-ul lor doar ca sursă de referință pentru mecanică, nu ca format de reprodus literal.
- Scriere sincronă: corect, restul serverului e deja sincron, brief-ul permitea explicit varianta sincronă.

**Corecția planner-ului la bug-ul cross-realm** — e reparație corectă de infrastructură de test, nu ascunde o problemă reală. `public/merge-state.js` întoarce array-uri/obiecte simple (`[]`, `{...}`, `new Set` doar intern) fără nicio metodă/prototip custom relevant pentru comportament; problema era pur `assert.deepEqual` cerând reference-equality de prototip între realm-uri diferite (VM context vs. main). Round-trip-ul JSON.parse(JSON.stringify(...)) nu schimbă valorile testate (funcțiile deja produc doar date serializabile JSON — array-uri de string-uri și map-uri de numere), doar normalizează containerul. Corect plasată în fișierul de test, nu în `public/merge-state.js`.

**Testele state.test.mjs (8 teste)** — solide, nu redundante:
- Fiecare test verifică efect observabil real, nu doar "nu aruncă". Testul JSON-pe-disc citește fișierul direct (nu doar răspunsul HTTP) și verifică indentarea exactă.
- Testul 409 e cel mai important și e făcut corect: compară fișierul de pe disc byte-cu-byte înainte/după, și verifică explicit că string-ul payload-ului respins nu apare pe disc — exact scenariul cerut de planner.
- Testul `baseUpdatedAt=0` documentează o ramură reală de cod, nu redundant cu cel "fără baseUpdatedAt" (unul testează `undefined`, altul `0` explicit — ambele falsy dar căi diferite de intrare).
- Testul tmp-uri reziduale și testul JSON invalid sunt cazuri reale, nu triviale.
- Fiecare test ar cădea la o schimbare de comportament concretă (verificat: nu există niciun test cu assert slab tip `toBeDefined`).

**Testele merge-state.test.mjs (12 teste)** — solide, acoperă exact cazurile critice cerute:
- Cazul critic "un-archive nu trebuie să reînvie din remote" e testat explicit și corect.
- Testul de ordine folosește valori special alese (`r2,r1` vs `local1,local2`) ca să nu se confunde cu o resortare alfabetică accidentală — bine gândit.
- Testul de prioritate `mergeMap` folosește valori diferite între `local` vechi și `remote` nou tocmai ca să prindă o inversare de prioritate, cum cerea brief-ul.
- Niciun test redundant identificat; fiecare verifică o ramură de cod distinctă (adăugare, ștergere, valoare nouă din remote, undefined-safety).

**Izolarea testelor HTTP de `data/state.json` real** — sigură:
- Backup complet în memorie (`fs.readFileSync` ca Buffer) în `before`, restaurare byte-cu-byte în `after`, inclusiv cazul "nu exista inițial → rămâne șters".
- Restaurarea rulează după `capturedServer.close()`, deci nu există scriere concurentă în timpul restaurării.
- Singurul risc real: dacă procesul de test crapă brutal (SIGKILL) la mijloc, hook-ul `after` nu rulează și backup-ul din memorie se pierde — dar acesta e un risc inerent oricărei strategii backup-in-memory fără fișier de siguranță pe disc, e menționat implicit prin faptul că testele nu au altă opțiune (cale fixă, nu au voie să modifice `state.js`). Acceptabil ca risc rezidual, nu e un defect de proiectare a testului.

Nu am găsit cod inutil, teste care trec mereu, sau abateri nejustificate de la brief. Toate fișierele atinse corespund exact listei permise.

**Fișiere verificate:** `D:\RPGfactory\docs\handoff\T-06-coder.md`, `D:\RPGfactory\state.js`, `D:\RPGfactory\public\merge-state.js`, `D:\RPGfactory\server.js` (liniile 95-124 + linia 8), `D:\RPGfactory\docs\handoff\T-06-coder-raport.md`, `D:\RPGfactory\docs\handoff\T-06-tester.md`, `D:\RPGfactory\test\state.test.mjs`, `D:\RPGfactory\test\merge-state.test.mjs`, `D:\RPGfactory\docs\handoff\T-06-tester-raport.md`, `D:\RPGfactory\.gitignore`.

---

## Decizia planner-ului

Accept ambele livrări. Toate 68 de teste trec (`node --test` pe toate fișierele din `test/`). Verificat manual, live, toate cele 4 cazuri HTTP de bază (GET gol, PUT simplu, PUT cu bază corectă, conflict 409 cu fișierul de pe disc neschimbat), plus `data/` corect ignorat de git.

Riscul rezidual semnalat de reviewer (backup-in-memory pierdut la un crash brutal al procesului de test) e acceptat ca atare — infrastructura de test nu are voie să modifice `state.js` pentru o cale configurabilă, iar riscul practic e minim (testele rulează local, controlat).

T-06 (backend) e închis. Rămâne T-07: integrarea în frontend (buton de arhivare, filtrare agenți arhivați, orchestrarea merge-ului la 409).
