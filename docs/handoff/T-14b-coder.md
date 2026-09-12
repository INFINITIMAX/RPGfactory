# T-14b — Decorația se suprapune cu sprite-ul agentului

## Sarcină

Testul tester-ului (`test/app.test.mjs`, secțiunea T-14) a demonstrat că decorația de pe o celulă (colț dreapta-jos) chiar se suprapune vizual cu sprite-ul agentului (desenat în centrul celulei), la zoom implicit — 32px de suprapunere, cu valorile curente `DECORATION_DEST_SIZE=40` și `DECORATION_OFFSET=4` din `public/app.js`.

Brief-ul original (T-14) cerea explicit: "alege ceva care nu se suprapune vizual cu unde apar agenții/sprite-ul lor" — nu a fost respectat cu valorile alese.

## Context geometric

- `CELL_SIZE = 80` — o celulă are 80×80px.
- Agentul (`SPRITE_DEST_SIZE = 56`) e desenat centrat pe mijlocul celulei → ocupă aproximativ `[12,68] × [12,68]` în interiorul celulei (centrul la 40,40, rază 28 în fiecare direcție).
- Decorația (`DECORATION_DEST_SIZE = 40`), poziționată în colțul dreapta-jos cu `DECORATION_OFFSET = 4`, ajunge să acopere o zonă prea mare — se suprapune cu zona ocupată de sprite-ul agentului.

## Rezultat așteptat

Micșorează `DECORATION_DEST_SIZE` și/sau ajustează poziția (offset-ul din colț) astfel încât dreptunghiul decorației să NU se intersecteze deloc cu dreptunghiul `[12,68]×[12,68]` (zona sprite-ului agentului), în interiorul unei celule de 80×80. Sugestie de plecare (poți alege alte valori, motivează în raport): `DECORATION_DEST_SIZE = 20-24px`, plasată strict în colțul celulei (offset mic, ex. 2-4px de la marginea celulei), astfel încât dreptunghiul decorației să rămână complet în afara pătratului central de 56×56.

Verifică matematic (nu doar "ar trebui să fie ok") înainte de a preda: calculează explicit colțurile ambelor dreptunghiuri (decorație vs. sprite agent) cu valorile noi alese, și confirmă în raport că NU se intersectează.

## Constrângeri dure

- Nu modifica altceva din `drawZones()`/`decorationForCell()` în afara dimensiunii/poziției decorației.
- Nu atinge `zones.js`, `state.js`, `merge-state.js`, `rank.js`, `status.js`, `server.js`.
- Nu adăuga npm dependencies.

## Ce NU are voie să atingă

Orice fișier în afară de `public/app.js`.

## Predare

`docs/handoff/T-14b-coder-raport.md`: valorile noi alese, calculul explicit care confirmă non-suprapunerea (colțurile ambelor dreptunghiuri), cum ai verificat.
