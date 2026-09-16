# RF-UI-01 — brief de suprafață

## Job și utilizator

Lucian folosește zilnic această consolă locală pentru a vedea dintr-o privire flota reală de agenți. Modul este **Operate**: primul ecran trebuie să spună cine există, ce proiect ocupă, cine lucrează și ce sesiuni sunt neasociate, apoi să permită inspecția și administrarea fără schimbarea paginii.

## Rezultat și dovadă

- Lumea medievală 2D este suprafața dominantă și folosește datele reale din `/api/world`.
- HUD-ul din dreapta rezumă profilele și sesiunile reale din API, fără metrici inventate.
- Selecția unui pawn și selecția profilului din HUD deschid același inspector.
- Desktop 1440×1000 și fallback 390×844 sunt probe obligatorii.

## Direcția aleasă

O **masă de comandă a breslei**: harta vie ocupă camera, iar HUD-ul este registrul compact de dispecerat prins de marginea mesei. Tiny Swords rămâne lumea; chrome-ul modern, mat și precis face stările ușor de scanat. Nu folosim „parchment UI” peste tot, glassmorphism sau terminal monospace integral.

Referință oferită de utilizator: `INspiratie/1.png` (inspirație, nu asset de livrare). Preluăm compoziția macro — lume aproape full-screen, districte geometrice colorate, densitate vizuală și rail contextual îngust — dar nu tema sci-fi, conținutul, metricile sau acțiunile care nu există în RPG Factory.

## Scope și limite

- Redesign complet pentru `public/index.html`, `public/hud.css`, `public/hud.js`, `public/world.js`.
- Backend-ul, DB-ul, rutele și contractele API rămân neschimbate.
- Jocul legacy `public/game.*` rămâne neatins.
- Nu inventăm ierarhie, taskuri, usage, blocked sau cost înainte ca datele să existe.
- Desktop-first; mobilul rămâne funcțional și lizibil, nu devine o experiență separată.

## Stări și intervale

- Profil: proposed/approved, eligibil/neeligibil, cu/fără proiect.
- Run: toate lifecycle-urile existente, asociat/neasociat.
- Hartă: loading, date valide, goală, stale/eroare de polling.
- Inspector: nimic selectat, profil selectat, run selectat, acțiune în curs, eroare.
- Interval de validare: 0–20 profiluri și 0–5 proiecte în prima versiune.

## Interacțiune și layout

- Desktop: bară de comandă sus; hartă mare în stânga; HUD permanent în dreapta; inspectorul înlocuiește conținutul rail-ului, cu buton Înapoi/Închide.
- Harta scalează dinamic la spațiul disponibil; pawn-ii și clădirile sunt lizibile, nu miniaturi.
- Pan/zoom prin controale și pointer; reset explicit.
- Pawn click/tap → profil; rând/card profil → același profil pe hartă și inspector.
- Tastatura poate selecta toate rândurile; focusul este vizibil.
- Mobil: hartă la aproximativ 55dvh, HUD sub ea; fără overflow orizontal.

## Constrângeri

- Vanilla HTML/CSS/JS și Canvas 2D existente.
- Textul utilizatorului intră numai prin `textContent`/Canvas, niciodată `innerHTML` interpolat.
- `prefers-reduced-motion`, WCAG AA, `lang=ro`, viewport și alternativă DOM pentru Canvas.
- Asset-urile Tiny Swords rămân locale și nu se publică.

## Direction contract

**THESIS:** O masă de comandă vie a breslei; refuză aranjamentul generic „canvas deasupra tabelelor”.

**OWN-WORLD:** Teren pixel-art bogat, slate/navy mat, linii metalice fine, text workhorse sans și numere mono; albastru/galben/violet păstrează sensul ierarhic.

**STORY:** Vezi lumea și starea flotei, localizezi imediat proiectul sau specialistul, apoi inspectezi și acționezi în același rail.

**FIRST VIEWPORT:** Bară 56px; hartă 70–75% din lățime și întreaga înălțime rămasă; rail 340–380px în dreapta cu rezumat, profile și sesiuni; selecția transformă rail-ul în inspector.

**FORM:** Masă tactică de breaslă, candidatul 4 din lista ordonată; seed `92e4bf99`; interacțiunea semnătură este selecția sincronizată hartă ↔ registru.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
