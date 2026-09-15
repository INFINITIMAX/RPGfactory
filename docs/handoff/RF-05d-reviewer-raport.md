# RF-05d — Raport reviewer (fundal de teren + clădire procedurală)

## Verdict: RESPINGE

Am citit, în ordine: `AGENTS.md`, `docs/handoff/RF-05d-coder.md`, `public/world.js` (integral) și `docs/handoff/RF-05d-coder-raport.md`. Am recalculat geometria cerută (nu m-am bazat pe explicația coder-ului).

### Ce e corect (confirmat prin calcul, nu doar citire)

1. **`drawGround` plasat înainte de `return` timpuriu** — confirmat, `public/world.js:119-121`: apelul `drawGround(originX, originY)` e chiar înainte de `if (!zones.length) return;`. Terenul apare și fără nicio zonă.
2. **Nicio culoare din `PALETTE` reutilizată** — `world.js` (backend, rădăcina) linia 44-57 conține 12 culori (`#c96442`, `#4f9a63`, `#4f7ec9`, `#b8942a`, `#8b5cc9`, `#c94f8b`, `#3fa8a0`, `#c97f4f`, `#6f8f4f`, `#5c7fc9`, `#c95c5c`, `#7f6fc9`). Culorile din `public/world.js` pentru teren (`#3a4a34`, `#20261d`) și clădire (`#8a8378`) nu se regăsesc în listă. Confirmat.
3. **`drawBuilding` vs inelul de sloturi** — sloturile sunt la `TILE*0.58`, unghiuri 30°/90°/.../330°. Clădirea e la `TILE*0.8`, unghi 0. Recalculat: slotul cel mai apropiat (30°) e la `x ≈ cx+15.71px`, marginea stângă a clădirii (incluzând `roofOverhang`) e la `cx+19.11px` — separare reală de ~3.4px, fără suprapunere. Corect.
4. **Ordinea de desenare** — confirmată în cod: `drawGround` (linia 119, înainte de bucla zonelor) → hexagoane+sloturi (linia 123-153, în bucla `for cell`) → `drawBuilding` (linia 162, per zonă, imediat după celulele ei) → etichetă (linia 164-173) → `drawPawns` (linia 176, apelat ultimul, în afara buclei de zone, deci deasupra tuturor clădirilor). Corespunde brief-ului: clădirile sub pawn-i.
5. **Fără asset-uri externe** — doar `ctx.createRadialGradient`, `fillRect`/`strokeRect`, `beginPath`/`lineTo`/`fill` pentru triunghi. Niciun `<img>`, niciun font extern (folosește `monospace` generic, deja prezent înainte de acest lot).
6. **Fișier unic** — pe baza a ce am citit, singurul fișier menționat/atins e `public/world.js`; nimic din conținutul lui nu depinde de sau modifică `hex-layout.js`, `layout.js`, `slot-store.js`, `world.js` (backend), `server.js`.

### Problema care motivează respingerea

**`public/world.js`, `drawBuilding()`, liniile 221-246** — colțul dreapta-sus al acoperișului **iese efectiv în afara hexagonului**, contrazicând direct cerința explicită din brief §2.2: „trebuie să încapă vizibil în interiorul hexagonului, fără să iasă peste marginea lui".

Calcul (TILE = 34*0.92 = 31.28px, toate coordonatele relative la centrul celulei `(cx,cy)`):

- `bx = cx + TILE*0.8 = cx + 25.024`
- Colțul dreapta-sus al acoperișului: `(bx + w/2 + roofOverhang, by - h/2) = (cx + 25.024 + 3.91 + 2, cy - 3.91) = (cx + 30.934, cy - 3.91)`
- Vârful hexagonului la unghi 0° este la `(cx + 31.28, cy)` — dar hexagonul e un **poligon**, nu un cerc de rază `TILE`. Marginea reală lângă acel vârf e muchia dintre colțul de la 300° `(cx+15.64, cy-27.09)` și colțul de la 0° `(cx+31.28, cy)`.
- Pe acea muchie, la `y = cy - 3.91`, limita interioară e la `x = cx + 29.02` (interpolare liniară pe muchie).
- Colțul acoperișului e la `x = cx + 30.934` → **depășește muchia cu ~1.9px** (poligonul se îngustează rapid lângă vârf, nu rămâne la `TILE` decât exact pe direcția 0°).

Raportul coder-ului afirmă verificarea la linia 24 din raport („clădirea + acoperișul ating maximum ... sub TILE ... deci încape vizibil") dar testul lui e greșit: compară doar distanța pe axa X față de `TILE` (rază de cerc), nu față de muchia reală a hexagonului. Lângă un vârf, orice deplasare pe Y scade rapid limita valabilă pe X — exact motivul pentru care colțul acoperișului (decalat cu `roofOverhang` și `h/2`) iese din poligon deși e sub `TILE` pe axa X.

Corpul dreptunghiular și colțul stânga-sus al acoperișului rămân în interior (verificat separat, cu marjă). Doar colțul dreapta-sus (partea „îndepărtată" a acoperișului, spre exteriorul hărții) depășește marginea.

**Impact vizual:** ~1.9px pe o celulă de ~31px — mic, posibil mascat de anti-aliasing și de conturul alb subțire al hexagonului la zoom normal (de-asta planner-ul, verificând vizual, nu l-a observat), dar e o depășire reală și calculabilă a unei cerințe explicite din brief, exact tipul de verificare geometrică pe care acest review trebuia s-o facă.

**Fix recomandat (mic, nu necesită redesign):** micșorează `roofOverhang` (ex. la 0-1px) și/sau reduce ușor raza (`TILE*0.8` → `TILE*0.75`) și/sau lățimea acoperișului, apoi reverifică prin testul corect (distanță față de muchia poligonului, nu față de `TILE` ca rază de cerc) — nu doar „x < TILE".

### Recomandare pentru planner

Trimite înapoi la coder cu acest calcul punctual (linia 221-246, `public/world.js`), cerând ajustarea dimensiunilor `drawBuilding` astfel încât toate cele patru colțuri (corp + acoperiș, inclusiv `roofOverhang`) să rămână, prin calcul verificabil față de muchia hexagonului (nu față de raza `TILE`), strict în interior. Restul lotului (teren, ordine de desenare, paletă, fișier unic, fără asset-uri) e corect și nu necesită modificări.

Notă: nu există tester pentru acest lot (decizie confirmată de planner — decorativ, fără logică testabilă), deci nu am secțiune separată de review pentru teste.

---

## Decizia planner-ului

Nu retrimit la coder pentru fix-ul de 1.9px. Între timp, Lucian a văzut harta și a cerut explicit sprite-uri reale din pachetul Tiny Swords (deja licențiat, `assets/README.md`), nu forme desenate procedural — deci `drawGround`/`drawBuilding` din acest lot sunt înlocuite complet, nu reparate. **RF-05d rămâne respins, ca defect real documentat**, dar munca de aici e superseded de **RF-05e** (`docs/handoff/RF-05e-coder.md`), care portează sprite-urile deja exportate și folosite de jocul vechi, cu instrucțiuni explicite să nu repete exact greșeala de verificare geometrică găsită aici (comparare cu raza cercului în loc de muchia poligonului).

Lecția rămâne validă și se aplică la RF-05e: orice poziționare de formă/sprite lângă marginea unui hexagon se verifică prin muchii (poligon), nu prin distanța radială de la centru.
