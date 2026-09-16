# RF-UI-01 — raport tester

Data: 16-09-2026, EET

## Fișiere/teste adăugate sau actualizate

- `test/hud.test.mjs`
  - am extins fake DOM-ul numai cu atribute și evenimente `window` necesare comportamentului real;
  - am adăugat teste pentru semantica rândului de profil, activarea cu Enter/Space, evenimentul HUD → lume și evenimentul pawn → inspector fără buclă.
- `test/ui-contract.test.mjs` (nou)
  - contract static minimal pentru `lang=ro`, viewport, Canvas accesibil, controale, status live, fallback mobil și reduced-motion;
  - sandbox pentru scriptul real `public/world.js`, cu capcană `innerHTML`;
  - teste pentru loading, date reale în lista DOM alternativă, selecția pawn-ului, empty, eroare/stale cu păstrarea ultimului instantaneu, plus limitele și resetarea zoom-ului.

## Defecte pe care le-ar prinde grupurile importante

- Eliminarea `tabindex`, `role`, etichetei accesibile sau a activării Enter/Space de pe rândurile HUD.
- Ruperea contractelor de selecție `rpg:profile-selected` / `rpg:world-profile-select`, identificator greșit sau feedback loop între HUD și hartă.
- O hartă care actualizează doar Canvas-ul, fără alternativa DOM derivată din pawn-ii reali.
- Reintroducerea `innerHTML` în lista alternativă ori interpretarea numelor externe ca markup.
- Stări loading/empty/error care dispar sau nu explică textual situația; ștergerea alternativei DOM la un polling eșuat.
- Zoom fără clamp la 65%–240% ori reset care nu revine la 100%.
- Eliminarea contractelor statice minime pentru limbă, viewport, accesibilitate, mobil sau reduced-motion.

## Probleme descoperite în producție

- Nu am identificat prin inspecție un defect nou cert care să necesite modificarea producției.
- Hit-testing-ul geometric, focusul vizibil efectiv, dimensiunile desktop/mobil și lipsa overflow-ului necesită în continuare probe în browser real; testele adăugate nu le certifică.

## Confirmare

Nu am rulat comenzi și nu am rulat testele. Rezultatul executabil și suita completă trebuie verificate de planner.
