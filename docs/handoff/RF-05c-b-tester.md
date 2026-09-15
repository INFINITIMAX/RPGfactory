# RF-05c-b — brief tester: corecție — 6 teste pică (defecte în teste, nu în cod)

**Data:** 15-09-2026, EET.
**Rol:** tester. **Nu rulezi comenzi. Nu modifici `slot-store.js`/`world.js`/`server.js`/`public/world.js`.**
**Lot:** RF-05c-b — corecție de teste, după ce planner-ul a rulat suita și a găsit 6 eșecuri reale.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Ce am găsit, rulând testele

Am rulat `node --test test/world.test.mjs test/slot-store.test.mjs test/server-world.test.mjs`: **47 teste, 41 trec, 6 pică.** Am verificat codul de producție direct (`slot-store.js`, `server.js`) — e corect; problema e în teste.

### 1.1 — 5 eșecuri în `test/slot-store.test.mjs`: `FOREIGN KEY constraint failed`

`migrations/004-sloturi.sql` (RF-05c) declară `profile_id TEXT PRIMARY KEY NOT NULL REFERENCES agent_profiles(id)` — o cheie externă REALĂ către `agent_profiles`, spre deosebire de `hex_layout.project` (RF-05b), care e doar un `TEXT` fără constrângere. `db.js` activează `PRAGMA foreign_keys = ON` — constrângerea CHIAR se aplică.

Testele actuale din `slot-store.test.mjs` folosesc id-uri sintetice (`'profil-a'`, `'x'`, `'y'`, `'p'` etc.) fără să existe rânduri reale în `agent_profiles` — `saveSlots()` eșuează cu `FOREIGN KEY constraint failed`, pentru orice profil care nu există deja în `agent_profiles`.

**Există deja exact modelul de rezolvat asta în proiect** — citește `test/runs.test.mjs`, funcția `makeSharedStores(dir, now)` (liniile ~32-41): `runs.profile_id` are aceeași cheie externă către `agent_profiles`, și testele care au nevoie de un profil real deschid `profilesStore` și `runsStore` PE ACELAȘI FIȘIER pe disc (nu `:memory:` — fiecare `:memory:` e o bază separată, FK-ul nu ar găsi niciodată profilul creat de celălalt store) și creează profilul cu adevărat prin `profilesStore.createProfile(...)` înainte de a-l folosi.

**Ce trebuie să faci**: rescrie testele din `slot-store.test.mjs` care folosesc `profile_id`-uri sintetice, după modelul `makeSharedStores` din `runs.test.mjs`, dar între `profilesStore` și `slotStore` (nu `runsStore`). Pentru fiecare test care apelează `saveSlots(project, assignment)`, creează întâi, prin `profilesStore.createProfile({...})`, câte un profil real pentru fiecare id folosit în `assignment`, PE ACELAȘI FIȘIER pe care se deschide și `slotStore`. Testele `getSlots()` pe bază goală, `createSlotStore(...)` fără efecte secundare, și `close()` idempotent NU au nevoie de profiluri reale (nu scriu nimic) — rămân neschimbate.

### 1.2 — 1 eșec în `test/server-world.test.mjs`: test vechi (RF-05b) nu a fost actualizat pentru câmpul nou `pawns`

```
✖ GET /api/world: fără niciun profil în bază -> 200, { zones: [] } (linia 102)
```

Testul face `assert.deepEqual(json, { zones: [] })` — dar răspunsul de la `/api/world`, după RF-05c, e `{ zones: [], pawns: [] }`. Testul vechi, scris la RF-05b, nu a fost actualizat când ai extins fișierul cu testele noi pentru `pawns` — exact genul de regresie pe care rularea suitei COMPLETE (nu doar fișierele noi) trebuie s-o prindă, cum s-a întâmplat deja la RF-04-d.

**Ce trebuie să faci**: corectează asertarea la `assert.deepEqual(json, { zones: [], pawns: [] })`.

## 2. Ce NU faci

- Nu modifici `slot-store.js`, `world.js`, `server.js`, `public/world.js` — codul de producție e corect, verificat de planner direct în cod. Dacă găsești vreun motiv să crezi contrariul, scrie-l în raport, nu modifica.
- Nu slăbi niciun test (nu elimina o verificare doar ca să treacă) — repară SETUP-ul (profiluri reale, fișier comun) sau asertarea învechită, nu logica de verificare.
- Nu atinge alte teste care deja trec.

## 3. Fișiere

**Poți modifica:** `test/slot-store.test.mjs`, `test/server-world.test.mjs` (doar linia/asertarea semnalată la §1.2).

**NU atinge:** `slot-store.js`, `world.js`, `server.js`, `public/world.js`, `layout.js`, `hex-layout.js`, `profiles.js`, `runs.js`, `db.js`, `migrations/**`, `test/world.test.mjs` (deja corect, toate cele 41 de teste care trec rămân neatinse), documentele de coordonare.

## 4. Raportul

`docs/handoff/RF-05c-b-tester-raport.md`:

```
## Ce am reparat în slot-store.test.mjs
Confirmă modelul makeSharedStores aplicat corect (profiles + slotStore pe același fișier, profiluri reale create înainte de saveSlots).

## Ce am reparat în server-world.test.mjs

## Am verificat că toate cele 47 de teste trec acum?
Nu poți rula comenzi — spune ce ai verificat manual, prin citire, ca să crezi că fix-ul e corect.

## Decizii pe care le-am luat singur

## Contradicții găsite în brief
Dacă niciuna, scrie „niciuna".
```

## 5. Constrângeri

- Nu rulezi comenzi (nu poți confirma tu că testele trec — planner rulează din nou).
- Română, în comentarii și raport.
