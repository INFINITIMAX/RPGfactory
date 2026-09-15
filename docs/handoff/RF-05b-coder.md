# RF-05b — brief coder: persistență Layout + endpoint + randare statică Canvas 2D

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Lot:** RF-05b — al doilea sub-lot din RF-05 (harta). Zonele apar pe ecran, static — fără personaje, fără animație (RF-05c).
**Decizii confirmate de Lucian (nu re-deschide):** grupare pe `agent_profiles.last_project`; randare **Canvas 2D**, nu SVG (confirmat de Lucian, și acum și de `spec.md` §1: „API local → HUD Bot Crossing adaptat + Canvas 2D").

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Sarcina

RF-05a a construit `hex-layout.js` — o funcție pură care decide ce celule hexagonale ține fiecare proiect, dat fiind cererea curentă și layout-ul anterior. Nimic nu o cheamă încă cu date reale, nimic nu ține minte rezultatul, nimic nu-l desenează.

`spec.md` §3 cere explicit o entitate **Layout persistată separat**: *"Layout separat de lista momentan activă: regate, rădăcini, celule și posturi persistente."* — memoria lui `allocateCells` (parametrul `previous`) trebuie să supraviețuiască unui restart al serverului, nu doar să existe în RAM cât timp serverul rulează.

Patru livrabile:

1. **Migrație nouă** — tabelă pentru layout-ul persistat.
2. **`layout.js`** — store CRUD peste acea tabelă, injectabil ca `profiles.js`/`runs.js`.
3. **`world.js`** — funcții PURE: grupează profilurile pe `last_project` în `{id, size}` pentru `hex-layout.js`, și alege o culoare de accent stabilă per proiect.
4. **Wiring în `server.js`** — o rută nouă `GET /api/world` care leagă totul: citește profilurile, grupează, citește layout-ul persistat, cheamă `allocateCells`, salvează rezultatul, răspunde cu zonele.
5. **Randare statică** — `public/world.js` (nou) + modificări în `public/index.html`/`public/hud.css`: un `<canvas>` care desenează hexagoanele fiecărei zone, colorate cu accentul ei, plus sloturile (poziții pentru specialiști — fără personaje încă, doar marcaje).

**Ce NU e în acest lot**: personaje/pawn-uri (RF-05c), animație, click pe hartă → selecție (posibil lot ulterior — nu inventa acum), legarea „postului persistent" al unui specialist de un slot anume (Layout-ul persistă zonele/celulele, NU încă „cine stă în ce slot" — asta ține de pawn-uri, RF-05c).

## 2. Referință obligatorie

Aceeași sursă ca RF-05a: `bot-crossing` (`src/world/plots.js`, commit fixat în `docs/PARITY.md`). De data asta te interesează și partea de **geometrie/randare** (nu doar alocarea, deja făcută):

- `hexToWorld(q, r, size)` — conversia din coordonate axiale în coordonate de plan (acolo e 3D, X/Z; la tine e 2D, X/Y de canvas). Formula matematică e identică, doar interpretarea celei de-a doua axe diferă.
- `corner(cx, cz, i, size)` — colțurile unui hexagon flat-top, utile pentru desenat conturul cu `ctx.lineTo`.
- `_buildSlots()` — sloturi fixe per celulă: centrul celulei, plus un inel de 6 în jur, la un unghi fix (`(Math.PI/3)*i + Math.PI/6`) și rază `TILE * 0.58`. **Portezi doar geometria** (unde stau cele 7 poziții), nu Three.js.
- `PLOT_PALETTE` — o listă de culori (acolo, valori hex numerice pentru Three.js). Adaptezi ca listă de șiruri CSS (`'#c96442'`, etc.) și `hashString(str)` pentru alegerea deterministă (același proiect → aceeași culoare la fiecare randare, indiferent de ordine).

**Nu importa** nimic din texturi/materiale/lumini/etichete 3D (`createLabel`, `deckSurface`, `kerbSurface`, shader-e) — total neaplicabil în 2D, cf. `docs/PARITY.md` P42/P43 (decizie 2D: nu importăm pipeline 3D ca dependență ascunsă).

## 3. Contractele

