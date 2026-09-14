# RF-01c — brief coder, D8 rămâne intermitent

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Context:** a treia rundă pe D8, în cadrul lotului RF-01. Rapoartele tale: `docs/handoff/RF-01-coder-raport.md`.

---

## 1. Măsurătoarea

Suita completă după corecția ta: **255 de teste, 253 trec, 2 pică.**

Unul dintre cele două e inversiunea așteptată pe care ai semnalat-o corect (`state-store.test.mjs` afirmă *prezența* bugului pe care l-ai reparat) — a plecat deja la tester. Nu te privește.

Celălalt e al tău, și **aveai dreptate cu riscul de cursă**:

```
12 rulări ale test/body.test.mjs:
  trecut : 11
  eșuat  :  1        -> 8% rată de eșec
  eroare : {"error":"ECONNRESET"}
```

Rulat izolat (doar testele „chunked"), trece 5 din 5. Rulat cu tot fișierul, pică intermitent.

### Ce înseamnă asta

Corecția ta a fost un progres real: D8 era **100% eșec**, acum e 8%. Calea cu `Content-Length` e complet reparată. Dar 8% rămâne eșec, nu „aproape reparat".

Un test instabil pe o cale de securitate e mai rău decât unul roșu: pe roșu te uiți, pe intermitent înveți să dai re-run. `AGENTS.md` interzice explicit slăbirea aserțiunii ca să obții verde, deci nu rezolvăm asta din test.

---

## 2. Unde e cursa

Diagnosticul tău din raport e corect: `Connection: close` face Node să programeze intern închiderea socketului, iar asta poate depăși drenajul tău manual când mai sunt octeți în tranzit.

Observația care cred că e cheia: **`destroy()` trimite RST, `end()` trimite FIN.**

- RST rupe conexiunea în ambele sensuri, imediat. Tot ce nu a apucat să plece se pierde — inclusiv răspunsul tău 413, dacă nu s-a golit încă pe fir. Clientul vede `ECONNRESET`.
- FIN închide doar sensul de scriere al serverului. Clientul poate **în continuare să citească** ce i-ai trimis deja. Dacă mai scrie, primește `EPIPE` pe scriere — dar răspunsul pe care l-a primit rămâne citibil.

Pentru cazul nostru, clientul trebuie să poată citi 413-ul chiar dacă tocmai i-am tăiat dreptul de a mai trimite. Asta e exact ce face un half-close, și exact ce nu face un reset.

Explorează direcția: după ce răspunsul s-a golit efectiv (evenimentul `finish` pe `res`, nu doar callback-ul lui `end`), închide sensul de scriere cu un half-close în loc de distrugere brutală. Păstrează un plafon de timp ca ultimă plasă, dar el trebuie să fie excepția, nu mecanismul principal.

Ia în calcul și **backpressure-ul**: `req.pause()` oprește citirea la nivel TCP, iar clientul încetinește singur. Un client pus în pauză înainte de a răspunde nu mai are octeți în zbor care să provoace RST la închidere.

Dacă găsești o soluție mai bună decât ce sugerez aici, folosește-o. Eu am măsurat simptomul; mecanismul exact e al tău.

### Criteriul de acceptare

**`test/body.test.mjs` trece de 12 ori din 12, rulat ca fișier întreg.** Planner-ul va rula exact asta.

Nu „de obicei trece". Nu „e o limitare cunoscută a TCP". Dacă ajungi la concluzia că 100% e imposibil fără să citești tot body-ul, **spune asta explicit în raport, cu argumentul tehnic** — și atunci decid eu dacă acceptăm limitarea și o documentăm, sau schimbăm contractul. Nu decide tu singur să o accepți.

---

## 3. Fișiere

**Poți modifica:** `body.js`. Dacă e nevoie de ceva minim în `server.js` sau `state.js`, fă-o și explică.

**NU atinge:** `test/**` (tester-ul lucrează chiar acum în `state-store.test.mjs`), `server/http-guards.js`, `status.js`, `rank.js`, `public/**`, `data/`, `.env`, `assets/`, documentele de coordonare.

---

## 4. Raportul

Adaugă la `docs/handoff/RF-01-coder-raport.md` o secțiune `## RF-01c`, fără să rescrii nimic dinainte:

```
Ce am schimbat față de RF-01b și de ce elimină cursa:
De ce cred că e acum determinist (nu doar „mai rar"):
Dacă nu e determinist: argumentul tehnic pentru care 100% e imposibil,
  și ce contract alternativ propui:
```

---

## 5. Constrângeri

- Nu rulezi comenzi. Rata de 8% a fost măsurată de planner; tu nu o poți verifica.
- Nu scrii teste. Nu afirma că „acum trece".
- Nu delega.
- Română.

### Citește înainte

1. `body.js` — integral, în special `rejectTooLarge` și `drainAndClose`
2. Propriul raport RF-01b — diagnosticul tău despre cursă era corect; pornește de acolo
