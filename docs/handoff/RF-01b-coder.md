# RF-01b — brief coder, corecție D8 + unhandledRejection

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Context:** corecție în cadrul lotului RF-01, nu lot nou. Livrarea ta anterioară: `docs/handoff/RF-01-coder-raport.md`.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect. `plan.md` este înlocuit — nu îl cita.

---

## 1. Ce s-a măsurat

Planner-ul a rulat suita completă (**249 de teste: 245 trec, 4 eșuează**) și un oracol invers care reia pe codul tău cele 12 sonde care confirmaseră defectele pe baseline.

Din cele 4 eșecuri, **3 sunt ale tale** (două cu aceeași rădăcină). Al patrulea e o așteptare greșită în test și merge la tester — nu te preocupă.

Restul e bine: 11 din 12 defecte confirmate reparate, inclusiv traversal-ul, originea, CAS-ul, reviziile monotone și schema. Nu reface nimic din ce merge.

---

## 2. Bug 1 — răspunsul 413 nu ajunge la client, și otrăvește conexiunea

### Ce face codul acum

În `body.js`, pe **ambele** căi de refuz:

```js
res.writeHead(413, { 'Content-Type': 'application/json' });
res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
req.destroy();
```

### Simptomul 1 — pe calea de acumulare, clientul primește ECONNRESET

```
✖ body real peste 1 MiB, trimis fără Content-Length (chunked) -> 413 la acumulare
  așteptam 413, am primit: {"error":"ECONNRESET"}
```

Oracolul invers al planner-ului a măsurat același lucru, independent.

**Notă importantă, ca să nu cauți în locul greșit:** pe calea cu `Content-Length` declarat peste plafon, lucrurile merg — testul „client real: la Content-Length peste plafon, primește STATUS 413 (nu ECONNRESET)" **trece**. Diferența e că acolo refuzi înainte să curgă octeți. Pe calea de acumulare, clientul e în plin transfer când închizi socketul, iar stiva TCP trimite RST peste datele necitite din buffer.

### Simptomul 2 — cererea următoare, perfect legitimă, eșuează

```
✖ Content-Length sub plafon -> nu e respins la acest gate (trece la citirea body-ului)
  undefined !== 200
```

Acest test **trece când e rulat singur** și pică doar când rulează după cel de 413. Planner-ul a verificat asta explicit.

Cauza: răspunsul tău 413 **nu declară `Connection: close`**. Agentul HTTP al clientului (keep-alive implicit în Node 19+) consideră socketul reutilizabil și îl pune înapoi în pool — dar tu l-ai distrus. Următoarea cerere îl refolosește și primește ECONNRESET.

Deci nu sunt două bug-uri. E unul singur, cu două fețe: **închizi conexiunea fără să spui nimănui că ai închis-o.**

### Contractul cerut

- Un client care trimite un body peste plafon **primește status 413** și îl poate citi — pe **ambele** căi, cu și fără `Content-Length`.
- După un 413, **următoarea cerere pe aceeași conexiune logică reușește**. Un refuz nu are voie să strice cererile de după el.
- Serverul **nu acumulează** peste plafon. Refuzul rămâne refuz, nu devine „citesc tot, apoi mă plâng".
- Conexiunea se închide după ce răspunsul a plecat efectiv, nu în aceeași instrucțiune.

### Direcția

Semnalează închiderea în răspuns (`Connection: close`), ca partea cealaltă să nu mai considere socketul reutilizabil. Închide abia după ce răspunsul s-a golit pe fir — `res.end()` acceptă un callback care se execută la flush.

Pentru octeții care continuă să vină după refuz: nu îi acumula, dar nu-i ignora nici — un socket cu date necitite în buffer produce RST la închidere pe majoritatea stivelor TCP. Drenează-i și aruncă-i, cu o limită de timp sau volum, ca un client ostil să nu te țină ocupat.

Dacă găsești ceva mai bun, folosește-l și explică în raport. Contractul e ce se testează; drumul e al tău.

