# RF-01d — brief coder, D8: calea Content-Length a regresat

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Context:** a patra rundă pe D8, în cadrul lotului RF-01.

---

## 1. Unde suntem

Am oscilat de două ori pe același defect. Ca să nu mai oscilăm, brief-ul ăsta îți dă **structura soluției**, nu doar simptomul. Mecanismul rămâne al tău, dar decizia arhitecturală e luată.

| Rundă | Calea `Content-Length` | Calea de acumulare (chunked) |
|---|---|---|
| RF-01b | **corectă** — refuz imediat, clientul primește 413 | cursă, 8% ECONNRESET |
| RF-01c | **regresie** — 2s așteptare, apoi niciun răspuns | **corectă** — 12/12 |

Diagnosticul tău din RF-01c era corect și l-am confirmat: cursa era cu `destroySoon()` intern al lui Node, nu cu clientul. Reordonarea `drain → respond` chiar a reparat calea de acumulare.

Dar ai aplicat-o pe **ambele** căi, iar pe cea cu `Content-Length` nu se potrivește.

## 2. Ce s-a stricat, măsurat

```
3 rulări din 3, determinist, exact 2051 ms:
✖ Content-Length declarat > 1 MiB -> 413 imediat, chiar dacă clientul
  nu trimite efectiv atâția octeți
```

Lanțul, în `body.js`:

1. Linia 74: `declaredLength > MAX_BODY_BYTES` → `rejectTooLarge(req, res)`.
2. `rejectTooLarge` cheamă `drain(req, ...)` — dar clientul a **declarat** un `Content-Length` mare și a trimis 16 octeți. Restul nu vine niciodată.
3. `req.on('end')` nu se declanșează. Se așteaptă plafonul de 2s.
4. Linia 50: `req.destroy()` — omoară socketul.
5. Callback-ul ajunge la linia 30: `res.socket.destroyed` e acum `true` → **`return` fără să scrie nimic.**

Clientul așteaptă 2 secunde și nu primește **niciun** răspuns.

Două greșeli distincte aici, și amândouă contează:

**Prima — drenajul contrazice scopul căii.** Verificarea pe `Content-Length` există tocmai ca să refuzi **fără să citești**. Un client care declară 900 MB nu trebuie drenat; asta e exact ce încercam să evităm. Comentariul tău de la linia 71-72 spune corect „refuzăm fără să mai citim un singur octet", dar codul de dedesubt face fix pe dos.

**A doua — pe calea de timeout distrugi înainte să răspunzi.** Comentariul de la linia 50 spune „client ostil, nimic de pierdut — încă n-am răspuns". Dar tocmai *pentru că* n-ai răspuns încă, distrugerea garantează că nu vei mai putea. Ordinea e inversă: răspunde, apoi închide.

## 3. Structura cerută

**Cele două căi au nevoie de strategii diferite. Nu le mai unifica.**

### Calea A — `Content-Length` declarat peste plafon

Știi dinainte, iar clientul poate să nu fi trimis aproape nimic. **Răspunde imediat**, fără drenaj. Oprește intrarea (`req.pause()`) ca să nu acumulezi, închide după ce răspunsul s-a golit efectiv.

Asta era, în esență, comportamentul din RF-01b — care trecea. Nu îl reinventa.

### Calea B — acumulare peste plafon, fără `Content-Length` corect

Clientul e în plin transfer, sigur există octeți în zbor. **Drenează întâi, răspunde după** — exact ce ai construit în RF-01c și care dă 12/12. Păstrează-l neschimbat.

### Regula pentru plafonul de timp, pe ambele căi

Dacă drenajul atinge plafonul: **scrie răspunsul întâi, închide după.** Un client ostil care ne ține ocupați merită tot un răspuns — costă un pachet și elimină ambiguitatea.

Garda de la linia 30 e o idee bună, dar acum se declanșează pe o stare pe care tu însuți ai provocat-o cu o linie mai devreme. Păstreaz-o pentru cazul real (clientul a abandonat), nu pentru autodistrugere.

## 4. Criteriul de acceptare

**Suita completă (257 de teste) trece de 3 ori din 3, cu exit code 0, iar `test/body.test.mjs` trece de 12 ori din 12.**

Verific ambele. Testul de la `body.test.mjs:57` trebuie să răspundă **rapid** — el afirmă „413 imediat", deci 2 secunde nu îl satisfac nici dacă răspunsul ajunge până la urmă.

Nu schimba `DRAIN_TIMEOUT_MS` ca să faci testul să treacă mai repede. Plafonul e o plasă de siguranță; dacă e pe calea critică, structura e greșită.

## 5. Fișiere

**Poți modifica:** `body.js`.
**NU atinge:** `test/**`, `state.js`, `server.js`, `server/http-guards.js`, `status.js`, `rank.js`, `public/**`, `data/`, `.env`, `assets/`, documentele de coordonare.

## 6. Raportul

Adaugă `## RF-01d` la finalul `docs/handoff/RF-01-coder-raport.md`, fără să rescrii nimic:

```
Cum am separat cele două căi:
De ce calea A nu are nevoie de drenaj:
Ce am schimbat pe calea de timeout:
Ce am păstrat neatins din RF-01c și de ce:
```

## 7. Constrângeri

- Nu rulezi comenzi. Măsurătorile de mai sus sunt ale planner-ului; tu nu le poți reproduce.
- Nu scrii teste. Nu afirma că „acum trece".
- Nu delega.
- Română.

### Citește înainte

1. `body.js` — integral, în special `readJsonBody` liniile 70-96, `rejectTooLarge` și `drain`
2. Propriile secțiuni RF-01b și RF-01c din raport — ambele conțin diagnostice corecte; problema a fost domeniul de aplicare, nu analiza