### 3.1 Migrația — `migrations/003-layout.sql`

Urmează stilul `001-profiluri.sql`/`002-sesiuni.sql` (comentarii explicative, `NOT NULL` explicit pe cheia primară, `revision` pentru scrieri viitoare chiar dacă acest lot nu face CAS pe ea — vezi §3.2 de ce).

```sql
CREATE TABLE hex_layout (
  project    TEXT PRIMARY KEY NOT NULL,
  cells      TEXT NOT NULL,   -- JSON: [{"q":0,"r":0}, ...], index 0 = rădăcina
  updated_at INTEGER NOT NULL,
  revision   INTEGER NOT NULL DEFAULT 1
);
```

`cells` ca JSON serializat e o excepție acceptată la stilul relațional din restul schemei — aici nu e o entitate cu identitate proprie per celulă, e un singur blob geometric per proiect, recalculat integral la fiecare citire de profiluri. Nu inventa un tabel `hex_layout_cells` normalizat (o rândură per celulă) — inutil pentru cum se citește/scrie acest lot (mereu tot blob-ul, niciodată o celulă izolată).

### 3.2 `layout.js` — store, injectabil ca `profiles.js`

```js
function createLayoutStore(options = {}) -> {
  getLayout(): Map<project, [{q,r}, ...]>,   // gol dacă tabela e goală
  saveLayout(layoutMap: Map<project, [{q,r}, ...]>): void,  // înlocuiește TOT conținutul tabelei ca să corespundă exact cu layoutMap (proiectele dispărute din layoutMap sunt șterse din tabelă)
  close(): void,
}
```

Aceleași reguli ca `profiles.js`/`runs.js` (lecția RF-02a/RF-02b-c): **fără efecte secundare la `require` SAU la `createLayoutStore(options)`** — baza de date se deschide lazy, la prima metodă apelată, memoizat. Handle propriu — răspunde de propria închidere (nu-l share cu `profilesStore`/`runsStore`).

**De ce NU e nevoie de CAS aici (`expectedRevision`), spre deosebire de `agent_profiles`/`runs`**: scrie DOAR serverul însuși, dintr-un singur loc (ruta `GET /api/world`, vezi §3.4), niciodată un client extern printr-un API de mutație expus. Nu există concurs de scriere de la doi utilizatori — există doar riscul benign ca două cereri HTTP simultane să recalculeze aproape simultan (ambele pornesc de la același `previous`, ambele scriu un rezultat la fel de valid). Documentează exact acest raționament în cod, cu același stil ca explicația CAS-fără-CAS din `runs.js` (`observeRun`) — nu lăsa tăcut, motivează.

`saveLayout` tot incrementează `revision` la fiecare scriere (util pentru diagnosticare/audit ulterior, chiar fără citire cu `expectedRevision` în acest lot).

### 3.3 `world.js` — funcții PURE (fără bază de date, fără HTTP)

```js
/**
 * Grupează profilurile pe `last_project`, ordonate descrescător după
 * mărime (cel mai mare primul — vezi RF-05a §"ordinea decide cui i se dă
 * cea mai apropiată celulă de centru DINTRE proiectele noi"), la egalitate
 * de mărime ordonate alfabetic după `project` (determinist, nu ordinea de
 * întoarcere din SQLite).
 *
 * Profilurile cu `last_project` null/gol sunt EXCLUSE (nu au unde sta pe
 * hartă în acest lot) — documentează ca limitare acceptată, nu reparată aici.
 */
function groupProjects(profiles) -> [{ id: string, size: number }]

/** Culoare stabilă per proiect — același `project` -> aceeași culoare, indiferent de ordine sau de câte ori se cheamă. */
function pickAccent(project) -> string  // ex. '#c96442'
```

Paletă: alege 10-12 culori CSS distincte, potrivite pentru fundal deschis ȘI închis (verifică lizibilitate în ambele teme — `public/hud.css` are deja reguli de temă din RF-04, urmează același model). Hash determinist (poți porta `hashString` din sursă, FNV-1a simplu).

### 3.4 Wiring în `server.js` — `GET /api/world`

```
GET /api/world
→ 200 { zones: [ { project: string, cells: [{q,r},...], accent: string }, ... ] }
```

