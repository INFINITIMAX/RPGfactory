# RF-05b — brief tester: teste pentru `layout.js`, `world.js`, `GET /api/world`

**Data:** 15-09-2026, EET.
**Rol:** tester. **Nu rulezi comenzi. Nu modifici `layout.js`/`world.js`/`server.js`/`public/world.js`.**
**Lot:** RF-05b — persistență Layout + grupare pe proiect + endpoint + randare statică Canvas 2D.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Ce testezi

Trei bucăți de cod cu bază de date/logică (testabile prin `node:test`), plus o notă despre ce NU se poate testa automat:

1. **`layout.js`** — `createLayoutStore({dbPath, migrationsDir, now})`: `getLayout()`, `saveLayout(map)`, `close()`. Testează ca `test/profiles.test.mjs`/`test/runs.test.mjs` (bază de date temporară per test, curățată la final — verifică exact acel pattern de setup/teardown, nu inventa altul).
2. **`world.js`** — funcții pure `groupProjects(profiles)` și `pickAccent(project)`. Fără bază de date — teste directe pe date sintetice, ca `test/hex-layout.test.mjs` (RF-05a).
3. **`GET /api/world`** — integrare prin `server.js` (`createServer`/`startServer`, cerere HTTP reală către rută, ca `test/server-profiles.test.mjs`/`test/server-runs.test.mjs` — verifică acel pattern exact).

Citește și `docs/handoff/RF-05b-coder-raport.md` — secțiunea „Riscuri pentru tester" listează exact ce trebuie acoperit, inclusiv un caz specific semnalat de coder: `last_project` gol string `''` trebuie exclus la fel ca `null`.

## 2. Ce trebuie acoperit (obligatoriu)

### 2.1 `layout.js`

1. `getLayout()` pe bază de date proaspătă (fără migrații rulate încă/tabelă goală) → `Map` goală, fără excepție.
2. `saveLayout(map)` cu proiecte noi → `getLayout()` ulterior întoarce exact aceleași chei/celule (round-trip complet, inclusiv ordinea celulelor în array, care contează — index 0 e rădăcina).
3. `saveLayout(map)` apelat a doua oară cu un proiect care a DISPĂRUT din `map` → acel proiect nu mai apare la `getLayout()` (rândul chiar șters din tabelă, nu doar ignorat la citire — poți verifica și cu o interogare SQL directă dacă vrei dovadă suplimentară, dar comportamentul public prin `getLayout()` e suficient).
4. `saveLayout(map)` apelat de două ori pe ACELAȘI proiect → `revision` crește (verifică direct din tabelă cu o interogare SQL simplă, `layout.js` nu expune `revision` prin `getLayout()` — dacă ai nevoie, interoghează tabela direct în test, e acceptabil pentru verificare internă).
5. Fără efecte secundare la `createLayoutStore(options)` — construcția singură, fără nicio metodă apelată, NU trebuie să creeze fișierul bazei de date pe disc (lazy, ca `profiles.js`/`runs.js` — verifică cu același tipar de test folosit acolo pentru aceeași proprietate).
6. `close()` — sigur de apelat chiar dacă nicio metodă n-a fost chemată încă (n-a deschis niciodată baza).

### 2.2 `world.js`

7. `groupProjects`: profiluri cu `last_project` = `null` → excluse din rezultat.
8. `groupProjects`: profiluri cu `last_project` = `''` (string gol) → excluse la fel ca `null` (risc semnalat explicit de coder — verifică-l separat de cazul `null`).
9. `groupProjects`: două proiecte cu același număr de profiluri → ordonate alfabetic după `id` (determinist).
10. `groupProjects`: proiect cu mai multe profiluri decât altul → apare primul (mărime descrescătoare).
11. `pickAccent`: același `project` → aceeași culoare, la apeluri repetate.
12. `pickAccent`: valoarea întoarsă e mereu unul din șirurile din paleta internă (nu presupune care anume, doar apartenența la mulțimea de culori valide — poți obține paleta indirect chemând `pickAccent` cu multe proiecte diferite și colectând valorile distincte, sau verifică doar formatul `^#[0-9a-f]{6}$` dacă nu vrei să depinzi de paleta exactă).

### 2.3 `GET /api/world` (integrare, prin `createServer`)

13. Server pornit fără niciun profil în bază → `GET /api/world` → `200`, `{ zones: [] }`.
14. Câteva profiluri cu `last_project` populat (creează-le prin `profilesStore`/API-ul existent de profiluri, ca în `test/server-profiles.test.mjs`) → `GET /api/world` → fiecare proiect distinct apare o singură dată în `zones`, fiecare zonă are `project`, `cells` (array nevid) și `accent` (șir).
15. **Persistență reală între cereri**: două cereri succesive `GET /api/world`, fără nicio schimbare de profiluri între ele → a doua cerere întoarce EXACT aceleași celule ca prima pentru fiecare proiect (dovadă că a doua pornește de la layout-ul salvat de prima, nu recalculează de la zero — verifică asta explicit, nu doar că răspunde 200).
16. Adaugă un profil nou cu un `last_project` nou, între două cereri → zona proiectelor deja existente NU se schimbă (celulele lor rămân identice) — dovadă indirectă a memoriei (RF-05a) folosită corect prin `layoutStore`.
17. Metodă greșită (`POST`/`DELETE` pe `/api/world`) → `405`, fără mutație (verifică că nu creează un rând nou).
18. Validare Origin — verifică (dacă restul suitei server o face sistematic pentru alte rute `/api/*`) că `/api/world` respectă același mecanism, printr-un test simetric cu unul existent pentru `/api/profiles` sau `/api/runs`.

## 3. Ce NU testezi (și de ce)

- **Randarea din `public/world.js`** (Canvas, desen, poziții de pixeli) — nu poți rula un browser real din acest rol. Nu scrie teste DOM/mock pentru geometria de desen (asta ar fi teatru — canvas-ul mockuit nu dovedește nimic despre randarea vizuală reală). Planner-ul face verificare vizuală separat, într-un browser real, pe o instanță izolată — menționează explicit în raport că ai lăsat asta planner-ului.
- **`hex-layout.js`** — deja testat complet la RF-05a, nu retesta `allocateCells` aici.
- **Formă exactă a hexagoanelor pe ecran** — geometrie de desen, nu logică server.

## 4. Reguli

- Fiecare test verifică ceva ce chiar ar pica la o implementare greșită.
- Nu rulezi comenzi. Nu modifici `layout.js`, `world.js`, `server.js`, `public/world.js`. Dacă găsești un defect real, scrie-l în raport — nu-l repara.
- Română, în comentarii și raport.

## 5. Fișiere

**Poți crea:** `test/layout.test.mjs`, `test/world.test.mjs`, `test/server-world.test.mjs` (sau altă organizare rezonabilă — documentează în raport dacă alegi alte nume de fișiere).

**NU atinge:** `layout.js`, `world.js`, `hex-layout.js`, `server.js`, `public/**`, orice alt fișier din `test/`, `profiles.js`, `runs.js`, `db.js`, `migrations/**`, documentele de coordonare.

## 6. Raportul

`docs/handoff/RF-05b-tester-raport.md`:

```
## Ce am testat
Listă scurtă, referă-te la numerotarea din §2.

## Ce NU am testat și de ce
Randarea vizuală — motivează ca în §3.

## Defecte reale găsite (dacă vreunul)
Descrie exact ce se întâmplă și ce ar trebui să se întâmple. Dacă niciunul, scrie „niciunul".

## Decizii pe care le-am luat singur

## Contradicții găsite în brief
Dacă niciuna, scrie „niciuna".
```
