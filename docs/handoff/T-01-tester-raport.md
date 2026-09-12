# T-01 — Raport tester

## Fișier creat

- `test/app.test.mjs` — teste `node --test` pentru `public/app.js`.

## Problemă de netestabilitate izolată (risc, cf. brief pct. 9)

`public/app.js` e un script clasic (fără `<script type="module">`, fără `export`), care la încărcare:
- face imediat `document.getElementById('canvas')` / `getContext('2d')` / `getElementById('details')`;
- înregistrează `canvas.addEventListener('click', ...)`;
- apelează `tick()` (care face `fetch('/api/agents')`) și pornește `setInterval(tick, 3000)`.

Deci fișierul nu poate fi `import`-at direct în Node — ar arunca la primul acces la `document`. În plus, funcțiile utile (`hashToCellIndex`, `cellIndexToPosition`, `colorForStatus`) nu sunt exportate.

**Nu am modificat `app.js`.** În loc să scriu un test fals (care ar fi mockat totul agresiv doar ca să nu crape la import, fără să verifice nimic real — exact ce brief-ul interzice explicit), am încărcat fișierul real cu `node:vm` (`vm.runInContext`) într-un context sandbox cu `document`, `fetch`, `setInterval`, `console` simulate minimal. Funcțiile declarate cu `function` la nivelul scriptului devin proprietăți ale obiectului global din sandbox și pot fi apelate direct — deci testez codul real din fișier, nu o reimplementare a lui.

Detaliu important descoperit: variabilele `let`/`const` de la nivelul scriptului (`agents`, `selectedSessionId`, `GRID_COLS`, culorile) **nu** devin proprietăți globale (spre deosebire de `function`-uri și `var`). Consecință: n-am putut injecta direct `agents` din exterior — am controlat starea internă exclusiv prin apelarea reală a `tick()` cu un `fetch` mockat care întoarce lista de agenți dorită pentru fiecare test, și prin capturarea handler-ului real de `click` înregistrat via `addEventListener`.

## Ce am testat și ce ar pica testul

1. **`hashToCellIndex` determinist, valoare exactă** — pentru 3 `sessionId` fixe, calculez independent suma codurilor de caractere mod 64 și verific egalitatea, plus că a doua chemare dă același rezultat.
   *Ar pica dacă*: formula de hash se schimbă (alt algoritm, altă bază de modulo) sau devine nedeterministă (ex. include `Date.now()`, `Math.random()`).

2. **Independența de ordine** — trimit `[alice, bob]` apoi `[bob, alice]` prin `tick()` (fetch mockat de două ori) și compar poziția `x,y` cu care fiecare nume e desenat (interceptat din `ctx.fillText`, care primește `agent.name` — asta permite atribuirea poziției la agentul corect indiferent de ordinea de desenare).
   *Ar pica dacă*: poziția s-ar calcula din indexul în array în loc de hash-ul `sessionId`-ului (exact regresia pe care task-ul T-01 trebuia s-o evite).

3. **`colorForStatus`** — `"busy"` → `#2A5FAE`; `"waiting"`, `"idle"`, string inventat, `undefined`, `""` → `#888`, fără excepție aruncată.
   *Ar pica dacă*: culoarea implicită se schimbă, sau un status necunoscut aruncă/întoarce `undefined`.

4. **Detectare click** — click exact pe centrul cercului calculat din `hashToCellIndex`+`cellIndexToPosition` → agentul apare în panoul de detalii (`innerHTML` conține numele, `hidden` e scos); click la +100px pe ambele axe (mult peste raza de 28px) → panoul rămâne gol/`hidden`.
   *Ar pica dacă*: raza folosită la detectare nu se potrivește cu cea din desen, distanța se calculează greșit (ex. pătrat în loc de euclidiană), sau click-ul din afara razei ar selecta agentul oricum (fals pozitiv).

5. **Formatare `updatedAt`** — după selecție prin click, extrag valoarea din `innerHTML` (regex pe `<span class="label">updatedAt</span>...`) și verific că nu aruncă și că e un string nevid. Nu verific formatul exact (`toLocaleTimeString()` depinde de locale-ul mașinii).
   *Ar pica dacă*: câmpul updatedAt lipsește din markup, sau formatarea aruncă pentru un epoch valid.

## Ce NU am acoperit și de ce

- **Randare vizuală reală (culori/poziții desenate pe canvas 2D real, sprite-uri)** — nu avem browser headless în proiect; conform brief-ului, n-am adăugat Playwright. Am verificat doar logica (argumentele cu care sunt chemate `ctx.arc`/`ctx.fillText`), nu pixelii finali.
- **Coliziuni de hash quando >64 agenți** — coder-ul a semnalat explicit acest risc netratat în cod; n-am scris test pentru el fiindcă nu există logică de rezolvare a coliziunilor în `app.js` — un test ar documenta doar absența funcționalității, nu un comportament greșit al unei funcții existente.
- **Poll la 3 secunde (`setInterval`)** — mockat cu no-op; nu testez temporizarea reală (ar fi test fragil/lent, nu adaugă valoare — comportamentul relevant e ce face `tick()`, testat separat).
- **`colorForStatus` — valoarea hardcodată `#2A5FAE`** e citită direct din sursă (nu accesibilă ca proprietate globală, fiindcă `COLOR_BUSY` e `const`); dacă coder-ul schimbă valoarea culorii fără să schimbe semantica, testul pică — semnalez asta ca fiind intenționat (comportament vizibil), nu un fals-pozitiv.

## Comanda pentru planner

```powershell
node --test test/app.test.mjs
```
