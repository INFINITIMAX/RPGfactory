# RF-01 — brief coder

**Data:** 14-09-2026, EET.
**Rol:** coder. Scrii implementarea. **Nu rulezi comenzi. Nu scrii teste.**
**Lot:** RF-01 — izolare server/teste + siguranță HTTP, static, input și salvare.
**Autorizat:** gate G4a. Vezi `GATES.md`.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect. Dacă acest brief îl contrazice, `instructiuni.md` câștigă — semnalează contradicția în raportul tău, nu o rezolva tăcut.

---

## 1. Sarcina

Repari **10 defecte confirmate** în `server.js` și `state.js`. Nu sunt ipoteze: fiecare a fost reprodus pe baseline înainte de a-ți scrie acest brief. Dovada completă, cu ce s-a observat efectiv, e în `docs/handoff/RF-01-oracol-baseline.md` — **citește-o**, e contextul care îți spune de ce fiecare fix contează.

Obiectivul lotului, în două propoziții: aplicația trebuie să poată fi pornită și testată fără să atingă datele reale ale utilizatorului sau să lanseze programe. Suprafața HTTP nu trebuie să servească fișiere din afara `public/`, să accepte origini greșite, să înghită payload-uri nelimitate sau să piardă scrieri.

### Defectele, cu fix-ul cerut

| ID | Defect confirmat | Ce trebuie să faci |
|---|---|---|
| **D1** | `require("./server.js")` pornește singur un listener și citește `~/.claude/sessions` | Separă construcția de pornire. Importul modulului nu trebuie să deschidă porturi, să citească home-ul sau să lanseze nimic. |
| **D2** | `server.listen(PORT)` ascultă pe `::` (toate interfețele) | Bind implicit pe loopback. Configurabil, dar niciodată wildcard din greșeală. |
| **D3** | `Origin: http://localhost:9999` acceptat la mutație (portul e ignorat) | Validează **originea completă** — schemă, host **și port** — nu doar hostname-ul. |
| **D4** | `GET /../public-secret/x` servește fișiere din directorul frate | Containment real de director, nu `startsWith` pe prefix de șir. |
| **D5** | `baseUpdatedAt: 0` suprascrie starea existentă fără 409 | Zero nu mai e „sări peste verificare”. Vezi contractul CAS de mai jos. |
| **D6** | `archived` ca obiect și `archivedAt` ca string se persistă pe disc | Validare de schemă înainte de scriere. Input invalid → 400, starea rămâne neatinsă. |
| **D7** | Revizia e `Date.now()`; două scrieri în același ms devin indistinctibile | Revizie monotonă, nu ceas de perete. |
| **D8** | Body de 8 MB acceptat fără limită | Plafon de dimensiune, cu 413 la depășire. |
| **D9** | `GET /app.js?v=1` → 404 (query-ul intră în numele fișierului) | Parsează URL-ul; rutează și servește după `pathname`. |
| **D10** | `DELETE /api/agents` → 200 cu lista de agenți | Verifică metoda per rută; 405 la metodă greșită. |

În plus, două probleme identificate în cod dar netestate încă — repară-le și pe ele:

- **D11** — `writeState` aruncă sincron în interiorul `serialise()`. La o eroare de disc (permisiuni, disc plin) promisiunea e prinsă de lanțul de coadă, dar **răspunsul HTTP nu mai e trimis niciodată** — request-ul atârnă până la timeout. Orice eroare de I/O trebuie să producă un răspuns (500), nu un request abandonat.
- **D12** — `launchTarget` apelează direct `spawn('rundll32', ...)` la nivel de modul. Trebuie să devină dependență injectabilă, ca testele să nu lanseze programe reale.

---

## 2. Contractele exacte

Acestea sunt decizii de planner. **Nu le schimba** — tester-ul scrie testele pe baza lor, iar dacă diverg, testele lui vor testa altceva decât ai construit tu. Dacă vreuna ți se pare greșită, spune în raport, nu improviza.

### 2.1 `server.js` — API-ul modulului

```js
// construiește, NU pornește. Fără efecte secundare.
function createServer(options = {}) -> http.Server

// construiește și pornește. Întoarce o promisiune.
function startServer(options = {}) -> Promise<{ server, address, port, close() }>

module.exports = { createServer, startServer };
```

Entrypoint explicit, la finalul fișierului:

