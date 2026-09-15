# RF-05c — brief coder: posturi persistente + pawn-uri + animație minimă

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Lot:** RF-05c — al treilea și ultimul sub-lot din RF-05 (harta). Fiecare profil primește un post fix pe hartă (un slot, în zona proiectului lui) și apare ca un pawn — static când nu lucrează, cu o animație minimă când lucrează efectiv.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Sarcina

`spec.md` §3 cere ca entitatea Layout să persiste, pe lângă zone/celule, și **„posturi persistente"** — care slot dintr-o zonă ține fiecare specialist, ca „un specialist să nu sară" între sloturi doar pentru că un coleg a apărut sau a plecat. `spec.md` §7 cere:

> Poziția reprezintă postul/specializarea principală; activitățile auxiliare nu mută automat specialistul. [...] Pawn la început; animație de lucru numai pentru lucru confirmat. Mărimea 1×–2× depinde exclusiv de usage propriu recent. Lipsa usage nu produce mărime maximă sau dovadă de inactivitate. O buclă de randare bazată pe timp, cadre corecte per sheet, repaus/reduced-motion și separare între mișcare și lifecycle.

**Scop redus, explicit, pentru acest lot** (citește cu atenție, nu extinde singur):

- **Fără usage real încă** (RF-06, netratat) — `spec.md` cere explicit ca *lipsa* de date de consum să NU producă mărime maximă. Toți pawn-ii au `sizeFactor = 1` (mărime de bază) în acest lot — NU inventa o aproximare din numărul de sesiuni sau altceva ce n-ar fi usage real. Documentează asta ca limitare acceptată, cu un loc clar unde RF-06 va putea introduce mărimea reală mai târziu.
- **Fără sprite-uri, fără sheet-uri de animație** — `docs/PARITY.md` P49 spune explicit că „reprezentarea estetică nu este încă înghețată". Pawn-ul e un simbol simplu desenat pe Canvas (cerc/token colorat), NU un personaj cu sprite sheet. „Cadre corecte per sheet" din citatul de mai sus NU se aplică acestui lot (nu există niciun sheet) — animația „de lucru" e un efect simplu, bazat pe timp (ex. o pulsație de rază), nu o succesiune de cadre desenate.
- **Fără mișcare** — pawn-ul stă fix în slot-ul lui. „Separare între mișcare și lifecycle" din citat e satisfăcută trivial (nu există mișcare de reparat/amestecat cu lifecycle-ul), nu o construi degeaba.

Patru livrabile:

1. **Migrație nouă** — tabelă pentru posturile persistente (slot per profil).
2. **Funcții PURE noi**, adăugate în `world.js` (backend, rădăcina proiectului, lângă `groupProjects`/`pickAccent`): gruparea profilurilor pe proiect (cu id-uri, nu doar numărul) și algoritmul de alocare a sloturilor, cu memorie.
3. **Store nou** — `slot-store.js`, persistă posturile, injectabil ca `layout.js`.
4. **Extinderea `GET /api/world`** — răspunsul include acum și `pawns`.
5. **Extinderea `public/world.js`** — desenează pawn-ii pe sloturile lor, cu animație minimă pentru cei care lucrează confirmat.

## 2. Contractele

### 2.1 Migrația — `migrations/004-sloturi.sql`

Stil identic cu `001`-`003` (comentarii, `NOT NULL` explicit, `revision`).

```sql
CREATE TABLE profile_slots (
  profile_id  TEXT PRIMARY KEY NOT NULL REFERENCES agent_profiles(id),
  project     TEXT NOT NULL,
  slot_index  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  revision    INTEGER NOT NULL DEFAULT 1,
  UNIQUE(project, slot_index)
);
```

`UNIQUE(project, slot_index)` — garanție la nivel de bază de date că doi specialiști din același proiect nu pot ocupa fizic același post (a doua sursă de adevăr, pe lângă algoritmul din §2.2 — apărare în profunzime, ca la CAS-ul din `agent_profiles`).

### 2.2 Funcții PURE noi, în `world.js` (backend)

