# RF-05a — brief tester: teste pentru `hex-layout.js`

**Data:** 15-09-2026, EET.
**Rol:** tester. **Nu rulezi comenzi. Nu modifici `hex-layout.js`.**
**Lot:** RF-05a — algoritm pur de layout hexagonal cu memorie.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Ce testezi

`hex-layout.js` (rădăcina proiectului), exportă `allocateCells(projects, previous)` și `hexDistance(a, b)`. Citește tot fișierul înainte de a scrie teste — comentariile explică raționamentul (de ce rădăcina nu se pierde, de ce pool-ul acoperă și celulele "amintite" de proiecte inactive, cum funcționează fallback-ul la re-layout complet).

Citește și raportul coder-ului, `docs/handoff/RF-05a-coder-raport.md` — secțiunea „Riscuri pentru tester" de acolo listează exact ce trebuie acoperit, inclusiv avertismentul despre ordinea de iterare la egalitate de scor în `growBlob` (nu asuma o formă exactă a blob-ului — verifică proprietăți: contiguitate, mărime, rădăcină păstrată).

Fișier nou: `test/hex-layout.test.mjs`, folosind `node:test` + `node:assert`, ca restul suitei (`test/profiles.test.mjs`, `test/runs.test.mjs` etc. — verifică-le pentru stilul exact de import/assert folosit în proiect).

## 2. Ce trebuie acoperit (obligatoriu)

1. **Un singur proiect nou, fără istoric** — primește o celulă rădăcină; dacă `size` cere mai multe celule, restul sunt vecine ale rădăcinii (contigue — verifică cu `hexDistance` sau prin adiacență directă, nu doar `.length`).
2. **Creștere**: un proiect care avea N celule și acum are nevoie de N+k — păstrează EXACT cele N celule vechi (verifică egalitate de set, nu doar `.length`) și adaugă k noi, toate contigue cu ansamblul.
3. **Micșorare**: un proiect care avea N celule și acum are nevoie de N-k — păstrează rădăcina (`cells[0]` din `previous`) și doar un subset al celulelor vechi; celulele eliminate sunt cele adăugate cel mai recent (ultimele din listă), nu oricare.
4. **Rădăcina veche ocupată de altcineva** (simulează manual un `previous` inconsistent unde rădăcina unui proiect coincide cu o celulă deja luată de alt proiect în noul apel) — proiectul e re-așezat de la zero (nou seed), nu crapă și nu produce suprapunere.
5. **Proiect dispărut** din lista curentă `projects` dar prezent în `previous` — pur și simplu nu apare în rezultat; celulele lui devin implicit disponibile pentru alții (verifică indirect: un proiect nou poate ajunge să le ocupe).
6. **Conectivitate globală**: layout cu mai multe proiecte trebuie să fie UN teritoriu conex (`allocateCells` face fallback automat la re-layout complet dacă memoria ar produce insule) — construiește un scenariu cu `previous` artificial care ar produce zone izolate (ex. proiecte mari cu celule îndepărtate, dispărute parțial) și verifică fie conectivitatea rezultatului final, fie — dacă nu poți construi ușor insule direct — cel puțin că rezultatul e mereu conex pentru orice combinație rezonabilă testată (proprietate generală, nu un singur caz fericit).
7. **Pool epuizat / multe proiecte mari**: mai multe proiecte decât poate ține pool-ul în limita de inele — proiectele care nu mai încap primesc `[]` fără să arunce excepție.
8. **Proiect nou, ordinea contează doar între proiecții noi**: două proiecte fără istoric, unul cu `size` mai mare listat primul — cel mai mare (primul în listă) ajunge mai aproape de centru (`hexDistance` la origine mai mic) decât al doilea. Verifică că un proiect cu istoric (deja plasat) NU e deranjat de ordinea în care apare `projects` — vezi §2 din raportul coder-ului.
9. **`hexDistance`** — simetrie (`hexDistance(a,b) === hexDistance(b,a)`), distanța la sine e 0, vecini direcți (fiecare din cele 6 direcții axiale) au distanța 1, un punct opus pe aceeași axă are distanța corectă cunoscută.
10. **`previous` gol/lipsă** (primul apel din viața aplicației) — nu aruncă, produce un layout valid de la zero.
11. **`cellsNeeded`** (indirect, prin `allocateCells`) — un proiect cu `size` foarte mic (0 sau 1) primește tot 1 celulă; un proiect cu `size` uriaș nu depășește plafonul intern (`MAX_CELLS` — nu presupune valoarea exactă 9, verifică doar că numărul de celule nu crește nelimitat cu `size`, ca să nu lege testul de o constantă internă neexportată).

## 3. Ce NU testezi

- Nu testezi randare, Canvas, conversie hex→pixeli — nu există în acest lot.
- Nu testezi citire din baza de date/`agent_profiles` — modulul nu face asta.
- Nu presupune forma EXACTĂ a unui blob în cazuri de egalitate de scor (vezi risc semnalat de coder) — verifică proprietăți (contiguitate, mărime, apartenența rădăcinii), nu o listă fixă de celule așteptate, decât acolo unde comportamentul e determinist fără ambiguitate (ex. un singur vecin liber posibil).

## 4. Reguli

- Fiecare test verifică ceva ce chiar ar pica dacă implementarea ar fi greșită — nu scrie teste care trec întotdeauna, indiferent de cod (reviewer-ul verifică explicit asta).
- Nu rulezi comenzi (nu poți confirma tu că testele trec — planner-ul rulează `npm test`).
- Nu modifici `hex-layout.js`. Dacă găsești o eroare reală în cod, scrie despre ea în raport — nu o repara tu.
- Română, în comentarii și raport.

## 5. Fișiere

**Poți crea:** `test/hex-layout.test.mjs`.

**NU atinge:** `hex-layout.js`, orice alt fișier din `test/`, `public/**`, `server.js`, `profiles.js`, `runs.js`, `db.js`, `migrations/**`, documentele de coordonare.

## 6. Raportul

`docs/handoff/RF-05a-tester-raport.md`:

```
## Ce am testat
Listă scurtă, cazuri acoperite (referă-te la numerotarea din §2 de mai sus).

## Ce NU am testat și de ce
Acoperire lipsă asumată explicit, dacă există.

## Defecte reale găsite în hex-layout.js (dacă vreunul)
Descrie exact ce se întâmplă și ce ar trebui să se întâmple. Dacă niciunul, scrie „niciunul".

## Decizii pe care le-am luat singur

## Contradicții găsite în brief
Dacă niciuna, scrie „niciuna".
```