```js
if (require.main === module) {
  startServer().catch((e) => { console.error(e); process.exit(1); });
}
```

`options`, toate cu valori implicite:

| Opțiune | Implicit | Rol |
|---|---|---|
| `port` | `process.env.PORT || 5311` | Portul. `0` înseamnă efemer — testele îl folosesc. |
| `host` | `'127.0.0.1'` | **Loopback implicit.** Niciodată wildcard fără cerere explicită. |
| `publicDir` | `path.join(__dirname, 'public')` | Rădăcina fișierelor statice. |
| `sessionsDir` | `path.join(os.homedir(), '.claude', 'sessions')` | Citit **numai la cerere**, nu la import. |
| `dataDir` | `path.join(__dirname, 'data')` | Transmis mai departe la state store. |
| `now` | `() => Date.now()` | Ceas injectabil. |
| `opener` | opener-ul real | `(target) => void`. În teste, substituit. |
| `isAlive` | sonda reală de PID | `(pid) => boolean`. În teste, substituit. |

`startServer` trebuie să rezolve **după** ce serverul ascultă efectiv, și să întoarcă portul real alocat (`server.address().port`) — esențial pentru portul efemer `0`.

`close()` închide serverul și rezolvă când s-a închis.

### 2.2 Originea și bind-ul (D2, D3)

Construiește setul de origini permise din host-ul și portul pe care serverul **chiar** ascultă, după `listen`:

```
http://localhost:<port>
http://127.0.0.1:<port>
http://[::1]:<port>
```

Reguli:
- Header-ul `Host` trebuie să se potrivească exact pe **host și port** cu una dintre ele. Hostname-ul singur nu e suficient.
- Pentru **mutații** (POST, PUT, DELETE, PATCH) `Origin` este **obligatoriu** și trebuie să fie exact una dintre originile permise. Lipsă sau nepotrivire → **403**.
- Pentru GET/HEAD, `Origin` absent e acceptat (navigare normală). Prezent și nepotrivit → 403.
- **Elimină lista de adrese LAN** (`os.networkInterfaces()`, liniile 18-22 actuale). E sursa directă a D3 și contrazice bind-ul loopback.

### 2.3 Fișiere statice (D4, D9)

1. Parsează: `const url = new URL(req.url, 'http://localhost')`. Rutează și servește după `url.pathname`, niciodată după `req.url` brut.
2. Decodează `pathname` (`decodeURIComponent`). Dacă decodarea aruncă → 400.
3. `/` → `/index.html`.
4. Rezolvă: `const resolved = path.resolve(publicDir, '.' + pathname)`.
5. **Containment real:**
   ```js
   const root = path.resolve(publicDir);
   const ok = resolved === root || resolved.startsWith(root + path.sep);
   ```
   `resolved` trebuie să fie *sub* rădăcină, nu doar să înceapă cu șirul ei. `public-secret` nu mai trece, pentru că `D:\RPGfactory\public-secret` nu începe cu `D:\RPGfactory\public\`.
6. Respinge orice pathname care conține un byte nul.
7. Dacă nu trece containment-ul → 403. Fișier inexistent → 404. Director → 404, nu listare.

**Politica symlink/junction:** pentru RF-01, **nu** urmărim link-urile. Verificarea se face pe calea rezolvată lexical (`path.resolve`), fără `fs.realpath`. Consemnează asta explicit ca limitare cunoscută în raportul tău — un junction plasat în `public/` ar putea încă scoate din rădăcină. E o decizie conștientă de domeniu, nu o scăpare; se reia când adăugăm politica de link-uri.

### 2.4 Rutarea și metodele (D10)

| Rută | Metode permise | Altfel |
|---|---|---|
| `/api/agents` | GET, HEAD | 405 + header `Allow` |
| `/api/open` | POST | 405 + `Allow` |
| `/api/reveal` | POST | 405 + `Allow` |
| `/api/new-session` | POST | 405 + `Allow` |
| `/api/state` | GET, PUT | 405 + `Allow` |
| orice altceva | GET, HEAD (static) | 405 |

Verificarea de origine se aplică **înaintea** rutării, pentru orice cale sub `/api/`, comparată pe `url.pathname` (nu pe `req.url`, altfel `/api/agents?x=1` scapă).

### 2.5 Body (D8)

- Plafon: **1 MiB** (1.048.576 de octeți) pentru orice request cu body. Constantă exportată sau clar numită.
- Măsoară pe octeți acumulați, nu pe lungimea șirului.
- La depășire: răspunde **413**, oprește acumularea și distruge cererea. Nu aștepta să se termine transferul.
- `Content-Length` prezent și peste plafon → 413 imediat, fără să citești body-ul.
- JSON invalid → 400. Body gol pe o rută care cere JSON → 400.

### 2.6 `state.js` — API-ul modulului

```js
function createStateStore(options = {}) -> {
  readState(),                    // -> obiect stare
  writeState(patch),              // -> starea nouă; aruncă la eroare de I/O
  handleGetState(req, res),
  handlePutState(req, res),
}

