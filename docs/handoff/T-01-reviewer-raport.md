# T-01 — Raport reviewer

# Verdict: ACCEPT (ambele livrări)

## Ce am verificat

Am citit brief-ul T-01-coder.md, cele trei fișiere din `public/` (index.html, style.css, app.js), raportul coder-ului, brief-ul T-01-tester.md, `test/app.test.mjs` și raportul tester-ului.

## Cod (coder) — fără cod inutil, respectă constrângerile

- **Fără `requestAnimationFrame`** — explicit interzis, absent. Redesenul se face doar în `tick()` (după poll) și în handler-ul de click.
- **Fără dependențe npm noi** — `app.js` folosește doar Canvas 2D API nativ, `fetch`, `setInterval`.
- **`server.js`, `package.json`, `.env*`, `.gitignore`, `assets/`** — neatinse, confirmat prin lectură directă a directoarelor livrate.
- **Fără sprite-uri/culori tematice** — doar cercuri placeholder, `#2A5FAE` / `#888`, exact cum cerea brief-ul.
- **Poziționare pe hash, nu pe index** — implementat corect în `hashToCellIndex` (public/app.js:25-31), cu comentariu care explică de ce (cerința centrală a task-ului).
- Micile decizii nespecificate (GRID_ROWS=8 pentru simetria grilei, deselectare la click pe zonă goală, `toLocaleTimeString()` fără dată) sunt minore, documentate explicit în raport, și nu constituie funcționalitate suplimentară nejustificată — sunt umplerea unor goluri lăsate intenționat deschise de brief, nu scope-creep.
- Nu am găsit cod mort, opțiuni neceute sau abstracții nefolosite.

Nu găsesc nimic de respins aici.

## Teste (tester) — solide, verifică efectiv cerința centrală

Am verificat fiecare test cu întrebarea "ce schimbare în cod l-ar face să pice":

1. **`hashToCellIndex` determinist** — comparat cu o funcție `sumCharCodes` calculată independent în test, nu doar apelul funcției din app.js de două ori. Ar pica dacă formula de hash se schimbă. Legitim.
2. **Independența de ordine** (cerința centrală a task-ului) — trimite `[alice, bob]` apoi `[bob, alice]` prin `tick()` real, citește poziția din argumentele reale ale `ctx.fillText(name, x, y)` și compară `x,y` per-agent între cele două randări. Dacă implementarea ar fi folosit index-ul din array în loc de hash-ul `sessionId`, poziția lui `alice` s-ar fi schimbat între cele două rulări (index 0→1 sau invers) — testul chiar ar prinde regresia exact descrisă în brief. Nu e superficial.
3. **`colorForStatus`** — testează atât cazul `busy`, cât și 5 valori necunoscute (`waiting`, `idle`, string inventat, `undefined`, `''`), verificând că nu aruncă și dă gri. Bine acoperit, inclusiv edge case-uri (`undefined`, string gol) pe care brief-ul le cerea implicit.
4. **Detectare click** — testează atât hit (centru exact) cât și miss (+100px, mult peste raza de 28px), verificând logica reală de distanță euclidiană din handler-ul de click capturat prin `addEventListener`, nu o reimplementare.
5. **Formatare timp** — corect limitat la "nu aruncă + string nevid", exact cum cerea brief-ul (evită fragilitatea legată de locale).

**Despre `node:vm`**: e o soluție legitimă, nu o ascundere de problemă. `app.js` e un script clasic fără `export`-uri, cu efecte de bord la încărcare (`getElementById`, `fetch`, `setInterval`); testerul nu a modificat codul de producție (interzis explicit în brief), ci a rulat sursa reală într-un context sandbox minimal. Explicația din comentarii despre `function` vs `let/const` devenind/nu proprietăți globale în `vm` e corectă tehnic. Alternativa ar fi fost fie modificarea lui `app.js` (interzisă), fie teste false care mockează agresiv — exact ce brief-ul interzicea. Nu văd nicio funcție testată prin acest mecanism care ar trece indiferent de comportamentul real al codului.

Nu am găsit teste redundante sau cu asserții slabe de tipul `toBeDefined()`.

## Observație minoră, neblocantă

Nu există niciun test pentru tranziția „selectat → deselectat prin click în afara oricărui cerc" (doar „niciodată selectat → click gol"). Codul din `renderDetails()` (public/app.js:76-94) golește `detailsEl.textContent` dar nu și `innerHTML` la deselectare — în DOM real, setarea `.textContent` curăță și markup-ul copil, deci comportamentul e corect în browser, dar mock-ul de test din `app.test.mjs` (obiect JS simplu cu `textContent`/`innerHTML` independente) nu ar surprinde o eventuală regresie pe acest flux specific. E o breșă minoră de acoperire, nu un test fals — nu justifică respingerea, dar merit menționat ca risc rezidual dacă planner-ul vrea acoperire completă.

## Concluzie

Cod: ACCEPT — fidel briefului, fără cod în plus, constrângerile dure respectate.
Teste: ACCEPT — acoperă cerința centrală (independența de ordine) cu adevărat, fără teste vacue sau redundante, folosire legitimă a `node:vm`.

---

## Decizia planner-ului

Accept ambele livrări fără modificări. Testele rulează local (7/7 trecute, verificat de mine înainte de review). Observația minoră despre deselectare (textContent vs innerHTML în mock-ul de test) e reținută ca risc rezidual minor, nu blochează — nu deschid task nou pentru asta acum; o revizităm dacă apare vreodată un bug real de deselectare.

T-01 e închis. Următorul pas: pornirea serverului și verificare vizuală reală în browser, apoi task-ul de integrare a sprite-urilor (navele Void) peste acest schelet, odată alese specializările pe rang.
