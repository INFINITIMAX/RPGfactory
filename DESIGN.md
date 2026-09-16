# RPG Factory — sistem vizual

Actualizat: 16-09-2026

## Direcție

**Masă de comandă a breslei.** Lumea medievală este suprafața principală, nu fundalul unui dashboard. Registrul operațional este o unealtă compactă prinsă de marginea lumii. Referința de compoziție oferită de utilizator este `INspiratie/1.png`; nu este asset de livrare.

## Compoziție

- Desktop: bară de comandă 58 px, lume flexibilă în stânga, rail `clamp(320px, 26vw, 380px)` în dreapta.
- Mobil: lumea are aproximativ `55dvh`, iar rail-ul curge dedesubt; nu există overflow orizontal.
- Inspectorul înlocuiește conținutul rail-ului. Nu rezervă o coloană suplimentară.
- Proiectul este un district hexagonal; profilul este un pawn; sesiunea este o stare observată, nu un personaj separat.

## Culoare și material

| Token | Rol |
|---|---|
| `--base` `#0b1213` | fundalul chrome-ului |
| `--panel` `#111b1c` | rail și suprafețe operaționale |
| `--line` `#2a3a38` | separatoare |
| `--ink` `#eef2ef` | text principal |
| `--muted` `#9aa9a4` | text secundar |
| `--gold` `#d5ac58` | accent medieval/control |
| `--green` `#72c08a` | conexiune/stare sănătoasă |

Terenul și clădirile folosesc sprite-uri Tiny Swords; chrome-ul rămâne mat, geometric și discret. Fără glassmorphism, gradient text sau „parchment UI” generalizat.

## Tipografie

- UI și text: Candara/Trebuchet ca sans workhorse, 11–14 px în rail.
- Titluri și etichete de proiect: Grenze variable, serif display medieval robust, self-hosted.
- Monospace: numai pentru numere, procente și identificatori scurți.
- Etichetele Canvas sunt contextuale: apar la hover, focus sau selecție; identitatea completă rămâne permanent în alternativa DOM.

## Componente și stări

- **Connection indicator:** punct semantic păstrat în DOM + etichetă live.
- **Map controls:** zoom minus/procent/plus/reset; pan cu pointer; drag-ul nu selectează pawn-ul.
- **District:** umplere colorată semitransparentă, contur dublu, nume permanent, clădire ancorată.
- **Pawn:** sprite 34 px scalat cu camera; ring de selecție; animație numai când API-ul confirmă `working`.
- **Rail summary:** numai valori derivabile din profile/runs reale.
- **Rows:** click + Enter/Space, focus vizibil, `aria-pressed` pentru selecție.
- **Inspector actions:** lock per acțiune, `aria-busy`, control disabled și text de progres până în `finally`.
- **Map states:** loading, ready, empty, stale/error, toate cu text live.
- **Canvas alternative:** listă DOM screen-reader-only în repaus; devine overlay vizibil și scrollabil la `:focus-within`.

## Motion

- O singură familie de mișcare: animația pawn-ului care lucrează și feedback-ul direct al camerei.
- `prefers-reduced-motion: reduce` oprește animația dependentă de timp.
- Nu există entrance animations decorative sau pulsuri fără sens operațional.

## Responsive și accesibilitate

- Ținte validate: 1440×1000 și 390×844.
- `scrollWidth` nu depășește viewport-ul.
- Canvas are rol, nume și descriere; aceleași entități există în DOM.
- Toate controalele principale sunt operabile cu tastatura și au focus vizibil.
- Starea nu este transmisă numai prin culoare.

## Proveniență raster

- Tiny Swords — Free Pack, Pixel Frog: https://pixelfrog-assets.itch.io/tiny-swords
- Licență: custom, uz comercial permis, redistribuirea fișierelor brute interzisă.
- Grenze Variable Font, Omnibus-Type / Google Fonts: https://github.com/google/fonts/tree/main/ofl/grenze
- Licență font: SIL Open Font License 1.1; copia este în `public/fonts/OFL-Grenze.txt`.
- Registru complet: `assets/README.md`.
- Sprite-urile sunt locale în `public/sprites/`, intenționat excluse din GitHub.
- `INspiratie/1.png` este referință furnizată de utilizator și nu este servită de aplicație.
