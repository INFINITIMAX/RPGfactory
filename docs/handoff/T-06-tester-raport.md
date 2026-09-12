# T-06 — Raport tester

## Fișiere create

- `D:\RPGfactory\test\state.test.mjs` — teste HTTP pe serverul real (`GET`/`PUT /api/state`).
- `D:\RPGfactory\test\merge-state.test.mjs` — teste pure pe `public/merge-state.js` (`mergeSet`/`mergeMap`/`mergeState`), încărcat cu `node:vm`.

Nu am modificat `state.js`, `server.js`, `public/merge-state.js`, `public/app.js`.

## Izolarea `data/state.json`

Am citit codul `state.js`: `STATE_FILE = path.join(__dirname, 'data', 'state.json')` — cale fixă, fără variabilă de mediu sau parametru pentru folderul de date. Nu am adăugat una (nu e rolul tester-ului, brief-ul interzice explicit).

Ce am ales: în `before()`, citesc fișierul real cu `fs.readFileSync` (dacă există, îl păstrez în memorie și marchez `backupExisted = true`), apoi îl șterg cu `fs.rmSync` (best-effort, ignor eroarea dacă lipsea). Testele pornesc deci mereu de la stare goală garantată. În `after()`, șterg orice a scris suita de teste, apoi restaurez byte-cu-byte backup-ul dacă exista inițial, sau las fișierul șters dacă nu exista. Restaurarea/curățarea rulează după `capturedServer.close(...)`, ca să nu existe o scriere concurentă în curs când ating fișierul.

Consecință: testele din `state.test.mjs` depind unele de altele (ex. `firstUpdatedAt` din testul 2 devine `baseUpdatedAt` pentru testul 4) — rulează secvențial în același fișier (comportamentul implicit `node --test` fără `concurrency: true`), documentat explicit în comentariul din fișier. Nu am folosit `describe`/`concurrency` care ar rupe ordinea.

Port dedicat: `5392` — diferit de `5311` (Lucian) și de `5391` (folosit deja de `test/api-open.test.mjs`), ca să nu existe conflict la rularea suitei complete.

## `test/state.test.mjs` — ce verifică fiecare test

1. **GET pe stare inexistentă** → `200` + `{version:1, archived:[], archivedAt:{}, updatedAt:0}`. Cade dacă `readState()`/`emptyState()` schimbă forma sau valorile implicite.
2. **PUT fără `baseUpdatedAt`** → `200`, `archived`/`archivedAt` aplicate, `updatedAt > 0`. Cade dacă prima scriere e refuzată sau dacă serverul nu ștampilează `updatedAt`.
3. **Fișierul de pe disc e JSON valid, indentat cu 2 spații, cu exact 4 câmpuri** (`version`,`archived`,`archivedAt`,`updatedAt`, nimic în plus/lipsă), și conținutul coincide cu ce a răspuns HTTP-ul. Cade dacă `writeState` schimbă schema, elimină indentarea, sau dacă răspunsul HTTP nu reflectă fișierul real.
4. **PUT cu `baseUpdatedAt` corect** (valoarea din pasul 2) → `200`, se aplică (`archived` devine `['s1','s2']`). Cade dacă verificarea optimistă respinge greșit o bază validă.
5. **PUT cu `baseUpdatedAt` greșit (`1`)** → `409`, body = starea curentă de pe disc (**nu** payload-ul respins), și fișierul de pe disc rămâne **byte-cu-byte neschimbat** (comparație explicită `before`/`after`, plus verificare că string-ul payload-ului respins nu apare deloc pe disc). Acesta e cazul cel mai important din brief — cade dacă serverul scrie payload-ul respins înainte/după verificare, sau dacă întoarce altceva decât starea de pe disc la 409.
6. **`baseUpdatedAt = 0` explicit** → tratat ca lipsă, scrie necondiționat (`200`, nu `409`). Documentează un comportament observabil (nu doar dedus) al implementării actuale (`if (base && ...)`, unde `0` e falsy) — nu era cerut explicit în brief, dar e o ramură reală a codului netestată altfel; cade dacă cineva schimbă verificarea la `base !== undefined` fără să actualizeze și logica de "prima scriere".
7. **Fără fișiere `*.tmp` rămase pe disc** după toate scrierile reușite de mai sus. Cade dacă `writeState` nu face `rename` corect sau lasă resturi la eroare.
8. **PUT cu body JSON invalid** → `400` + `{ok:false, error:'invalid JSON'}`, disk neschimbat. Cade dacă parsing-ul JSON eșuează silențios spre o scriere sau spre alt cod de stare.