Pași, în ordine, la fiecare cerere (recalculează de fiecare dată — nu cache separat, nu invalidare manuală):

1. `profilesStore.listProfiles()` — toate profilurile.
2. `groupProjects(profiles)` din `world.js`.
3. `layoutStore.getLayout()` — layout-ul anterior persistat.
4. `require('./hex-layout').allocateCells(projects, previous)`.
5. `layoutStore.saveLayout(rezultat)` — persistă imediat, ca următoarea cerere să pornească de la acest `previous`.
6. Răspunde cu `{ zones: [...] }`, unde fiecare zonă adaugă `accent: pickAccent(project)` peste ce a întors `allocateCells`.

Creează `layoutStore` în `createServer(options)` exact ca `profilesStore`/`runsStore` (lazy, `options.dbPath`/`options.migrationsDir` refolosite, NU o cale de configurare separată). **Extinde wrapper-ul existent al lui `server.close`** (nu crea altul — lecția RF-02b-b/c, aplicată deja corect la RF-02c/RF-03a, nu o strica acum) ca să închidă și `layoutStore`.

Validare Origin/metodă: la fel ca restul rutelor `/api/*` deja existente — refolosește mecanismul existent (`checkOrigin` etc.), nu inventa altul.

## 4. Randarea statică — frontend

### 4.1 `public/index.html`

Adaugă o secțiune nouă pentru hartă (canvas), lângă tabelele existente — nu înlocui nimic din ce a construit RF-04. `<canvas id="world-canvas">` cu `width`/`height` rezonabile (poți face canvas-ul responsive prin CSS + `devicePixelRatio` la desen, ca textul să nu fie neclar pe ecrane HiDPI — documentează decizia).

### 4.2 `public/world.js` (nou, frontend)

**Anti-XSS**: dacă desenezi vreun text (nume de proiect) pe canvas, `ctx.fillText` e sigur prin natura API-ului Canvas (nu interpretează HTML) — nu e nevoie de `textContent`/`createElement` aici ca la `hud.js`, dar NU crea niciun element DOM cu `innerHTML` din datele primite de la `/api/world` dacă adaugi vreo legendă/listă în HTML în plus față de canvas.

**Polling propriu, single-flight, cu request token** — aceeași disciplină ca `pollOnce()` din `hud.js` (RF-04): nu porni o cerere nouă înainte ca cea anterioară să se fi rezolvat complet, gardă de token împotriva răspunsurilor vechi care ajung după unul mai nou. Nu reutiliza ciclul de poll din `hud.js` — modul separat, testabil/verificabil independent (limita lotului).

**Desenul, la fiecare răspuns nou de la `/api/world`**:
1. Curăță canvas-ul (`ctx.clearRect`).
2. Pentru fiecare zonă: pentru fiecare celulă, calculează centrul în pixeli (`hexToWorld` adaptat, cu un `CELL` ales de tine — documentează valoarea și de ce), desenează hexagonul (poligon cu 6 colțuri, `corner()` adaptat) umplut cu `zone.accent`, cu un contur vizibil.
3. Desenează sloturile (7 poziții per celulă, geometria din `_buildSlots`) ca marcaje mici (cerculețe goale) — nu sunt încă ocupate de nimeni, doar arată unde va sta un specialist (RF-05c).
4. Numele proiectului, o singură dată per zonă (lângă rădăcină), cu `ctx.fillText`, culoare lizibilă pe fond (verifică contrast pe accentul ales).

**Fără click, fără hover, fără selecție** — pur decorativ/informativ în acest lot. Nu adăuga listener-e de `click`/`mousemove` pe canvas (asta ar fi un lot separat de interacțiune hartă, neaprobat încă).

**Reduced motion / repaus**: nu există animație în acest lot (e desen static, redesenat doar când vin date noi de la poll) — nu e nimic de dezactivat pentru `prefers-reduced-motion`, dar NU introdu vreo tranziție CSS/`requestAnimationFrame` inutilă doar pentru„efect" — `spec.md` §7 o cere abia la RF-05c, cu bucla de randare bazată pe timp.

### 4.3 `public/hud.css`