module.exports = { createStateStore };
```

`options`: `dataDir` (implicit `path.join(__dirname, 'data')`), `now` (implicit `() => Date.now()`).

**Nicio cale de fișier nu mai e constantă de modul.** `DATA_DIR`/`STATE_FILE` se calculează per store. Asta e ce permite testelor să folosească directoare temporare — și e motivul pentru care testul actual șterge starea reală.

Coada de scriere serializată (`writeQueue`) devine per store, nu globală.

### 2.7 Contractul CAS (D5, D7) — citește cu atenție

**Revizia `updatedAt` devine un contor monoton, nu un timestamp.**

Păstrăm numele câmpului `updatedAt` pentru că `public/app.js` îl trimite înapoi ca `baseUpdatedAt` — frontend-ul **nu** se atinge în RF-01 (e treabă de RF-04). Se schimbă doar semantica valorii.

```js
const nextRev = Math.max(Number(current.updatedAt) || 0, 0) + 1;
```

Nu e nevoie de migrare: un fișier existent are un timestamp mare, iar incrementarea pornește de acolo și rămâne monotonă.

Adaugă `savedAt` (ISO string, din `now()`) pentru afișare umană. Nu îl folosi niciodată pentru CAS.

**Starea goală are `updatedAt: 0`.**

Reguli pentru PUT:

| Situație | Rezultat |
|---|---|
| `baseUpdatedAt` lipsește sau nu e număr | **400** — câmp obligatoriu |
| `baseUpdatedAt === current.updatedAt` | scrierea trece; noua revizie e `current + 1` |
| `baseUpdatedAt !== current.updatedAt` | **409**, cu starea curentă în body |

Consecința care repară D5: dacă nu există stare pe disc, `current.updatedAt` e `0`, deci un client cu `baseUpdatedAt: 0` **poate** scrie prima dată. Dacă starea există cu revizia 5, un client cu bază `0` primește **409** în loc să o distrugă. Prima scriere legitimă rămâne posibilă; suprascrierea oarbă nu.

Citirea stării curente și scrierea trebuie să rămână în aceeași secțiune serializată — altfel verificarea și scrierea pot fi despărțite de altă cerere.

### 2.8 Schema (D6)

Validează **înainte** de orice scriere. La eșec: **400**, cu un mesaj care spune ce câmp e greșit, și **starea de pe disc rămâne neatinsă**.

| Câmp | Cerință |
|---|---|
| `archived` | array de string-uri; maximum 10.000 de elemente; fiecare cel mult 512 de caractere |
| `archivedAt` | obiect simplu; chei string; valori numere finite; maximum 10.000 de chei |
| `plots` | obiect simplu; serializat cel mult 512 KiB; adâncime maximă 8 |
| `version` | dacă e prezent, exact `1` |
| `baseUpdatedAt` | număr finit (vezi 2.7) |

Respinge câmpurile necunoscute în loc să le persiste. Respinge `__proto__`, `constructor`, `prototype` ca nume de chei, în `archivedAt` și în `plots`.

### 2.9 Erori de I/O (D11)

Orice `writeState` care aruncă (permisiuni, disc plin, rename eșuat) trebuie să producă **500** cu un body JSON, o singură dată. Nicio cerere nu rămâne fără răspuns. Lanțul de coadă nu trebuie să se rupă: o scriere eșuată nu împiedică scrierile următoare.

Fișierele temporare rămase după un rename eșuat: încearcă să le cureți, dar nu lăsa curățenia să arunce peste eroarea originală.

### 2.10 Opener (D12)

```js
function defaultOpener(target) {
  const child = spawn('rundll32', ['url.dll,FileProtocolHandler', target], {
    stdio: 'ignore', detached: true,
  });
  child.on('error', () => {});
  child.unref();
}
```

Se transmite prin `options.opener` și se folosește **numai** prin acea referință. Fără `shell: true`. Ținta rămâne validată ca acum (`resolveFolder` pentru căi, `sessionId` verificat ca string nevid) — dar validarea `sessionId` se întărește: respinge orice conține caractere de control sau `\r`/`\n`.

---

## 3. Fișiere

### Ai voie să modifici

- `server.js`
- `state.js`
- `package.json` — **numai** dacă e nevoie de un script de test sau de câmpul `engines`. Fără dependențe noi.

### Ai voie să creezi

Module mici auxiliare, **doar dacă** simplifică vizibil responsabilitățile — de exemplu `server/http-guards.js` pentru validarea de origine și containment-ul static. Fără infrastructură generică, fără abstracții „pentru viitor”, fără framework de rutare propriu. Dacă nu ești sigur că un fișier nou plătește, nu-l crea.

### NU ai voie să atingi

- **`test/**`** — testele sunt ale tester-ului. Vor fi rupte de schimbările tale; asta e așteptat și e treaba lui să le adapteze. Nu le repara.
- **`public/**`** — frontend-ul e RF-04. Contractul CAS e proiectat special ca `app.js` să nu necesite modificări.
- **`status.js`, `rank.js`** și funcția **`readAgents`** din `server.js`, dincolo de a o face să primească `sessionsDir` și `isAlive` prin injecție. Proiecția activității (defectul F01 din audit) aparține **RF-03**. Nu o repara aici, oricât de tentant ar fi — review-ul RF-00-R a cerut explicit ca acest lucru să-ți fie spus.
- `data/`, `.env`, `assets/`, `public/sprites/`, `public/ui/`
- Orice document de coordonare: `instructiuni.md`, `AGENTS.md`, `TASKS.md`, `GATES.md`, `plan.md`, `spec.md`, `intent.md`, `HANDOFF.md`, `docs/**`

---

## 4. Rezultatul așteptat

### Codul

Implementarea completă a secțiunii 2. Stil: potrivește-te cu ce e deja acolo — CommonJS, comentarii în română care explică **de ce**, nu ce. Fișierele existente au comentarii bune; scrie la același nivel, fără să le îngroși inutil.

Nu lăsa cod mort. Dacă o funcție nu mai e folosită după refactorizare, șterge-o.

### Raportul

`docs/handoff/RF-01-coder-raport.md`. Structura:

```
## Ce am implementat
Pe defect (D1–D12): ce am schimbat, unde, și de ce am ales soluția asta.

## Decizii pe care le-am luat singur
Orice loc unde brief-ul nu acoperea un caz și a trebuit să aleg.
Spune ce ai ales și ce alternativă ai respins.

## Ce nu am făcut și de ce
Inclusiv limitările consemnate explicit (symlink/junction, §2.3).

## Riscuri pentru tester
Ce se va rupe în testele existente și de ce. Ce ar trebui verificat
cu atenție specială. Unde bănuiești că implementarea ta e cea mai fragilă.

## Contradicții găsite în brief
Dacă n-ai găsit niciuna, scrie „niciuna”.
```

Ultima secțiune contează. Dacă ai găsit ceva greșit în contractele de mai sus și l-ai implementat totuși ca atare, spune. Dacă ai deviat, spune unde și de ce.

---

## 5. Constrângeri dure

- **Nu rulezi comenzi.** Nici `node`, nici `npm`, nici `git`, nici teste. Nu ai cum să verifici că merge — nu pretinde că ai verificat.
- **Nu scrii teste.** Rolul tester-ului urmează după tine.
- **Nu afirma că ceva „trece” sau „funcționează”.** Poți spune „am implementat X astfel încât să satisfacă Y”. Nu poți spune „X funcționează”.
- **Nu delega.** Nu porni alți agenți.
- Nu citi și nu reproduce `.env`, secrete, tokenuri sau conținut din `data/`.
- **Limbă:** română, în cod și în raport.

### Citește înainte să începi

1. `docs/handoff/RF-01-oracol-baseline.md` — ce s-a observat efectiv, pe fiecare defect
2. `server.js` și `state.js` — integral
3. `AGENTS.md` §„Lecții recurente din audit”
4. `plan.md` §2 — criteriile de acceptare ale lotului
