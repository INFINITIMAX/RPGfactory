# T-09 — Teste pentru câmpul `plots` (persistență + merge + defaults)

## Sarcină

Extinde `test/state.test.mjs` și `test/merge-state.test.mjs` (fișiere existente, nu noi) cu teste pentru câmpul nou `plots`, adăugat la T-09 + T-09b. Vezi `docs/handoff/T-09-coder.md`, `docs/handoff/T-09-coder-raport.md`, `docs/handoff/T-09b-coder.md`, `docs/handoff/T-09b-coder-raport.md`.

Notă: planner a actualizat deja 3 asserții existente (liste de câmpuri/stări goale) care nu mai includeau `plots` — toate 91 de teste trec acum. Adaugă teste NOI, nu doar re-verifica ce a fost deja sincronizat.

## Cazuri de acoperit

### `state.js` (în `test/state.test.mjs`)

1. **`GET /api/state` include `plots: {}`** implicit pe o stare nouă (poate fi deja acoperit de testul actualizat de planner — verifică, nu duplica).
2. **`PUT /api/state` cu `plots` populat** (ex. `{"proiect-a":[{"x":0,"y":0}]}`) → se salvează corect, `GET` ulterior îl întoarce identic.
3. **Defaults la citirea unei stări vechi, incomplete** (cazul T-09b): scrie manual pe disc (în zona izolată de test, cu backup/restore ca la testele existente) un JSON valid dar FĂRĂ `plots` (simulează un fișier scris înainte de T-09) → `GET /api/state` trebuie să întoarcă `plots: {}` completat, nu `undefined`/lipsă, și restul câmpurilor (`archived`, `archivedAt`) trebuie păstrate neschimbate din fișierul vechi.
4. **Defaults nu suprascriu valori existente**: un fișier vechi CU `plots` populat trebuie întors exact așa cum e, nu resetat la `{}`.

### `merge-state.js` (în `test/merge-state.test.mjs`)

5. **`sameValue`**: testeaz-o direct (dacă e expusă/extrasă din context la fel ca `mergeSet`/`mergeMap`) — cazuri: două numere egale/diferite, două array-uri de obiecte `{x,y}` identice ca conținut dar referințe diferite (trebuie `true`), array-uri cu conținut diferit (trebuie `false`), un obiect vs `undefined`.
6. **`mergeMap` pe `plots` — cazul critic** (motivul întregii schimbări): `base` și `local` au aceeași zonă (`[{x:0,y:0}]`) dar ca obiecte/array-uri DIFERITE ca referință (recalculate, nu aceleași instanțe) → trebuie tratată ca "neschimbată" (`sameValue` întoarce `true`), deci rezultatul păstrează varianta din `remote`, NU o consideră "schimbare locală care trebuie să câștige". Un test care ar folosi `===` în loc de `sameValue` ar eșua exact aici — scrie testul ca să prindă regresia dacă cineva reintroduce `===`.
7. **`mergeMap` pe `plots` — zonă chiar schimbată local** (conținut diferit, nu doar referință) → trebuie să câștige varianta locală, la fel ca la `archivedAt`.
8. **`mergeState` compune `plots` corect** — proiect adăugat local, proiect șters local, proiect neschimbat (din exemplele de mai sus), toate într-un singur apel `mergeState(base, local, remote)`.
9. **Verifică din nou (fără regresie) că `archivedAt` cu `sameValue`** se comportă identic cu `===` pentru valori numerice — un test rapid care confirmă concluzia din raportul coder-ului, nu doar o presupune.

## Ce NU e un test valid

- Nu testa `plots` cu structuri de date pe care `zones.js`/`allocateCells` nu le-ar produce vreodată (ex. chei non-string) — testează cu forma reală: `{ [proiectId]: [{x,y}, ...] }`.
- Nu slăbi testele existente pentru `archived`/`archivedAt` ca să faci loc pentru `plots` — extinde, nu înlocui.

## Constrângeri dure

- Nu modifica `state.js`, `public/merge-state.js`, `public/zones.js`, `public/app.js`.
- Nu rula comenzi — planner rulează.
- `node --test`, fără dependențe noi.

## Predare

Modificări în `test/state.test.mjs` + `test/merge-state.test.mjs` (extindere) + `docs/handoff/T-09-tester-raport.md`: ce ai testat, ce NU (motivat), comanda exactă de rulare a întregii suite.
