# RF-01b — brief tester, corecție așteptare D4

**Data:** 15-09-2026, EET.
**Rol:** tester. **Nu rulezi comenzi. Nu modifici codul de producție.**
**Context:** corecție în cadrul lotului RF-01. Livrarea ta anterioară: `docs/handoff/RF-01-tester-raport.md`.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect. `plan.md` este înlocuit — nu îl cita.

---

## 1. Rezultatul rulării

Planner-ul a rulat suita completă: **249 de teste, 245 trec, 4 eșuează.**

Trei eșecuri sunt bug-uri reale în codul de producție și au plecat deja la coder (D8 pe calea de acumulare, otrăvirea socketului keep-alive, și `unhandledRejection` la `state.js:231` — pe care **tu** l-ai găsit și confirmat, corect).

**Al patrulea e o așteptare greșită în testul tău.** Atât ai de reparat.

---

## 2. Ce e greșit

```
✖ test/server.test.mjs:342
  D4 (HTTP): GET /../public-secret/leak.txt -> 403, conținutul secretului nu apare în răspuns
  404 !== 403
```

Testul cere 403. Serverul dă 404. **Serverul are dreptate.**

### De ce

Planner-ul a verificat direct cum se comportă parsarea URL-ului:

```
cerut:      "/../public-secret/leak.txt"
  pathname: "/public-secret/leak.txt"      <-- „..” a dispărut

cerut:      "/..%2Fpublic-secret%2Fleak.txt"
  pathname: "/..%2Fpublic-secret%2Fleak.txt"
  decodat:  "/../public-secret/leak.txt"   <-- „..” a supraviețuit
```

`new URL()` **normalizează singur** segmentele `..` din calea neîncodată. Când cererea ajunge la `resolveStaticPath`, pathname-ul e deja `/public-secret/leak.txt` — o cale perfect normală, care se rezolvă **înăuntrul** lui `public/`, la `public/public-secret/leak.txt`. Fișierul acela nu există. **404 e răspunsul onest.**

Varianta codată e alta: `%2F` supraviețuiește normalizării, e decodat mai târziu, iar `..` ajunge intact la verificarea de containment — care îl prinde și dă 403. Corect.

Deci ambele variante sunt sigure, prin mecanisme diferite, cu coduri diferite.

### Ce a mers prost în test

Brief-ul meu anterior spunea „dacă nu trece containment-ul → 403", iar tu ai codificat asta literal. Dar în cazul direct, cererea **nu ajunge niciodată** la containment — e neutralizată mai devreme.

E exact tiparul pe care ți-l ceream să-l eviți la §5: *„Nu codifica brief-ul, testează produsul."* Nu e o greșeală gravă, și brief-ul era înșelător. Dar merită numită, fiindcă testul afirma o mecanică internă în loc de proprietatea care contează.

---

## 3. Ce trebuie să faci

Rescrie testul ca să verifice **proprietatea de securitate**, nu codul de status exact:

- conținutul secret **nu apare** în răspuns — asta e ce contează;
- statusul **nu e 200**;
- și, separat, pinuiește mecanismul real al fiecărei variante, cu un comentariu care explică *de ce* diferă:
  - `/../public-secret/leak.txt` → **404** (normalizat de `new URL`, cerere pentru un fișier inexistent sub `public/`)
  - `/..%2Fpublic-secret%2Fleak.txt` → **403** (`..` supraviețuiește, prins de containment)
  - varianta cu backslash → ce dă efectiv, cu explicația

Dacă vrei un singur test pentru proprietate și altul pentru mecanisme, e în regulă. Nu slăbi aserțiunea pe conținut: verificarea că secretul nu apare în body rămâne obligatorie în toate cazurile.

**Nu** schimba testul ca să accepte orice status. „Nu e 200" plus „conținutul lipsește" e minimul; mecanismele se pinuiesc separat.

Verifică dacă același tipar — test care afirmă codul de status în loc de proprietate — mai apare și în alte locuri din `server.test.mjs` sau `http-guards.test.mjs`. Dacă da, repară-le la fel.

---

## 4. Fișiere

**Poți modifica:** `test/server.test.mjs`, `test/http-guards.test.mjs`.

**NU atinge:** `body.js`, `state.js`, `server.js`, `server/http-guards.js` — coder-ul lucrează **chiar acum** în `body.js` și `state.js`. Un writer per suprafață.
`test/body.test.mjs` și `test/state-store.test.mjs` — testele tale de acolo sunt corecte și măsoară bug-uri reale care se repară în paralel. Lasă-le exact cum sunt; trebuie să rămână roșii până când coder-ul livrează.

---

## 5. Raportul

Adaugă la `docs/handoff/RF-01-tester-raport.md` o secțiune nouă la final, fără să rescrii ce era deja acolo:

```
## RF-01b — corecție așteptare D4

Ce am schimbat și de ce noua aserțiune e mai bună:
Alte teste cu același tipar pe care le-am găsit (sau confirmarea că nu există):
```

---

## 6. Constrângeri

- Nu rulezi comenzi. Nu poți afirma că testele trec — planner-ul le rulează.
- Nu modifici codul de producție, nici măcar o linie.
- Nu delega.
- Română.