```js
/**
 * Profilurile fiecărui proiect, ca listă de ID-uri (NU doar numărul, ca la
 * `groupProjects`) — necesar ca să știm CUI anume îi dăm un slot.
 * Aceeași excludere ca `groupProjects`: last_project null/gol -> exclus.
 * Ordinea din listă contează pentru `assignSlots` (vezi mai jos) — păstrează
 * ordinea în care apar în `profiles` (deja `ORDER BY created_at ASC, id ASC`
 * din `profilesStore.listProfiles()` — nu resorta).
 */
function profilesByProject(profiles) -> Map<project, [profileId, ...]>

/**
 * Alocă un post (slot_index) fiecărui profil dintr-un SINGUR proiect, cu
 * memorie — un profil care avea deja un post îl păstrează, cât timp mai
 * există loc (slot_index < capacity) și el rămâne în `profileIds`. Un
 * profil nou primește cel mai mic slot_index liber. Un profil care nu mai
 * apare în `profileIds` (a plecat din proiect) își eliberează postul.
 * Dacă `profileIds.length > capacity`, cei care nu mai încap NU primesc
 * slot (nu apar în rezultat) — limitare acceptată, documentează, nu
 * inventa un „overflow" vizual în acest lot.
 *
 * @param profileIds   [profileId, ...] — ordinea contează DOAR pentru cine
 *                     primește sloturile noi disponibile, dintre cei fără
 *                     post anterior (primul din listă ia primul slot liber).
 * @param previous     Map<profileId, slotIndex> — posturile anterioare ale
 *                     ACESTUI proiect (nu ale altor proiecte).
 * @param capacity     număr total de sloturi ale zonei = cells.length * 7
 *                     (7 sloturi per celulă — geometria din RF-05b).
 * @returns Map<profileId, slotIndex>
 */
function assignSlots(profileIds, previous, capacity) -> Map<profileId, slotIndex>
```

**De ce nu hash+jitter** (interzis explicit de `spec.md` §7): un slot ocupat de doi specialiști diferiți la momente diferite ar produce suprapunere vizuală dacă poziția s-ar calcula din hash-ul id-ului — de-aia sloturile sunt un întreg mic (0..capacity-1), alocat determinist, nu derivat dintr-un hash.

**Convenție obligatorie, documentează-o explicit în cod** (frontend-ul din §2.4 depinde de ea): `slot_index` e un întreg global pe toată zona, NU per celulă — `slot_index = cellIndex * 7 + localSlotIndex`, unde `cellIndex` e poziția celulei în `zone.cells` (array-ul întors de `/api/world`, index 0 = rădăcina) și `localSlotIndex` (0..6) e poziția din cele 7 sloturi ale acelei celule (centrul = 0, apoi inelul de 6, în ordinea din `slotsForCell` la RF-05b).

### 2.3 `slot-store.js` — persistență, injectabil ca `layout.js`

```js
function createSlotStore(options = {}) -> {
  getSlots(): Map<project, Map<profileId, slotIndex>>,
  saveSlots(project: string, assignment: Map<profileId, slotIndex>): void,  // înlocuiește TOT ce ține baza pentru ACEL proiect, ca să corespundă exact cu assignment
  close(): void,
}
```

Aceleași reguli ca `layout.js`: fără efecte secundare la `require`/construcție, handle propriu (lazy, memoizat), fără CAS (motivează la fel — singurul scriitor e serverul, din `GET /api/world`, niciun endpoint de mutație expus).

`saveSlots(project, assignment)` operează PE UN SINGUR PROIECT deodată (spre deosebire de `saveLayout` din `layout.js`, care înlocuia tot) — pentru că `GET /api/world` recalculează sloturile proiect cu proiect (fiecare zonă are propria capacitate). Șterge din tabelă orice rând cu acel `project` care nu mai apare în `assignment`, upsert pentru restul.

### 2.4 Wiring în `server.js` — extinde `GET /api/world`

Adaugă, DUPĂ ce zonele sunt calculate (nu înainte — sloturile au nevoie de `cells.length` per zonă, deja calculat):