**Nu** rezolva ridicând plafonul. **Nu** scoate `req.destroy()` fără altceva în loc — ai lăsa socketul să curgă.

---

## 3. Bug 2 — `unhandledRejection` care poate omorî procesul

Semnalasem riscul ca ipoteză în brief-ul tester-ului (§3.2). Tester-ul a scris o probă și **l-a confirmat**:

```
✖ handlePutState: dacă res.writeHead(200,...) aruncă DUPĂ o scriere reușită,
  promisiunea internă a cozii rămâne respinsă și neprinsă
  Error: simulat: headers already sent
      at state.js:231
```

### Ce e greșit

În `state.js`, `handlePutState`:

```js
serialise(() => {
  const current = readState();
  if (...) { ...; return; }

  let next;
  try {
    next = persist({...});
  } catch (e) {
    res.writeHead(500, ...);   // <-- protejat
    res.end(...);
    return;
  }

  res.writeHead(200, ...);      // <-- linia 231, NEPROTEJATĂ
  res.end(JSON.stringify(next));
});
```

Ai pus `try/catch` în jurul lui `persist()` — corect, asta era D11. Dar răspunsul de succes e **în afara** lui. Dacă `res.writeHead(200)` aruncă — headere deja trimise, socket închis între timp, client deconectat — excepția iese din funcția serializată, `writeQueue` devine o promisiune respinsă, iar `handlePutState` **ignoră valoarea întoarsă de `serialise`**, deci nimeni nu o prinde.

Node 24 termină procesul la `unhandledRejection`. Un client care închide conexiunea în momentul nepotrivit poate opri serverul.

### Contractul cerut

- Nicio cale din `handlePutState` nu lasă o promisiune respinsă neprinsă, indiferent ce aruncă înăuntru.
- Un client care se deconectează la mijloc nu poate provoca oprirea procesului.
- Lanțul cozii rămâne utilizabil după un astfel de eșec: **o scriere ulterioară, validă, încă funcționează.** Ăsta e testul real.
- Nu înghiți eroarea în tăcere dacă e simptomul unui bug — dar nu o lăsa nici să iasă din coadă.

Verifică dacă același tipar există și pe alte căi din `state.js` sau `server.js`, nu doar la linia 231.

---

## 4. Fișiere

**Poți modifica:** `body.js`, `state.js`. Dacă e nevoie de ceva minim în `server.js` pentru propagarea unui semnal, fă-o și explică în raport.

**NU atinge:** `test/**` (sunt ale tester-ului), `server/http-guards.js` (nu are defecte), `status.js`, `rank.js`, `public/**`, `data/`, `.env`, `assets/`, documentele de coordonare.

---

## 5. Raportul

Adaugă la `docs/handoff/RF-01-coder-raport.md` o secțiune nouă la final, **fără să rescrii** ce era deja acolo:

```
## RF-01b — corecție D8 + unhandledRejection

### Bug 1 — 413 și conexiunea
Ce am schimbat, de ce rezolvă ambele simptome:
Ce soluții am respins și de ce:

### Bug 2 — unhandledRejection
Ce am schimbat:
Alte locuri cu același tipar pe care le-am găsit (sau confirmarea că nu există):

### Ce rămâne nerezolvat, dacă ceva:
```

---

## 6. Constrângeri

- Nu rulezi comenzi. Nu poți verifica singur — planner-ul reia suita și oracolul invers.
- Nu scrii teste. Nu afirma că ceva „trece" sau „merge acum".
- Nu delega.
- Română, în cod și raport.

### Citește înainte

1. `body.js` și `state.js` (în special `handlePutState`) — integral
2. `docs/handoff/RF-01-tester.md` §3.2 și §3.3 — ambele riscuri, formulate ca ipoteze înainte de a fi măsurate
3. `test/body.test.mjs` și `test/state-store.test.mjs` — **doar ca să înțelegi ce se măsoară.** Nu le modifica.
