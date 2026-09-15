# RF-05c — brief tester: teste pentru `slot-store.js`, `world.js` (funcțiile noi), `GET /api/world` extins

**Data:** 15-09-2026, EET.
**Rol:** tester. **Nu rulezi comenzi. Nu modifici `slot-store.js`/`world.js`/`server.js`/`public/world.js`.**
**Lot:** RF-05c — posturi persistente + pawn-uri + animație minimă (fără usage real, fără sprite).

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Ce testezi

1. **`world.js`** — funcțiile noi, pure: `profilesByProject(profiles)`, `assignSlots(profileIds, previous, capacity)`. Fără bază de date — teste directe pe date sintetice, ca la `groupProjects`/`pickAccent` (RF-05b).
2. **`slot-store.js`** — `createSlotStore({dbPath, migrationsDir, now})`: `getSlots()`, `saveSlots(project, assignment)`, `close()`. Testează exact ca `test/layout.test.mjs` (RF-05b) — pattern de setup/teardown identic.
3. **`GET /api/world` extins** — verifică acum și câmpul `pawns`, prin `createServer`/`startServer`, ca `test/server-world.test.mjs` (RF-05b) — extinde acel fișier sau creează unul nou, documentează alegerea.

Citește și `docs/handoff/RF-05c-coder-raport.md` — secțiunea „Riscuri pentru tester" listează exact ce trebuie acoperit, inclusiv cazurile de graniță pentru `assignSlots` (capacitate exactă, capacitate 0, profil cu post vechi peste noua capacitate).

**Notă importantă**: NU testezi desenul/animația din `public/world.js` (canvas real) — vezi §3.

## 2. Ce trebuie acoperit (obligatoriu)

### 2.1 `world.js` — `profilesByProject`

1. Profiluri cu `last_project` null/gol → excluse (la fel ca `groupProjects`).
2. Două profiluri cu același `last_project` → apar amândouă în lista acelui proiect, în ordinea din `profiles` de intrare (NU resortate).
3. Profiluri din proiecte diferite → grupuri separate corect, fiecare cu doar id-urile lui.

### 2.2 `world.js` — `assignSlots`

4. Profil nou (fără `previous`) → primește slotul 0 (sau cel mai mic liber) dacă `capacity` permite.
5. Mai multe profiluri noi → primesc sloturi consecutive, în ordinea din `profileIds` (primul din listă ia primul slot liber).
6. **Memorie**: un profil cu post anterior valid (`slotIndex < capacity`) îl păstrează EXACT, chiar dacă alte profiluri se schimbă în jur — verifică cu `previous` conținând acel profil pe un slot oarecare (nu neapărat 0) și confirmă că rezultatul păstrează exact acel `slotIndex`.
7. **Profil dispărut**: un profil din `previous` care NU mai apare în `profileIds` → nu apare deloc în rezultat; slotul lui devine disponibil (verifică indirect: un profil nou poate ajunge să-l ocupe).
8. **Post vechi peste noua capacitate**: un profil cu `previous.get(id) >= capacity` (zona s-a micșorat) → NU păstrează acel slot invalid, e realocat pe un slot valid (`< capacity`) sau, dacă nu mai încape nimeni, exclus din rezultat.
9. **Capacitate exactă**: `profileIds.length === capacity` → toți primesc câte un slot, niciunul exclus.
10. **Overflow**: `profileIds.length > capacity` → exact `capacity` profiluri primesc slot, restul NU apar în rezultat, fără excepție aruncată.
11. **Capacitate zero**: `capacity === 0` → niciun profil nu primește slot, fără excepție.
12. **Fără coliziuni**: pentru orice caz testat mai sus, verifică suplimentar că valorile din `Map`-ul rezultat sunt toate distincte (niciun `slotIndex` dat de două ori) — proprietate generală, nu doar cazuri fericite.

### 2.3 `slot-store.js`

