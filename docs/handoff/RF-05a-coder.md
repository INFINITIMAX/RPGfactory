# RF-05a — brief coder: algoritm de layout hexagonal, cu memorie (funcție pură)

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Lot:** RF-05a — primul sub-lot din RF-05 (harta). Doar algoritmul de așezare pe hexagoane. **Nimic desenat, niciun Canvas, niciun DOM** — asta vine în RF-05b.
**Decizii confirmate de Lucian (nu re-deschide):** RF-03b (Pi) mutat mai jos pe listă — se lucrează la hartă acum. RF-05 împărțit în RF-05a (acest lot) / RF-05b (randare statică Canvas 2D) / RF-05c (personaje + animație). Zonele se grupează pe `agent_profiles.last_project`. Grilă **hexagonală** (nu pătrată — vezi §3 mai jos, de ce nu refolosim `public/zones.js`).

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Sarcina

`spec.md` §7 cere: *"Layout cu memorie pentru proiectele momentan fără execuții, creștere prin celule vecine, sloturi distincte pentru fiecare specialist, fără hash+jitter care produce hit-target-uri suprapuse."* Și `docs/PARITY.md` P50: *"Zone sticky, creștere, memorie pentru repo-uri inactive... trecere la hex și memorie reală pentru profiluri."*

Construiești modulul care decide **ce celulă hexagonală ține fiecare proiect**, astfel încât:

- un proiect cu mai mulți agenți activi ocupă mai multe celule alăturate (o "zonă"/blob contigui);
- o zonă care a crescut deja **nu se mută** pe hartă doar pentru că alt proiect a apărut sau a crescut — își păstrează celula-rădăcină și celulele deja deținute;
- o zonă care se micșorează renunță la celulele luate cel mai recent, păstrează rădăcina;
- un proiect nou (fără istoric) e așezat în cea mai apropiată celulă liberă de centru, în ordinea dată (cei mai mari primii);
- harta rămâne **un singur teritoriu conex** (nicio zonă izolată, plutind separat) — dacă memoria ar produce insule, se re-așează totul de la zero (compact, din centru), o singură dată, ca ultimă soluție.

## 2. Referință obligatorie — citește codul, nu ghici

Referința `bot-crossing` (fixată la commit-ul din `docs/PARITY.md`) rezolvă **exact** această problemă, pentru randare 3D: `src/world/plots.js`, funcțiile `allocateCells`, `layOut`, `growBlob`, `isConnected`, `hexRing`, `cellsNeeded`, `hexDistance`, `key`.

**Citește acel fișier înainte să scrii cod.** Comentariile din el explică exact de ce fiecare regulă există (de ex. de ce rădăcina nu se pierde niciodată, de ce pool-ul de celule libere trebuie să acopere și celulele "amintite" de proiecte inactive, nu doar nevoia de azi). Portezi **logica de alocare** (coordonate axiale, `growBlob`, `isConnected` prin flood-fill), **NU** codul de randare 3D (Three.js, mesh-uri, texturi — nimic din toate astea nu există în acest lot).

**Diferență esențială față de sursă — nu există celulă rezervată de "navă".** Bot-crossing rezervă `SHIP_CELL` pentru nava jucătorului. RPG Factory **nu are** un asemenea obiect fix în acest lot — nu inventa unul. Simplifică `isConnected`/`layOut` eliminând orice noțiune de celulă rezervată/stepping-stone.

## 3. De ce NU refolosim `public/zones.js`

Există deja un fișier `public/zones.js`, din proiectul vechi (T-01–T-19, dinaintea guvernanței RF), care rezolvă o problemă similară — dar pe **grilă pătrată** (4 vecini, distanță Manhattan), nu hexagonală. `spec.md` §7 și `docs/PARITY.md` P50 cer explicit trecerea la hex. `public/zones.js` rămâne neatins — e folosit de jocul vechi (`public/game.html`/`game.js`), nu de RF-05. **Nu îl modifica, nu îl ștergi, nu îl importă.**

## 4. Contractul modulului

Fișier nou: **`hex-layout.js`**, la rădăcina proiectului (lângă `profiles.js`, `runs.js`) — CommonJS (`module.exports`), ca restul codului RF-02+. Fără efecte secundare la `require` (nu citește fișiere, nu deschide baza de date — e o funcție pură pe structuri de date primite ca parametru).

