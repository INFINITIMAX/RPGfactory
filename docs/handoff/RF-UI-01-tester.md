# RF-UI-01 — brief tester

## Sarcina

După livrarea coder-ului, citește codul UI rezultat și scrie teste semnificative pentru comportamentele nou introduse. Lucrezi numai la:

- `test/hud.test.mjs`
- `test/world.test.mjs`
- maximum un fișier nou `test/ui-contract.test.mjs`, dacă este justificat
- `docs/handoff/RF-UI-01-tester-raport.md`

## Citește înainte

1. `docs/handoff/RF-UI-01-surface.md`
2. `GATES.md`, secțiunea RF-UI-01
3. `docs/handoff/RF-UI-01-coder-raport.md`
4. codul rezultat din `public/index.html`, `public/hud.js`, `public/world.js`, `public/hud.css`
5. testele existente înainte să le extinzi

## Ce trebuie testat

Alege aserțiuni comportamentale care pot eșua la o implementare greșită, nu simple căutări decorative:

- rând/card profil are semantics keyboard (tabindex/role sau element nativ) și Enter/Space declanșează selecția;
- selecția profilului emite focus către lume, iar evenimentul de selecție al pawn-ului deschide același profil;
- lista DOM alternativă a hărții se actualizează din date reale și nu folosește `innerHTML`;
- calculele pure noi de viewport/cameră/hit-testing/transform, dacă există: zoom clamp, conversie coordonate, hit pozitiv/negativ;
- loading/empty/stale păstrează text explicit și nu lasă doar Canvas mut;
- contract static minimal: `lang=ro`, viewport, Canvas cu nume accesibil, controale de hartă și media query mobil/reduced-motion;
- regresiile existente pentru polling, CRUD, XSS și layout pur continuă să aibă sens.

Nu scrie teste care verifică doar denumirea claselor sau valori CSS arbitrare dacă nu protejează un gate real. Nu slăbi și nu șterge testele existente ca să acomodezi implementarea.

## Constrângeri dure

- Nu rula nicio comandă și nu pretinde că testele trec. Planner-ul le rulează.
- Nu modifica producția; dacă găsești un defect, descrie-l în raport pentru planner/coder.
- Nu modifica backend, asset-uri sau documente de guvernanță.
- Păstrează capcana `innerHTML` și fake DOM-ul suficient de strict; extinde-l numai cât cere comportamentul real.

## Raport

Scrie `docs/handoff/RF-UI-01-tester-raport.md` cu:

- fișiere/teste adăugate;
- ce defect ar prinde fiecare grup important;
- probleme descoperite în producție;
- confirmarea explicită că nu ai rulat comenzi sau teste.