Stil pentru containerul canvas-ului — respectă temele light/dark deja stabilite la RF-04 (verifică fișierul, nu inventa alt sistem de teme).

## 5. Ce NU face acest lot

- Niciun personaj, niciun pawn, nicio animație (RF-05c).
- Niciun click/hover/selecție pe hartă.
- Nicio legare a unui profil anume la un slot anume (Layout persistă zone/celule, nu ocuparea sloturilor).
- Nicio schimbare la `hex-layout.js` (RF-05a, deja închis) — dacă găsești un bug real acolo, RAPORTEAZĂ, nu repara tu (nu ai voie să atingi fișierul conform listei de mai jos — planner decide dacă redeschide RF-05a).
- Niciun endpoint de mutație pentru layout (`POST`/`PUT` pe `/api/world`) — doar `GET`, recalculat mereu din date reale.

## 6. Fișiere

**Poți crea:** `migrations/003-layout.sql`, `layout.js`, `world.js` (rădăcina proiectului), `public/world.js`.

**Poți modifica:** `server.js` (wiring rută + `layoutStore` + wrapper `close()`), `public/index.html` (secțiune canvas nouă, `<script src="world.js">`), `public/hud.css` (stil canvas).

**NU atinge:** `hex-layout.js`, `public/hud.js` (ecranul de tabele, RF-04 — nu-l amesteca cu harta), `public/game.html`/`game.js`/`game.css`/`public/zones.js` (jocul vechi), `profiles.js`, `runs.js`, `db.js`, `migrations/001-*.sql`, `migrations/002-*.sql`, `state.js`, `body.js`, `adapters/**`, `test/**`, `package.json`, `data/`, `.env`, `assets/`, documentele de coordonare.

## 7. Raportul

`docs/handoff/RF-05b-coder-raport.md`:

```
## Ce am implementat
migrations/003-layout.sql, layout.js, world.js (backend, pur), server.js (wiring GET /api/world), public/world.js (frontend, desen), public/index.html, public/hud.css.

## De ce hex_layout stochează JSON, nu o tabelă normalizată per celulă
Confirmă că ai citit §3.1 și explică cu cuvintele tale.

## De ce NU există CAS/expectedRevision pe layout.js
Confirmă raționamentul din §3.2, cu cuvintele tale.

## groupProjects — ordinea determinism (mărime desc, apoi alfabetic)

## pickAccent — cum ai ales paleta și hash-ul, verificare lizibilitate light/dark

## CELL (dimensiunea hexagonului în pixeli) — valoarea aleasă și de ce

## Polling propriu din public/world.js — single-flight + request token
Confirmă că nu ai reutilizat ciclul din hud.js și de ce (izolare de lot).

## Extinderea wrapper-ului de close()
Confirmă că ai extins wrapper-ul existent, nu ai creat altul.

## Decizii pe care le-am luat singur

## Ce nu am făcut și de ce

## Riscuri pentru tester

## Contradicții găsite în brief
Dacă niciuna, scrie „niciuna".
```

## 8. Constrângeri

- Nu rulezi comenzi. Nu scrii teste. Nu afirma că ceva „funcționează" — nu poți verifica vizual.
- Nu delega. Română, în cod și raport.

### Citește înainte

1. `/tmp/claude/bot-crossing-trial/src/world/plots.js` — `hexToWorld`, `corner`, `_buildSlots`, `PLOT_PALETTE`, `hashString` (geometria și paleta, NU randarea 3D).
2. `hex-layout.js` (RF-05a) — contractul exact al lui `allocateCells`, ca să știi ce primești/trimiți.
3. `spec.md` §3 (entitatea Layout) și §7 (cerințele de HUD/lume).
4. `profiles.js` — `listProfiles()`, ca să știi exact forma unui profil (are `last_project`?).
5. `runs.js` — comentariul care motivează absența CAS la `observeRun`, ca model pentru cum motivezi absența CAS la `saveLayout`.
6. `public/hud.js`/`public/hud.css` (RF-04) — stilul de temă light/dark existent, disciplina de polling single-flight (o repeți independent, nu o imporți).
7. `server.js` — wrapper-ul de `close()` de la RF-02c/RF-03a, ca să-l extinzi corect.