1. `runsStore.listRuns()` — toate sesiunile observate. Construiește un `Set` cu `profile_id` pentru rândurile cu `lifecycle === 'running'` (NU `queued`/`paused` — „lucru confirmat" înseamnă rulează efectiv acum, nu în așteptare).
2. `profilesByProject(profiles)` (din `world.js`) — id-urile per proiect.
3. Pentru fiecare zonă deja calculată (ai `zone.project`, `zone.cells`): `capacity = zone.cells.length * 7`; `previous = slotStore.getSlots().get(zone.project) || new Map()`; `assignment = assignSlots(profilesByProject.get(zone.project) || [], previous, capacity)`; `slotStore.saveSlots(zone.project, assignment)`.
4. Construiește `pawns`: pentru fiecare `(profileId, slotIndex)` din fiecare `assignment`, găsește profilul (nume, din `profiles`) și adaugă `{ profileId, name, project, slotIndex, working: <profileId în Set-ul de la pas 1>, sizeFactor: 1 }`.
5. Răspuns final: `{ zones: [...ca înainte...], pawns: [...] }`.

Creează `slotStore` în `createServer(options)` exact ca `layoutStore` (lazy, `options.dbPath`/`options.migrationsDir`). **Extinde din nou ACELAȘI wrapper** de `server.close()` (nu crea altul).

## 3. Randarea — `public/world.js`

### 3.1 Desenul pawn-ilor

Pentru fiecare pawn din `pawns`: calculează celula lui din `slot_index` (`cellIndex = Math.floor(slot_index / 7)`, `localSlotIndex = slot_index % 7`), găsește celula `zone.cells[cellIndex]` (zona identificată prin `pawn.project`), calculează poziția în pixeli cu `slotsForCell` (deja existentă din RF-05b — dacă `cellIndex` nu mai există în `zone.cells` curent — caz limită tranzitoriu, un pawn „orfan" de o schimbare recentă de layout — sari peste el silențios, nu arunca).

Desenează un token simplu (cerc plin, rază mică, ex. 6px) la acea poziție, cu o culoare distinctă de accentul zonei (ca să se vadă pe fond), plus numele scurt sau inițiala (opțional, decide tu, documentează).

### 3.2 Animație „lucru confirmat" — minimă, bazată pe timp

Pentru pawn-ii cu `working: true`: o pulsație simplă a razei token-ului, bazată pe timp real (`performance.now()`sau echivalent), NU pe numărul de cadre desenate (ca desenul să arate identic indiferent de rata de refresh a ecranului).

**`prefers-reduced-motion`**: verifică `window.matchMedia('(prefers-reduced-motion: reduce)').matches` — dacă adevărat, NU anima deloc; desenează pawn-ii care lucrează cu un marcaj static (ex. contur mai gros/altă culoare), nu cu pulsație.

**Bucla de desen**: dacă există cel puțin un pawn cu `working: true` ȘI reduced-motion e fals, pornește o buclă `requestAnimationFrame` care re-desenează la fiecare cadru (harta e mică, câteva zeci de hexagoane — cost neglijabil). Dacă nu există niciun pawn care lucrează, SAU reduced-motion e adevărat, NU porni bucla `requestAnimationFrame` — desenul rămâne static, redesenat doar la poll/resize, ca la RF-05b (nu consuma CPU/baterie degeaba când nu e nimic de animat).

Oprește bucla `requestAnimationFrame` dacă la un poll ulterior nu mai există niciun pawn `working: true` (nu o lăsa să ruleze la nesfârșit după ce condiția a dispărut).

### 3.3 Ce NU faci aici

- Niciun sprite, niciun sheet, nicio succesiune de cadre desenate — un singur efect continuu (pulsație de rază sau echivalent simplu).
- Nicio mișcare a pawn-ilor între sloturi (stau fix).
- Niciun click/hover pe pawn-uri (tot ca la RF-05b — lot separat, neaprobat).
- Nicio reprezentare a mărimii 1×-2× din usage — `sizeFactor` vine deja `1` de la server, desenează-l „ca și cum" ar putea varia (folosește-l ca multiplicator de rază, chiar dacă azi e mereu 1), ca RF-06 să nu ceară o rescriere a randării, doar o schimbare a valorii trimise de server.

## 4. Ce NU face acest lot

- Nicio mărime reală din usage (RF-06).
- Niciun sprite/sheet de animație (backlog estetic, P49).
- Nicio mișcare, niciun pathfinding.
- Niciun click/selecție pe hartă.
- Nicio schimbare la `hex-layout.js`, `layout.js`, structura `zones` existentă din `/api/world` (doar ADAUGĂ `pawns`, nu modifica ce exista).

## 5. Fișiere

**Poți crea:** `migrations/004-sloturi.sql`, `slot-store.js` (rădăcina proiectului).

**Poți modifica:** `world.js` (rădăcina proiectului — adaugă `profilesByProject`/`assignSlots`, EXPORTĂ-le alături de `groupProjects`/`pickAccent`), `server.js` (extinde `GET /api/world`, `slotStore`, wrapper `close()`), `public/world.js` (desen pawn-uri + animație).

**NU atinge:** `hex-layout.js`, `layout.js`, `public/hud.js`, `public/index.html`, `public/hud.css`, `public/game.*`, `public/zones.js`, `profiles.js`, `runs.js`, `db.js`, `migrations/001-*.sql`...`003-*.sql`, `state.js`, `body.js`, `adapters/**`, `test/**`, `package.json`, `data/`, `.env`, `assets/`, documentele de coordonare.

## 6. Raportul

`docs/handoff/RF-05c-coder-raport.md`:

```
## Ce am implementat
migrations/004-sloturi.sql, world.js (profilesByProject/assignSlots), slot-store.js, server.js (extindere GET /api/world), public/world.js (desen pawn-uri + animație).

## Convenția slot_index = cellIndex*7 + localSlotIndex
Confirmă că ai aplicat-o identic în backend (capacity) și frontend (mapare la desen).

## assignSlots — memorie și determinism
Cum garantezi că un profil păstrează postul cât timp mai există loc, și că sloturile noi se dau determinist (nu hash/random).

## De ce NU există CAS pe slot-store.js

## working: true — sursa exactă (lifecycle === 'running', nu queued/paused)

## sizeFactor — de ce e fix 1 în acest lot, unde ar intra RF-06

## Animația — prefers-reduced-motion, pornire/oprire requestAnimationFrame
Confirmă că bucla NU rulează când nu e nevoie (fără pawn-i care lucrează, sau reduced-motion activ).

## Extinderea wrapper-ului de close()

## Decizii pe care le-am luat singur

## Ce nu am făcut și de ce

## Riscuri pentru tester

## Contradicții găsite în brief
Dacă niciuna, scrie „niciuna".
```

## 7. Constrângeri

- Nu rulezi comenzi. Nu scrii teste. Nu afirma că ceva „funcționează" — nu poți verifica vizual/animația.
- Română, în cod și raport.

### Citește înainte

1. `spec.md` §3 (Layout — posturi persistente) și §7 (pawn, animație, reduced-motion, mărime).
2. `docs/PARITY.md` — P28, P48, P49, P51 (ce e adaptare, ce e încă neînghețat estetic).
3. `layout.js` (RF-05b) — modelul exact de store fără CAS, ca să-l repeți identic pentru `slot-store.js`.
4. `world.js` (RF-05b) — `groupProjects`/`pickAccent`, stilul funcțiilor pure existente.
5. `public/world.js` (RF-05b) — `slotsForCell`, `hexToWorld`, `corner`, `draw()`, `pollOnce()` — desenul pawn-ilor se adaugă în interiorul aceluiași IIFE, folosind aceeași geometrie.
6. `runs.js` — `listRuns()`, ca să știi exact ce coloane are un rând (`profile_id`, `lifecycle`).
7. `server.js` — secțiunea `/api/world` (RF-05b) și wrapper-ul de `close()`, ca să le extinzi corect.