## `test/merge-state.test.mjs` — ce verifică fiecare test

`mergeSet`:
1. adăugare locală supraviețuiește chiar dacă `remote` n-o are — cade dacă id-urile doar din `local\base` sunt ignorate.
2. **ștergere locală elimină id-ul chiar dacă `remote` îl are** (cazul critic din brief: un-archive nu trebuie să reînvie) — cade dacă `removed` (`base\local`) nu e aplicat peste `remote`.
3. id nou din `remote` (necunoscut de `base`/`local`) supraviețuiește — cade dacă merge-ul ignoră aportul celeilalte părți.
4. **ordinea rezultatului**: `remote` întâi, apoi adăugările locale la coadă, cu valori distincte de ordinea alfabetică (`r2`,`r1` înainte de `local1`,`local2`) ca să prindă o eventuală resortare — cade dacă implementarea sortează sau inversează ordinea surselor.
5. `undefined`/`undefined`/`undefined` → `[]`, fără excepție.

`mergeMap`:
1. cheie schimbată local câștigă peste `remote` — cade dacă prioritatea e inversată.
2. **cheie neschimbată local rămâne cea din `remote`, nu din `local`** (testat cu valori diferite `local` vechi vs `remote` nou, exact cum cere brief-ul, ca să prindă o inversare de prioritate) — cade dacă implementarea preferă greșit `local` pentru chei neatinse.
3. cheie ștearsă local dispare din rezultat chiar dacă `remote` o are — cade dacă `delete` pe `baseMap\localMap` lipsește.
4. cheie nouă adăugată local (nu în `base`) se păstrează — caz suplimentar de acoperire, nu explicit cerut, dar e o ramură reală a codului (`k not in baseMap` → păstrează `local`).

`mergeState`:
1. compune corect `mergeSet` pe `archived` + `mergeMap` pe `archivedAt`, `version` rămâne `1` — folosește un scenariu cu ștergere locală + adăugare remote simultan, ca să confirme că cele două funcții sunt cablate corect împreună, nu doar apelate izolat.
2. argumente complet lipsă → stare goală coerentă, fără excepție.

## Ce NU am acoperit (și de ce)

- **Scriere atomică sub întrerupere reală de proces** — imposibil de reprodus determinist, explicit interzis de brief. Am acoperit doar comportamentul observabil (fișier JSON valid + fără `*.tmp` rămase).
- **Coada serializată (`serialise`/`writeQueue`) sub concurență reală** (două `PUT` simultane cu răspuns garantat de ordine) — nu am scris un test de rasă explicit (ex. două `fetch` PUT paralele verificând că nu se pierde nicio scriere), pentru că rezultatul depinde de timing de rețea/event-loop și ar fi fragil (flaky) fără control determinist asupra ordinii de sosire. L-aș semnala planner-ului ca discuție separată dacă vrea acoperire de concurență reală — s-ar putea face determinist doar introducând un hook de testare în `state.js`, ceea ce ar însemna să ating codul de producție (nu am voie).
- **`sameValue`/egalitate profundă în `mergeMap`** — nu se aplică la noi (coder-ul a documentat explicit simplificarea la `===` pentru valori numerice); nu am testat obiecte/array-uri ca valori în `archivedAt`, pentru că schema reală nu le produce niciodată.
- **Integrarea `merge-state.js` în UI** (buton, apel către `mergeState` la 409) — nu există încă (T-07), nimic de testat.

## Suspiciuni de bug

Niciuna găsită. Comportamentul `baseUpdatedAt = 0` tratat ca "fără verificare" e o decizie deliberată documentată de coder (motiv: prima scriere), acoperită explicit de un test (nu e un bug, dar l-am blocat cu un test ca să nu se schimbe pe tăcute).

## Comanda exactă pentru planner

```powershell
cd D:\RPGfactory
node --test test/
```

(rulează toată suita: `rank`, `api-open`, `app`, `status`, plus cele două fișiere noi `state.test.mjs` și `merge-state.test.mjs`). Pentru rulare izolată doar a fișierelor noi:

```powershell
node --test test/state.test.mjs test/merge-state.test.mjs
```
