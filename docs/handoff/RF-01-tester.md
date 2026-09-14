# RF-01 — brief tester

**Data:** 14-09-2026, EET.
**Rol:** tester. Scrii testele. **Nu rulezi comenzi. Nu modifici codul de producție.**
**Lot:** RF-01 — izolare server/teste + siguranță HTTP, static, input și salvare.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect. Dacă acest brief îl contrazice, `instructiuni.md` câștigă — semnalează în raport.

---

## 1. Sarcina

Coder-ul a livrat implementarea pentru 12 defecte. Tu scrii testele care dovedesc că fiecare e reparat — plus adaptezi testele existente la noul contract.

Două lucruri de înțeles înainte de orice:

**Primul.** Toate cele 12 defecte au fost **reproduse efectiv pe baseline**, înainte de fix, de către planner. Nu sunt ipoteze. Dovada, cu ce s-a observat exact pentru fiecare, e în `docs/handoff/RF-01-oracol-baseline.md`. **Citește-o** — îți spune ce comportament trebuie să se inverseze acum. Un test care nu poate distinge codul reparat de cel vechi nu valorează nimic.

**Al doilea.** Suita actuală e **periculoasă pentru datele reale ale utilizatorului**. Asta e chiar motivul pentru care există lotul:
- `test/state.test.mjs` șterge și restaurează `data/state.json` **real**;
- `test/api-open.test.mjs` cheamă `/api/open`, care lansează **rundll32** — un program real, pe mașina utilizatorului;
- toate trei pornesc serverul prin monkey-patch temporar pe `http.createServer`, pe porturi **fixe** (5391, 5392, 5393).

Testele tale trebuie să facă imposibilă repetarea acestor lucruri. Nu e o preferință de stil — e criteriul de acceptare al lotului.

---

## 2. Ce trebuie să conțină suita

### 2.1 Migrarea testelor existente

| Fișier | Ce se schimbă |
|---|---|
| `test/api-open.test.mjs` | Rescris pe `startServer` cu port efemer și opener injectat. **Niciun rundll32.** |
| `test/server.test.mjs` | Idem, pentru `/api/reveal` și `/api/new-session`. |
| `test/state.test.mjs` | Rescris pe `createStateStore({ dataDir })` cu director temporar. **Nu mai atinge `data/` real, nici să-l salveze și restaureze.** |

`test/app.test.mjs`, `test/merge-state.test.mjs`, `test/rank.test.mjs`, `test/status.test.mjs`, `test/zones.test.mjs` testează module neatinse de RF-01. **Nu le modifica** decât dacă ceva chiar s-a rupt; dacă da, spune în raport de ce.

**Elimină complet** monkey-patch-ul pe `http.createServer`. `startServer` întoarce acum `{ server, address, port, close }` — nu mai e nevoie de trucuri ca să obții un handle.

**Nu slăbi acoperirea existentă.** Fiecare aserțiune care verifică un comportament încă valabil trebuie să supraviețuiască migrării. Dacă ștergi vreuna, justifică în raport de ce comportamentul nu mai există.

### 2.2 Cum se pornește un server de test

```js
const { startServer } = require('../server.js');

const srv = await startServer({
  port: 0,                       // efemer — obligatoriu
  dataDir: <director temporar>,  // niciodată data/ real
  sessionsDir: <fixtures>,       // niciodată ~/.claude
  opener: (target) => { opened.push(target); },  // niciodată rundll32
  isAlive: (pid) => true,        // niciodată process.kill
  now: () => 1700000000000,      // ceas fix unde contează
});
// ... teste împotriva lui srv.port ...
await srv.close();
```

Directoare temporare: `fs.mkdtempSync(path.join(os.tmpdir(), 'rf01-'))`, curățate în `after`.

### 2.3 Regresiile obligatorii, pe defect

Fiecare trebuie să **eșueze pe codul vechi și să treacă pe cel nou**. Dacă un test ar fi trecut și înainte de fix, nu e o regresie — e decor.

