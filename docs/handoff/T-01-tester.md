# T-01 — Teste pentru randarea Canvas 2D

## Sarcină

Scrie teste pentru logica din `public/app.js` (implementată de coder pentru T-01 — vezi `docs/handoff/T-01-coder.md` și `docs/handoff/T-01-coder-raport.md` pentru context complet).

## Ce trebuie testat cu adevărat (nu teste care trec oricum)

Codul e cod de browser (canvas, fetch, DOM) — pentru ce se poate testa fără browser real, extrage funcțiile pure (hash → poziție, mapare status → culoare, formatare timp) astfel încât să fie testabile izolat cu `node --test`, dacă coder-ul nu le-a separat deja (verifică `app.js` întâi; dacă logica e monolitică și netestabilă izolat, notează asta explicit în raport ca risc, nu inventa un test fals doar ca să existe unul).

Testele care contează:
1. **Stabilitatea hash-ului**: același `sessionId` produce mereu aceeași poziție de grilă (determinism) — testează cu 2-3 sessionId-uri fixe și verifică valoarea exactă calculată, nu doar "e un număr".
2. **Independența de ordine**: schimbarea ordinii agenților în array-ul de input NU schimbă poziția fiecărui agent individual (asta e chiar cerința critică din brief — un test care nu verifică asta explicit ratează scopul task-ului).
3. **Mapare status → culoare**: `busy` → culoarea corectă; un status necunoscut (ex. `"waiting"`, `"idle"`, sau orice altceva inventat) → gri, fără să arunce eroare.
4. **Detectare click**: un punct exact pe centrul unui cerc se potrivește; un punct la distanță mai mare decât raza NU se potrivește (testează ambele cazuri, nu doar cazul pozitiv).
5. **Formatare timp**: nu testa exact string-ul de `toLocaleTimeString()` (depinde de locale-ul mașinii care rulează testul) — testează doar că funcția nu aruncă eroare și întoarce un string nevid pentru un epoch valid.

## Ce NU e un test valid aici

- Un test care doar verifică că o funcție hash "există" sau "e de tip function" — nu spune nimic despre corectitudine.
- Un test care mockează totul (fetch, canvas context) atât de agresiv încât ar trece indiferent ce ar face codul real.
- Teste de UI complet (click real pe canvas într-un browser) — nu avem infrastructură de browser headless în acest proiect; nu adăuga o dependență nouă (ex. Playwright) doar pentru asta. Testează logica de detectare a click-ului ca funcție pură (dat un punct și un centru+rază, ce răspunde).

## Constrângeri dure

- Nu modifica `public/app.js`, `public/index.html`, `public/style.css` — dacă logica nu e separată în funcții testabile, notează asta ca risc în raport, nu refactoriza tu codul de producție.
- Nu rula comenzi (`node --test` etc.) — planner-ul rulează și îți dă rezultatul.
- Foloseste `node --test` (nativ, fără framework nou), la fel ca în bot-crossing.

## Predare

Scrie testele într-un fișier nou (ex. `test/app.test.mjs`) și raportul în `docs/handoff/T-01-tester-raport.md`: ce ai testat, ce NU ai putut testa și de ce (ex. cod netestabil izolat), și comanda exactă cu care planner-ul rulează testele.
