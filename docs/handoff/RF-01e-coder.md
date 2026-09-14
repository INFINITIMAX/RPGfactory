# RF-01e — brief coder, D8: cazul real nu era acoperit de niciun test

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Context:** a cincea rundă pe D8. Ultima, dacă designul de mai jos e implementat ca atare.

---

## 1. Vestea bună întâi

**Suita trece: 257 din 257, exit 0, de 3 ori din 3. `test/body.test.mjs` trece 12 din 12.** Tot ce ai construit în RF-01d funcționează pentru cazurile testate.

Oracolul invers al planner-ului — independent de suită, compară direct cu comportamentul măsurat pe baseline — confirmă **12 din 13 sonde reparate**, inclusiv toți cei 5 vectori de traversal, CAS-ul, reviziile monotone, schema și originea.

Dar a picat una. Și e cazul cel mai obișnuit din realitate.

## 2. Cazul pe care nimeni nu l-a testat

Suita acoperă două situații:
- `Content-Length` declarat mare, dar clientul trimite **puțin** (`body.test.mjs:57`)
- transfer chunked, fără `Content-Length` (`body.test.mjs:87`)

Nu acoperă a treia: **`Content-Length` declarat corect ȘI body-ul chiar trimis integral.**

Asta e exact ce face un browser la `fetch()` cu un body mare. E cazul normal, nu unul exotic.

Măsurat de planner, cu body trimis integral:

| Trimis | Rezultat |
|---|---|
| 0.5 MiB (sub plafon) | 400 — corect, `plots` depășește limita de schemă |
| 0.9 MiB (sub plafon) | 400 — corect |
| 1.05 MiB | 413 primit, dar la limită |
| **1.2 MiB** | **niciun răspuns, ECONNRESET** |
| **2 MiB** | **niciun răspuns, ECONNRESET** |
| **8 MiB** | **niciun răspuns, ECONNRESET** |

Pragul e pe la ~1.1 MiB — adică fix acolo unde body-ul depășește ce încape în bufferele socketului.

### De ce

Pe calea A (`Content-Length`) răspunzi imediat și nu drenezi — corect pentru clientul care nu trimite nimic, greșit pentru cel care trimite tot. Când închizi, mai sunt ~1 MB necitiți în buffer, iar stiva TCP trimite RST peste răspunsul tău.

**Concluzia care contează:** criteriul de separare nu e „`Content-Length` vs chunked". E **„mai sunt octeți în zbor sau nu"** — și asta nu se poate ști din headere. De-asta au eșuat, pe rând, ambele strategii pure.

## 3. Designul cerut

Nu mai separa pe tipul de transfer. O singură strategie, cu închiderea ca ultim pas condiționat.

```
la depășirea plafonului (indiferent pe ce cale ai detectat-o):

  1. scrie răspunsul 413 IMEDIAT
     -> clientul care nu mai trimite nimic îl primește pe loc;
        dispare așteptarea de 2s din RF-01c

  2. NU pune `Connection: close`
     -> ăsta era declanșatorul lui destroySoon() intern, cursa din RF-01b

  3. drenează `req` în paralel, aruncând octeții
     -> clientul care încă trimite își golește bufferul;
        dispare RST-ul de la 1.2 MiB în sus

  4. închide abia când: drenajul a ajuns la capăt  SAU  s-a atins un plafon

     - drenaj complet -> conexiunea e curată, fără octeți necitiți.
       Nu mai trebuie să distrugi nimic: keep-alive rămâne valid,
       iar RST-ul nu mai are de unde să apară.

     - plafon atins   -> abia atunci închizi forțat. Cazul patologic,
       nu mecanismul principal.
```

### Plafonul

Pune-l **pe octeți drenați**, nu doar pe timp. Un client care trimite 8 MB e legitim și merită drenat; unul care trimite 8 GB nu. Un plafon de timp singur nu distinge între cele două.

Alege o valoare și justific-o în raport. Orientativ: câteva zeci de MiB drenate, sau câteva secunde — oricare vine prima.

### Ce dispare

Separarea `rejectTooLargeImmediate` / `rejectTooLargeAfterDrain` din RF-01d nu mai are rost dacă ambele fac același lucru. Unifică, și explică în raport.

## 4. Criteriul de acceptare

Toate trei, verificate de planner:

1. Suita completă (257 de teste) trece 3 din 3, exit 0.
2. `test/body.test.mjs` trece 12 din 12.
3. **Oracolul de caracterizare**: cu `Content-Length` corect și body trimis integral, clientul primește **413** la 1.05, 1.2, 2 și 8 MiB. Niciun ECONNRESET.

Al treilea e nou și e cel care a picat acum.

Testul pentru acest caz lipsește din suită. Îl adaug prin tester, separat — tu nu îl scrii.

## 5. Fișiere

**Poți modifica:** `body.js`.
**NU atinge:** `test/**`, `state.js`, `server.js`, `server/http-guards.js`, `status.js`, `rank.js`, `public/**`, `data/`, `.env`, `assets/`, documentele de coordonare.

## 6. Raportul

Adaugă `## RF-01e` la finalul `docs/handoff/RF-01-coder-raport.md`:

```
Strategia unificată — de ce funcționează pentru toate trei cazurile:
Plafonul ales și justificarea lui:
De ce nu mai e nevoie de `Connection: close`:
Ce risc rămâne, dacă rămâne vreunul:
```

## 7. Constrângeri

- Nu rulezi comenzi. Toate măsurătorile de mai sus sunt ale planner-ului.
- Nu scrii teste. Nu afirma că „acum trece".
- Nu delega.
- Română.

### Citește înainte

1. `body.js` — integral
2. Secțiunile RF-01b, RF-01c, RF-01d din propriul raport. Fiecare conținea o analiză corectă, aplicată pe un domeniu prea îngust. Designul de mai sus le unifică — nu le contrazice.