13. `getSlots()` pe bază proaspătă → `Map` goală, fără excepție.
14. `saveSlots(project, assignment)` apoi `getSlots()` → round-trip complet pentru acel proiect (chei/valori exacte).
15. `saveSlots` pentru un proiect cu profiluri care au DISPĂRUT din `assignment` (comparativ cu o scriere anterioară pe același proiect) → acele rânduri sunt șterse, nu doar ignorate.
16. `saveSlots` pe un proiect NU trebuie să atingă rândurile altor proiecte — scrie mai întâi pentru proiectul A, apoi pentru proiectul B, verifică că datele lui A rămân neschimbate.
17. `saveSlots(project, new Map())` (assignment complet gol) → șterge toate rândurile acelui proiect, fără eroare.
18. Fără efecte secundare la `createSlotStore(options)` — construcția singură nu creează fișierul bazei pe disc (ca la `layout.js`).

### 2.4 `GET /api/world` — integrare, câmpul `pawns`

19. Profiluri cu `last_project` populat, fără nicio sesiune (`runs`) asociată → apar în `pawns`, toate cu `working: false`.
20. Un profil cu un run asociat având `lifecycle: 'running'` → pawn-ul lui are `working: true`.
21. Un profil cu un run asociat având `lifecycle: 'queued'` sau `'paused'` → pawn-ul lui are `working: false` (NU `running` — risc semnalat explicit de coder, verifică-l separat pentru fiecare din cele două stări).
22. Fiecare pawn are `profileId`, `name`, `project`, `slotIndex` (număr), `working` (boolean), `sizeFactor` (exact `1` în acest lot — verifică valoarea, nu doar prezența câmpului).
23. **Persistență între cereri**: două cereri succesive `GET /api/world`, fără schimbări → același profil păstrează exact același `slotIndex` la a doua cerere (dovadă de memorie reală, nu recalculare de la zero — la fel ca testul de persistență a celulelor din RF-05b).
24. Profil fără `last_project` → NU apare deloc în `pawns`.
25. `POST`/`DELETE` pe `/api/world` → tot 405 (comportament neschimbat față de RF-05b), fără mutație pe sloturi.

## 3. Ce NU testezi (și de ce)

- **Desenul/animația din `public/world.js`** (canvas, pulsație, `requestAnimationFrame`, `prefers-reduced-motion`) — nu poți rula un browser real din acest rol. Nu scrie teste DOM/mock pentru asta (teatru, nu dovadă). Planner-ul face verificare vizuală separat, într-un browser real, pe o instanță izolată.
- **`hex-layout.js`, `layout.js`** — deja testate la RF-05a/RF-05b.
- **Geometria de desen** (`hexToWorld`, `slotsForCell`, conversia `slotIndex` în poziție de pixeli) — logică de randare, nu de server; oricum identică cu RF-05b, doar consumată de pawn-uri acum.

## 4. Reguli

- Fiecare test verifică ceva ce chiar ar pica la o implementare greșită.
- Nu rulezi comenzi. Nu modifici `world.js`, `slot-store.js`, `server.js`, `public/world.js`. Dacă găsești un defect real, scrie-l în raport — nu-l repara.
- Română, în comentarii și raport.

## 5. Fișiere

**Poți crea:** `test/world.test.mjs` (dacă nu există deja de la RF-05b — dacă există, adaugă la el, nu duplica fișierul), `test/slot-store.test.mjs`, `test/server-world.test.mjs` (extinde-l pe cel existent din RF-05b cu teste noi pentru `pawns`, nu crea un al doilea fișier paralel pentru aceeași rută).

**NU atinge:** `world.js`, `slot-store.js`, `server.js`, `public/**`, `hex-layout.js`, `layout.js`, `profiles.js`, `runs.js`, `db.js`, `migrations/**`, documentele de coordonare.

## 6. Raportul

`docs/handoff/RF-05c-tester-raport.md`:

```
## Ce am testat
Listă scurtă, referă-te la numerotarea din §2.

## Ce NU am testat și de ce
Desenul/animația — motivează ca în §3.

## Defecte reale găsite (dacă vreunul)
Descrie exact ce se întâmplă și ce ar trebui să se întâmple. Dacă niciunul, scrie „niciunul".

## Decizii pe care le-am luat singur

## Contradicții găsite în brief
Dacă niciuna, scrie „niciuna".
```
