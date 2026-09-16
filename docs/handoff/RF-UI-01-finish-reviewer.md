# RF-UI-01 — Impeccable finish review

Adoptă contractul din `C:/Users/Lucian-PC/.pi/skills/impeccable/reference/degraded/finish-reviewer.md`. Review strict, read-only; nu modifica fișiere și nu rula comenzi/browser.

## Cererea și răspunsurile utilizatorului

- Înlocuirea interfeței vizuale greșite, păstrând backend-ul/API-urile și funcțiile reale.
- Referință oferită de utilizator: `INspiratie/1.png`.
- Țintă: desktop-first, lume aproape full-screen, rail contextual îngust, mobil utilizabil.
- După primul slice, utilizatorul a confirmat: „arată mult mai ok”.
- Cerință suplimentară de produs: munca efectivă Pi trebuie să devină vizibilă într-un lot ulterior; UI-ul curent nu are voie să o inventeze.

## Artifact și dovezi

- Artifact: `public/index.html`, `public/hud.css`, `public/hud.js`, `public/world.js`.
- Desktop 1440×1000: `.impeccable/review/desktop.png`.
- Mobile 390×844: `.impeccable/review/mobile.png`.
- Product truth: `PRODUCT.md`.
- Sistem construit: `DESIGN.md`.
- Direction/surface contract: `docs/handoff/RF-UI-01-surface.md`.
- Craft floor: `C:/Users/Lucian-PC/.pi/skills/impeccable/reference/craft-floor.md`.
- Critique reference, nu comp/spec: `INspiratie/1.png`.
- Build path: code-led; nu există approved comp și nu se aplică phase state/diff fidelity.
- Seed direcție: `92e4bf99`, FORM candidat 4.

## Quality bar

Lumea trebuie să folosească dispozitive native medievale: teren și sprite-uri pixel-art reale, fortărețe/pawn-i mari, districte colorate, margini de teritoriu, cameră pan/zoom și un registru mat de breaslă. Ornamentația rămâne rară: aur fin, shield mark, compas. Chrome-ul nu trebuie să concureze cu lumea. Etichetele agenților sunt contextuale pentru a evita aglomerarea.

## Verificări deja rulate de planner

- `npm test`: 584/584, exit 0.
- Browser real: desktop 1440×1000, world 1065.6 px și rail 374.4 px, fără overflow; mobile 390×844, `scrollWidth=390`.
- Click pe pawn deschide profilul; drag pornit pe pawn nu selectează; focus alternative DOM produce overlay 340×304 neclipped; empty/error/pending/dublu-submit verificate prin route mocks.
- Zero erori consolă în încărcare curată.
- Zero diff backend/game; zero `innerHTML` în UI JS.
- Detector static Impeccable: zero findings, dar mod DEGRADED deoarece lipsesc modulele parser; URL scan indisponibil deoarece Puppeteer nu este instalat și nu a fost instalat fără aprobare.
- Review funcțional final: `docs/handoff/RF-UI-01c-reviewer-raport.md`, ACCEPT.

## Output

Respectă exact output contract-ul finish reviewer: prima linie `disposition: ...`, apoi exact secțiunile cerute. Dacă ai material fixes, ordonează-le și leagă-le de dovadă/contract. Nu trata `INspiratie/1.png` ca approved comp.
