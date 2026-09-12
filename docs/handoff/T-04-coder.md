# T-04 — Sprite animat de muncitor, în locul cercurilor placeholder

## Sarcină

Înlocuiește cercurile colorate din `public/app.js` cu sprite-ul de muncitor (`Pawn`) din Tiny Swords, animat (idle loop), pentru **toți** agenții — fără diferențiere de clasă/culoare pe rang încă (vine mai târziu, ignoră `rank`/`model` din acest task, deși câmpurile rămân în date).

## Context

Sprite-ul e deja exportat la `public/sprites/pawn-idle.png` (servit de server ca imagine — am adăugat deja `.png` în `CONTENT_TYPES` din `server.js`, nu mai e nevoie să atingi asta).

**Structura fișierului**, verificată direct (nu presupusă):
- Dimensiune totală: 1536×192px.
- 8 cadre egale, fiecare 192×192px, așezate orizontal (cadrul N începe la `x = N*192`).
- E o animație de idle (personajul stă pe loc, mișcare mică de respirație) — nu are mers/alergare în acest fișier.

## Motivul pentru care acum adăugăm o buclă de animație (schimbare față de T-01)

La T-01 am interzis explicit `requestAnimationFrame`/orice buclă continuă de randare, cu motivarea "nu există nimic de animat încă — o adăugăm când chiar avem ceva de animat". Acum chiar avem: sprite-ul are 8 cadre care trebuie ciclate indiferent de poll-ul de date (la 3 secunde). Deci **T-04 adaugă o buclă separată, doar pentru avansarea cadrului**, nu pentru fizică/mișcare complexă.

## Rezultat așteptat

1. **Încărcarea imaginii**: `const pawnImage = new Image(); pawnImage.src = '/sprites/pawn-idle.png';` — desenarea sprite-ului trebuie să verifice `pawnImage.complete` (sau un flag setat în `onload`) înainte să încerce `drawImage`, ca să nu arunce eroare dacă `draw()` rulează înainte ca imaginea să se încarce (poate rula, `tick()` e apelat imediat la pornire).
2. **Buclă de animație**: `setInterval` separat de `POLL_INTERVAL_MS`, care avansează un index de cadru (0-7, ciclic) la o viteză rezonabilă pentru idle — **125ms/cadru (8 cadre/secundă)** — și cheamă `draw()`. Nu folosi `requestAnimationFrame` (inutil pentru 8 cadre la interval fix; `setInterval` e suficient și mai simplu de citit).
3. **Desenare**: pentru fiecare agent viu, la poziția lui pe grilă (neschimbată — tot hash pe `sessionId`):
   - `ctx.drawImage(pawnImage, frameIndex*192, 0, 192, 192, destX, destY, DEST_SIZE, DEST_SIZE)` — cadrul curent, decupat din sheet, desenat la o dimensiune redusă (propune **56×56px**, centrat pe poziția din grilă, ca să încapă confortabil în celula de 80×80 cu loc pentru nume dedesubt).
   - Dacă `pawnImage` nu s-a încărcat încă, sări desenarea sprite-ului pentru acel frame (nu bloca restul — numele/statusul pot tot să apară, sau pur și simplu nu desena nimic până se încarcă; alege ce ți se pare mai simplu și explică decizia în raport).
4. **Statusul** (`busy` vs. altceva) nu mai poate fi culoarea de fill a unui cerc — pune un mic indicator separat: un cerc mic (raza ~6px) în colțul din dreapta-sus al sprite-ului, cu aceeași logică de culoare ca înainte (`colorForStatus`, păstrează funcția neschimbată).
5. **Selecția** (click) — înlocuiește conturul alb gros de pe cerc cu un contur/pătrat subțire alb în jurul sprite-ului (ex. `ctx.strokeRect` în jurul zonei de 56×56).
6. **Detectarea click-ului** — actualizează raza/zona de hit-test ca să corespundă noii dimensiuni vizuale (56×56 → poți păstra un test circular cu rază ~28px, centrat la fel, sau treci la test dreptunghiular; explică ce ai ales).
7. Numele agentului rămâne desenat sub sprite, ca înainte.

## Constrângeri dure

- Nu adăuga npm dependencies.
- Nu modifica `hashToCellIndex`, `cellIndexToPosition`, `colorForStatus`, poll-ul (`tick`), `renderDetails`, `openAgentSession` — doar `draw()` și click handler-ul (pentru hit-test), plus adăugarea buclei de animație și încărcarea imaginii.
- Nu atinge `server.js`, `rank.js`, `.env*`, `.gitignore`, `assets/`, `README.md`.
- Nu integra alte sprite-uri (culori de facțiune, alte unități) — doar `pawn-idle.png`, pentru toți agenții identic, în acest task.

## Ce NU are voie să atingă

`server.js`, `rank.js`, `.env*`, `.env.example`, `.gitignore`, `README.md`, `assets/`.

## Predare

`docs/handoff/T-04-coder-raport.md`: deciziile luate (dimensiune exactă a sprite-ului pe ecran, forma hit-test-ului, ce faci cât timp imaginea nu s-a încărcat), cum se testează manual. **Include comanda/output-ul exact al oricărei verificări manuale**, nu doar concluzia.