```js
/**
 * @param projects  [{ id, size }], ordonate deja de apelant (cel mai mare primul —
 *                  doar ordinea decide cui i se dă cea mai apropiată celulă de centru
 *                  DINTRE proiectele noi, fără istoric).
 * @param previous  Map<id, [{q, r}, ...]> — layout-ul anterior (poate fi gol/lipsă
 *                  la primul apel).
 * @returns Map<id, [{q, r}, ...]>
 */
function allocateCells(projects, previous = new Map()) { ... }

/** Coordonate axiale flat-top. Distanța hexagonală dintre două celule. */
function hexDistance(a, b) { ... }

module.exports = { allocateCells, hexDistance };
```

**Nu exporta** funcțiile interne (`layOut`, `growBlob`, `isConnected`, `hexRing`, `cellsNeeded`, `key`) decât dacă testerul chiar are nevoie să le testeze separat — dacă da, exportă-le explicit și documentează în raport de ce (testarea unităților mici separat e utilă, dar nu umfla API-ul public fără motiv).

**Nu inventa** un parametru `MAX_CELLS`/`SLOTS_PER_CELL` diferit de sursă fără să-l documentezi — poți porni cu aceleași valori ca bot-crossing (`SLOTS_PER_CELL = 7`, `MAX_CELLS = 9`) sau alte valori rezonabile, dar **scrie în raport ce ai ales și de ce**, ca planner-ul să poată decide dacă se potrivesc cu numărul real de agenți per proiect din RPG Factory.

**`size`** — planner-ul/apelantul va calcula acest număr din `agent_profiles` grupate pe `last_project` (numărul de profiluri active per proiect) — **nu e treaba acestui modul** să citească baza de date. Modulul primește `projects` deja ca listă simplă `{id, size}`.

## 5. Ce NU face acest lot

- **Nu desenează nimic.** Niciun Canvas, niciun SVG, niciun DOM. Asta e RF-05b.
- **Nu citește baza de date.** Nu importă `profiles.js`, `runs.js`, `db.js`. Primește totul ca parametri.
- **Nu adaugă rute HTTP.** Wiring-ul (cine cheamă `allocateCells` cu ce date, unde se salvează `previous` între apeluri) vine în RF-05b.
- **Nu inventează celula "navă"/spawn** — vezi §2.
- **Nu convertește** coordonate hexagonale în pixeli (`hexToWorld`/`worldToHex` din sursă) — asta ține de randare, vine în RF-05b, unde se alege și dimensiunea hexagonului pentru Canvas.

## 6. Fișiere

**Poți crea:** `hex-layout.js` (rădăcina proiectului).

**NU atinge:** orice alt fișier — `public/zones.js`, `public/**`, `server.js`, `profiles.js`, `runs.js`, `db.js`, `migrations/**`, `state.js`, `body.js`, `adapters/**`, `test/**`, `package.json`, `data/`, `.env`, `assets/`, documentele de coordonare.

## 7. Raportul

`docs/handoff/RF-05a-coder-raport.md`:

```
## Ce am implementat
hex-layout.js — allocateCells, hexDistance (+ orice altă funcție exportată, cu motiv).

## Ce am portat din bot-crossing plots.js și ce am simplificat
Confirmă că ai citit sursa. Explică explicit eliminarea celulei rezervate (SHIP_CELL).

## SLOTS_PER_CELL / MAX_CELLS — valorile alese
Ce ai pus și de ce (aceleași ca sursa, sau altele — motivează).

## isConnected — cum ai adaptat flood-fill-ul fără celulă rezervată

## Funcții interne exportate (dacă e cazul) și de ce

## Decizii pe care le-am luat singur

## Ce nu am făcut și de ce

## Riscuri pentru tester

## Contradicții găsite în brief
Dacă niciuna, scrie „niciuna".
```

## 8. Constrângeri

- Nu rulezi comenzi. Nu scrii teste. Nu afirma că ceva „funcționează".
- Nu delega. Română, în cod și raport (numele funcțiilor/variabilelor pot rămâne în engleză, ca în restul bazei de cod — `allocateCells`, `hexDistance` etc. — dar comentariile și raportul sunt în română).

### Citește înainte

1. `/tmp/claude/bot-crossing-trial/src/world/plots.js` — sursa de referință (dacă lipsește la tine, verifică `docs/PARITY.md` pentru commit-ul fixat și semnalează-mi, nu reconstrui din memorie).
2. `spec.md` §7 (cerințele de layout).
3. `docs/PARITY.md` — P48, P50, P51 (ce anume adaptăm și ce diferă explicit).
4. `public/zones.js` — doar ca să confirmi de ce NU e refolosit (grilă pătrată, nu hex) — nu-l copia, nu-l modifica.
