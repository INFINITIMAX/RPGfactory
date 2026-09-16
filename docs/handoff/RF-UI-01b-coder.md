# RF-UI-01b — corecții coder după review

## Context

Primul slice RF-UI-01 este vizibil și direcția este acceptată de utilizator. `npm test` a dat 576/576, desktop și mobil nu au overflow, dar reviewer-ul a respins livrarea. Citește integral `docs/handoff/RF-UI-01-reviewer-raport.md`.

## Sarcina

Repară strict constatările reviewer-ului și un defect vizual observat de planner. Lucrezi numai la:

- `public/index.html`
- `public/hud.css`
- `public/hud.js`
- `public/world.js`
- `docs/handoff/RF-UI-01b-coder-raport.md`

### Corecții obligatorii

1. **Profil → run:** când se selectează un run, actualizează selecția hărții la `run.profile_id` dacă există; altfel golește selecția hărții. Inspectorul și harta nu pot indica entități diferite.
2. **Alternativa Canvas:** butoanele pawn din lista DOM rămân accesibile, dar la focus controlul focalizat trebuie să devină vizibil într-un overlay/panou coerent, cu outline clar; nu lăsa un control focusabil ascuns în 1×1 px.
3. **Acțiune în curs:** toate mutațiile inspectorului și crearea profilului trebuie protejate împotriva activării repetate. Setează `aria-busy`, dezactivează controlul declanșator până în `finally` și afișează un text scurt de progres fără a schimba API-ul. Evită global-lock dacă acțiunile sunt independente, dar nu permite dublarea aceleiași acțiuni.
4. **Indicator conexiune:** `setConnectionState` actualizează numai nodul de text și păstrează permanent `.connection-dot` din DOM.
5. **Etichete suprapuse:** în special zona `RPGfactory` cu doi pawn-i nu poate afișa etichetele de proiect și numele agenților una peste alta. Repoziționează etichetele sau afișează numele pawn-ului numai la hover/focus/selecție, păstrând identitatea accesibilă în DOM. Nu micșora din nou lumea.

## Constrângeri

- Nu rula comenzi sau teste.
- Nu modifica teste, backend, API, DB, `public/game.*`, asset-uri sau documente de guvernanță.
- Fără date fictive, `innerHTML`, dependențe sau funcții noi în afara corecțiilor.
- Păstrează compatibilitatea cu fake DOM-ul; elementele opționale trebuie tratate defensiv.
- Nu raporta problemele ca rezolvate fără a descrie exact modificarea.

## Raport

Scrie `docs/handoff/RF-UI-01b-coder-raport.md` cu cele cinci corecții, fișierele schimbate, limitările și confirmarea că nu ai rulat comenzi/teste.
