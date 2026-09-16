# RF-UI-01 — brief coder

## Sarcina

Înlocuiește interfața principală actuală cu consola vizuală descrisă în `docs/handoff/RF-UI-01-surface.md`, folosind `INspiratie/1.png` numai ca referință de compoziție. Lucrezi numai la:

- `public/index.html`
- `public/hud.css`
- `public/hud.js`
- `public/world.js`
- `docs/handoff/RF-UI-01-coder-raport.md`

## Citește înainte

1. `instructiuni.md`
2. `docs/handoff/RF-UI-01-surface.md`
3. `PRODUCT.md`
4. `GATES.md`, secțiunea RF-UI-01
5. `INspiratie/1.png`
6. cele patru fișiere UI actuale și testele `test/hud.test.mjs`, `test/world.test.mjs`

## Rezultat obligatoriu

- Desktop 1440×1000: lumea medievală ocupă minimum 65% din lățimea utilă, pe toată înălțimea sub bara de comandă; HUD permanent de 320–400 px în dreapta.
- Proiectele sunt districte/teritorii mari, colorate și lizibile; Tiny Swords rămâne limbajul vizual.
- Pawn-ii și clădirile sunt clar vizibile; Canvas scalează la spațiul real, nu rămâne într-un cerc mic.
- HUD compact: stare conexiune, rezumat real, profile, sesiuni. Nu inventa blocked/task/usage/cost.
- Selecția pawn ↔ profil HUD este sincronizată prin evenimente DOM; același inspector contextual este deschis.
- Inspectorul folosește rail-ul, nu un panou fix care comprimă permanent pagina.
- Controale pentru zoom in/out/reset și pan prin pointer; map state clar pentru loading/empty/stale.
- Rândurile/cardurile selectabile sunt keyboard-operable cu Enter/Space și focus vizibil.
- Canvas are nume/descriere accesibilă și listă DOM alternativă actualizată cu pawn-ii reali.
- La 390×844: hartă aproximativ 55dvh, HUD dedesubt, fără overflow orizontal.
- `prefers-reduced-motion`, contrast bun, select/scrollbar/focus tematizate.
- Păstrează toate funcțiile și contractele existente pentru create/approve/assign/associate/dissociate/polling.

## Constrângeri dure

- Nu rula nicio comandă. Planner-ul este singurul care rulează comenzi.
- Nu modifica teste — tester-ul le deține.
- Nu modifica backend, DB, API, `public/game.*`, documentele de guvernanță, `JURNAL.md`, `TASKS.md`, `GATES.md`, `PRODUCT.md` sau asset-uri.
- Fără framework/dependențe noi, CDN, font remote, icon emoji/unicode, date false, `innerHTML` interpolat sau SVG extern. Dacă ai nevoie de iconuri, folosește SVG inline coerent în HTML/CSS.
- Păstrează compatibilitatea cu sandboxul minimal din `test/hud.test.mjs`; accesul la elemente noi trebuie să degradeze sigur când lipsesc din fake DOM.
- Păstrează `world.js` izolat și exporturile Node existente din rădăcina `world.js` neafectate.
- Nu ascunde erori și nu raporta teste ca trecute.

## Raport

Scrie `docs/handoff/RF-UI-01-coder-raport.md` cu:

- fișiere schimbate;
- decizii de layout/interacțiune;
- cum ai păstrat contractele și siguranța DOM;
- riscuri/limitări;
- confirmarea explicită că nu ai rulat comenzi sau teste.