| ID | Ce trebuie dovedit |
|---|---|
| **D1** | `require('../server.js')` nu deschide niciun port, nu citește `~/.claude`, nu lansează nimic. Dovedește-o observabil — de exemplu că `createServer()` nu produce un listener și că `sessionsDir` nu e atins până la o cerere efectivă pe `/api/agents`. |
| **D2** | Adresa pe care ascultă efectiv e loopback, nu `::`/`0.0.0.0`. Verifică `srv.address.address`. |
| **D3** | `PUT /api/state` cu `Origin: http://localhost:<alt port>` → **403**. Cu originea corectă → trece. Testează și `Host` cu port greșit → 403. |
| **D4** | Creează un director frate `public-*` cu un fișier marcat, cere-l prin traversal → **403**, iar conținutul **nu** apare în răspuns. Testează și `..%2F`, separatori Windows `\`, și o cale legitimă adâncă din `public/` care **trebuie** să meargă. |
| **D5** | Stare inexistentă + `baseUpdatedAt: 0` → **200** (prima scriere legitimă). Stare existentă cu revizie >0 + `baseUpdatedAt: 0` → **409**, iar starea de pe disc **rămâne neschimbată**. Aceasta e granița exactă pe care D5 o repară. |
| **D6** | `archived` ca obiect → 400. `archivedAt` ca string → 400. Câmp necunoscut → 400. `version: 2` → 400. `__proto__` ca cheie în `archivedAt` și **imbricat adânc** în `plots` → 400. `plots` la adâncime 8 → acceptat; la 9 → 400. `plots` peste 512 KiB → 400. **După fiecare 400, starea de pe disc trebuie să fie neatinsă.** |
| **D7** | Două scrieri consecutive produc revizii **strict crescătoare**, chiar cu ceasul fix (`now: () => <constantă>`). Aceasta e proba care pe baseline a cerut înghețarea ceasului ca să reproducă defectul. |
| **D8** | `Content-Length` peste 1 MiB → **413**, fără să se citească body-ul. Body real peste 1 MiB fără `Content-Length` corect (chunked) → **413**. Sub limită → trece. Vezi avertismentul de la §3.3. |
| **D9** | `GET /app.js?v=1` → 200 cu același conținut ca `GET /app.js`. `/api/agents?x=1` e tratat ca rută API, nu ca fișier. |
| **D10** | `DELETE /api/agents` → **405** cu header `Allow`. Idem metodă greșită pe fiecare rută din tabel. |
| **D11** | Fă scrierea să eșueze (cel mai simplu: `dataDir` care e un **fișier**, nu director, sau un subdirector fără permisiuni) → răspuns **500**, o singură dată, iar cererea **nu atârnă**. Apoi verifică faptul esențial: **o scriere ulterioară, validă, încă funcționează** — lanțul cozii nu s-a rupt. |
| **D12** | Niciun test din suită nu lansează un proces real. `opener` injectat primește ținta așteptată. Verifică și că `sessionId` cu `\r`, `\n` sau `\x00` → 400, fără să cheme opener-ul. |

### 2.4 Contracte de pinuit (nu sunt bug-uri — sunt decizii)

Acestea sunt comportamente deliberate. Scrie teste care le fixează, ca o schimbare viitoare accidentală să fie prinsă:

- **PUT face „full replace”, nu merge.** Un PUT care omite `archived` îl resetează la `[]`. E comportamentul dinainte, păstrat intenționat. Pinuiește-l.
- **`GET /api/agents` fără `Origin` → trece** (navigare normală). **`PUT /api/state` fără `Origin` → 403.** Regula diferă pe metodă, nu pe rută.
- **Rută necunoscută sub `/api/` → 404**, nu căutare de fișier static.
- **`savedAt`** apare în starea salvată și e ISO string, dar **nu** se folosește niciodată la CAS. Un PUT cu `savedAt` în body trebuie respins ca „câmp necunoscut”.

---

## 3. Patru capcane găsite de planner la inspecția codului

Coder-ul nu le-a semnalat. Sunt reale. Tratează-le ca țintă de test, nu ca presupunere — dacă vreuna se dovedește falsă, spune în raport.

### 3.1 `writeState` și-a schimbat forma, nu doar semnătura

Înainte: `writeState(archived, archivedAt, plots)` → întorcea **sincron** obiectul de stare.
Acum: `writeState(patch)` → întoarce o **promisiune**.

Orice test care folosește `writeState` direct trebuie să o aștepte. Un `assert` pe rezultatul neaşteptat va compara cu un `Promise`, nu cu starea — și poate trece din greșeală dacă aserțiunea e slabă.

### 3.2 Risc de `unhandledRejection` care poate omorî procesul

În `state.js`, `handlePutState` apelează `serialise(() => {...})` și **ignoră promisiunea întoarsă**. Coada e `writeQueue.then(fn, fn)`.

Erorile din `persist()` sunt prinse explicit (D11), deci calea normală e acoperită. Dar dacă funcția serializată aruncă din **alt** motiv — `res.writeHead` pe un răspuns deja trimis, de exemplu — `writeQueue` devine o promisiune respinsă pe care nimeni nu o prinde. Node 24 termină procesul la `unhandledRejection` implicit.

Scrie un test care încearcă să provoace asta. Dacă nu reușești, spune explicit în raport că ai încercat și nu ai putut — e o informație utilă, nu un eșec.

### 3.3 413 scris, apoi socket-ul distrus — ajunge răspunsul la client?

`body.js` scrie răspunsul 413 și imediat apelează `req.destroy()`. Există riscul real ca socket-ul să se închidă înainte ca răspunsul să plece efectiv, iar clientul să vadă **ECONNRESET în loc de 413**.

Nu e teoretic: oracolul de pe baseline a lovit exact `ECONNRESET` într-o sondă similară.

Testează **din perspectiva clientului**: cere ca un client real să *primească* statusul 413. Nu te mulțumi să verifici că serverul a apelat `writeHead(413)`. Dacă clientul primește ECONNRESET, e o constatare de raportat, nu un test de ajustat până trece.

### 3.4 `createServer()` singur respinge tot ce e sub `/api/`

`createServer()` fără `port` construiește un set **gol** de origini permise — deci orice cerere `/api/` primește 403 până când `startServer` îl rescrie după `listen`.

E sigur implicit, și intenționat. Dar un test care apelează `createServer()` și face `listen()` manual va primi 403 peste tot și va părea că verificarea de origine e spartă, când de fapt e doar neinițializată.

**Folosește `startServer`.** Dacă vrei totuși să testezi `createServer` izolat, pinuiește explicit acest comportament ca fiind cel dorit.

---

## 4. Fișiere

### Ai voie să modifici sau să creezi

- `test/api-open.test.mjs`, `test/server.test.mjs`, `test/state.test.mjs`
- fișiere noi de test sub `test/` — de exemplu `test/http-guards.test.mjs`, `test/body.test.mjs`
- fixtures noi sub `test/fixtures/`

### NU ai voie să atingi

- **`server.js`, `state.js`, `body.js`, `server/http-guards.js`** — codul de producție e al coder-ului. Dacă găsești un bug, **îl raportezi, nu îl repari**. Un tester care repară codul pe care îl testează nu mai testează nimic.
- `status.js`, `rank.js`, `public/**`
- `data/`, `.env`, `assets/`, `public/sprites/`, `public/ui/`
- `package.json`
- Orice document de coordonare: `instructiuni.md`, `AGENTS.md`, `TASKS.md`, `GATES.md`, `plan.md`, `spec.md`, `intent.md`, `HANDOFF.md`, `docs/**` cu excepția propriului raport

---

## 5. Reguli de calitate a testelor

Reviewer-ul va căuta explicit aceste lucruri. Sunt motivele obișnuite pentru care un lot e respins:

- **Fără aserțiuni tautologice.** `assert.ok(res)` nu dovedește nimic. Verifică status, body și **efectul pe disc**, unde există.
- **Fără teste care ar fi trecut și pe codul vechi.** Fiecare regresie din §2.3 trebuie să distingă cele două versiuni. Dacă nu poți construi un astfel de test pentru un defect, spune-o — e mai valoros decât un test decorativ.
- **Nu codifica brief-ul, testează produsul.** Un test care verifică doar că un mesaj de eroare are un anumit text nu dovedește că validarea funcționează.
- **Fără porturi fixe. Fără directoare reale. Fără procese reale. Fără ceasuri reale acolo unde rezultatul depinde de timp.**
- **Fiecare test își curăță după el** și poate rula independent de ordine.
- Teste negative **și** pozitive: că lucrul greșit e respins, dar și că lucrul corect încă merge. Un fix care blochează totul nu e un fix.

---

## 6. Rezultatul așteptat

### Raportul

`docs/handoff/RF-01-tester-raport.md`:

```
## Ce am acoperit
Pe defect (D1–D12): ce test, ce fișier, ce dovedește, și de ce
ar fi eșuat pe codul vechi.

## Contractele pinuite
Ce am fixat din §2.4 și §3.4.

## Ce am găsit și nu am putut repara
Bug-uri în codul de producție. NU le repari. Le descrii aici: ce ai
observat, ce test le expune, cât de grav pare.

## Ce nu am putut testa
Inclusiv capcanele din §3 pe care le-ai încercat și nu le-ai putut
reproduce. Spune ce ai încercat.

## Migrarea testelor existente
Ce am schimbat în cele trei fișiere și ce acoperire am păstrat.
Dacă am eliminat vreo aserțiune, de ce.

## Contradicții găsite în brief
Dacă niciuna, scrie „niciuna”.
```

---

## 7. Constrângeri dure

- **Nu rulezi comenzi.** Nici `node --test`, nici `npm`, nici `git`.
- **Nu poți afirma că testele trec.** Nu le-ai rulat și nu ai cum. Planner-ul le rulează și raportează rezultatul real. Scrie „am scris un test care verifică X”, niciodată „X trece” sau „suita e verde”.
- **Nu modifici codul de producție**, nici măcar o linie, nici măcar „ca să meargă testul”.
- **Nu delega.** Nu porni alți agenți.
- Nu citi și nu reproduce `.env`, secrete sau conținut din `data/`.
- **Limbă:** română, în teste și în raport.

### Citește înainte să începi

1. `docs/handoff/RF-01-oracol-baseline.md` — ce s-a observat pe fiecare defect, înainte de fix
2. `docs/handoff/RF-01-coder-raport.md` — ce a implementat coder-ul, deciziile lui și zonele pe care le consideră fragile
3. `server.js`, `state.js`, `body.js`, `server/http-guards.js` — integral
4. Cele trei fișiere de test pe care le migrezi
