# RF-01f — brief coder: revenire la RF-01d

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Context:** închiderea lui D8, prin decizie de scop — nu prin încă o încercare tehnică.

---

## 1. Decizia

**Restaurează `body.js` la varianta RF-01d.** Ultima ta modificare (RF-01e) se anulează.

Nu pentru că ai greșit. RF-01e a implementat exact designul pe care ți l-am dat eu, iar designul era prost calibrat. Restaurarea e decizia mea, nu o corecție a ta.

## 2. De ce

Lucian a pus întrebarea care lipsea din tot raționamentul meu: **cine e clientul?**

RPG Factory e o aplicație locală, cu un singur utilizator. Singurul client care trimite vreodată ceva către `/api/state` e `public/app.js` — propria pagină din browser. Ce trimite e layout-ul hărții: poziții de celule, proiecte ascunse. Câțiva kilobytes.

Iar schema limitează deja `plots` la 512 KiB, adică **sub jumătate** din plafonul de 1 MiB al body-ului. Ca să atingi plafonul ar trebui zeci de mii de proiecte.

Am cerut cinci runde pentru calitatea mesajului de eroare într-un scenariu care nu se poate produce. Plafonul în sine rămâne — e o plasă de siguranță reală împotriva unui bug care ar umple memoria. Dar *cât de elegant* refuză, când nu va refuza niciodată, nu justifică efortul.

## 3. Starea de restaurat

RF-01d era singura cu toate criteriile îndeplinite:

| | RF-01d | RF-01e |
|---|---|---|
| Suita completă ×3 | **257/257, exit 0** | 256/257, eșec determinist |
| `body.test.mjs` ×12 | **12/12** | 0/12 |

Structura RF-01d, pe scurt — dar ia detaliile din propria ta secțiune `## RF-01d` din raport, nu din rezumatul meu:

- `rejectTooLargeImmediate` pentru calea `Content-Length` — răspuns imediat, fără drenaj
- `rejectTooLargeAfterDrain` pentru calea de acumulare — drenaj întâi, apoi răspuns
- `drain(req, res, callback)`, cu răspunsul scris înaintea distrugerii pe calea de timeout
- `Connection: close` pe răspunsul 413

## 4. Un singur lucru de adăugat

Scrie în `body.js`, lângă `MAX_BODY_BYTES`, un comentariu care consemnează limitarea cunoscută, ca să nu o redescopere nimeni peste șase luni și să repornească aceleași cinci runde:

Conținutul de consemnat:
- Plafonul protejează memoria; asta funcționează în toate cazurile.
- Un client care declară `Content-Length` corect și trimite **integral** un body peste ~1.1 MiB poate primi `ECONNRESET` în loc de `413`. Măsurat: 1.05 MiB primește 413; de la 1.2 MiB în sus, nu.
- E comportamentul standard al serverelor HTTP în această situație (nginx face la fel).
- Nu e o problemă în practică aici: singurul client e `public/app.js`, iar `plots` e deja limitat la 512 KiB de schemă.
- Dacă RPG Factory capătă vreodată clienți care trimit body-uri mari, limitarea trebuie reevaluată.

Formulează-l cum ți se pare cel mai clar. Nu-l face mai lung decât trebuie.

## 5. Fișiere

**Poți modifica:** `body.js`.
**NU atinge:** `test/**`, `state.js`, `server.js`, `server/http-guards.js`, `status.js`, `rank.js`, `public/**`, `data/`, `.env`, `assets/`, documentele de coordonare.

## 6. Raportul

Adaugă `## RF-01f` la finalul `docs/handoff/RF-01-coder-raport.md`:

```
Ce am restaurat din RF-01d:
Ce am consemnat ca limitare cunoscută:
Diferențe față de RF-01d, dacă există vreuna:
```

Dacă restaurarea nu e identică bit cu bit cu RF-01d, spune exact unde diferă și de ce.

## 7. Constrângeri

- Nu rulezi comenzi. Planner-ul verifică cele 257 de teste.
- Nu scrii teste. Nu afirma că trece.
- Nu delega.
- Română.
