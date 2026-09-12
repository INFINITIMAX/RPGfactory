# T-06 — Teste pentru persistență + merge

## Sarcină

Scrie teste pentru `state.js` (server) și `public/merge-state.js` (funcțiile de merge portate din bot-crossing). Vezi `docs/handoff/T-06-coder.md` și `docs/handoff/T-06-coder-raport.md` pentru context complet.

Planner a verificat deja manual, cu `curl`, cele 4 cazuri de bază (GET stare goală, prima scriere fără `baseUpdatedAt`, a doua scriere cu `baseUpdatedAt` corect, conflict 409 cu `baseUpdatedAt` greșit + starea de pe disc întoarsă neschimbată) — toate corecte. Testele tale trebuie să acopere asta programatic, plus `merge-state.js`, care nu a fost testat deloc încă.

## Partea 1 — `state.js` (server, HTTP real, similar cu `test/api-open.test.mjs` din T-03)

Pornește serverul real pe un port dedicat (nu 5311), izolează `data/state.json` — **important**: `state.js` scrie la o cale fixă relativă la proiect; ca să nu contaminezi/nu depinzi de fișierul real al lui Lucian, verifică dacă `state.js` permite un folder de date configurabil (variabilă de mediu, parametru) — dacă NU permite, nu modifica `state.js` (nu e rolul tău), ci izolează testul prin: rulare într-un folder de lucru temporar copiat, SAU curăță/salvează-restaurează `data/state.json` cu grijă în `before`/`after` (backup înainte, restaurare după, chiar dacă fișierul nu exista inițial — șterge-l la final în acel caz). Documentează clar ce ai ales și de ce.

Cazuri de acoperit:
1. `GET /api/state` pe stare inexistentă → `{version:1, archived:[], archivedAt:{}, updatedAt:0}`.
2. `PUT /api/state` fără `baseUpdatedAt` → 200, scrie, `updatedAt` > 0.
3. `PUT /api/state` cu `baseUpdatedAt` corect (valoarea din scrierea anterioară) → 200, se aplică.
4. `PUT /api/state` cu `baseUpdatedAt` greșit → 409, body = starea curentă de pe disc, **neschimbată** (verifică explicit că starea de pe disc n-a fost suprascrisă de payload-ul respins).
5. Fișierul scris pe disc e JSON valid, indentat, cu exact câmpurile așteptate (nu presupune doar din răspunsul HTTP — citește chiar fișierul).
6. Scriere atomică: nu poți testa ușor o cursă reală, dar poți verifica cel puțin că fișierele temporare (`*.tmp`) nu rămân pe disc după o scriere reușită (curăță-se singure prin `rename`).

## Partea 2 — `public/merge-state.js` (pur, fără server, `node --test` direct pe fișier)

`merge-state.js` e script clasic (fără `module.exports`) — încarcă-l cu `node:vm` sau citește-l și evaluează-l într-un context minimal ca să obții `mergeSet`/`mergeMap`/`mergeState` ca funcții testabile (la fel cum s-a procedat la T-01/T-04 pentru `app.js`). Nu modifica fișierul ca să adaugi `module.exports` — păstrează-l consecvent cu restul frontend-ului.

Cazuri de acoperit pentru `mergeSet` (bazat pe exemplul din brief, `(remote ∪ (local\base)) \ (base\local)`):
1. O adăugare locală (nu în `base`, e în `local`) supraviețuiește chiar dacă `remote` nu o are.
2. O ștergere locală (era în `base`, nu mai e în `local`) elimină id-ul din rezultat, chiar dacă `remote` încă îl are (asta e cazul critic — un un-archive care nu trebuie să reînvie).
3. Un id adăugat de "cealaltă parte" (în `remote`, nu în `base`, nu în `local`) supraviețuiește.
4. Ordinea rezultatului urmează `remote` + adăugările locale la coadă (verifică asta explicit, nu doar conținutul ca set).

Cazuri pentru `mergeMap`:
1. O cheie schimbată local (diferă de `base`) câștigă peste `remote`.
2. O cheie neschimbată local (egală cu `base`) rămâne cea din `remote` (nu cea din `local`, chiar dacă `local` o are — testează cu valori diferite între `local` vechi și `remote` ca să prinzi o eventuală inversare de prioritate).
3. O cheie ștearsă local (era în `base`, nu mai e în `local`) dispare din rezultat, chiar dacă `remote` o are.

Cazuri pentru `mergeState`: compune corect `mergeSet` pe `archived` și `mergeMap` pe `archivedAt`, `version` rămâne `1`.

## Ce NU e un test valid

- Nu testa scriere atomică simulând o întrerupere reală de proces (imposibil de reprodus determinist) — testează doar comportamentul observabil (fișier valid, fără resturi `.tmp`).
- Nu scrie teste care doar verifică "nu aruncă" pentru merge — valorile returnate contează de fiecare dată.

## Constrângeri dure

- Nu modifica `state.js`, `server.js`, `public/merge-state.js`, `public/app.js`.
- Nu rula comenzi — planner rulează.
- `node --test`, fără dependențe noi, port dedicat pentru testele HTTP.

## Predare

`test/state.test.mjs` + `test/merge-state.test.mjs` (fișiere noi) + `docs/handoff/T-06-tester-raport.md`: cum ai izolat `data/state.json` de fișierul real, ce ai testat, ce NU (motivat), comanda exactă de rulare a întregii suite.
