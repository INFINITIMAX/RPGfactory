# Intent — RPG Factory

**Actualizat:** 22-09-2026, EET.

**Autoritate:** `instructiuni.md`.

## Problema

Lucian are nevoie de o reprezentare locală, clară și adevărată a agenților Pi și Claude Code: cine lucrează, cine coordonează, ce stare are fiecare, ce predări sunt confirmate și ce dovezi există.

Un decor animat fără date reale este un eșec de produs.

## Produsul

RPG Factory este o consolă locală de observabilitate reprezentată ca un oraș medieval 2D top-down.

- Un repo/proiect devine un regat.
- Primul regat trebuie să funcționeze cap-coadă înainte de multi-regat.
- Harta este suprafața principală; registrul tehnic este contextual.
- Canvas-ul și DOM-ul accesibil reprezintă aceeași proiecție.
- Bot Crossing este referință comportamentală MIT, nu bază de renderer sau model de date.

## Contractul de adevăr

- Profil, sesiune, proces și run sunt distincte.
- Ierarhia vine numai din relații dovedite.
- Lifecycle, activity, attention și freshness sunt axe separate.
- Numai `running + fresh` poate fi activ și animat.
- Stale/unknown nu sunt transformate în working, blocked sau zero.
- Gold reprezintă proof-uri discrete allowlisted, exact unu-la-unu.
- Handoff-ul necesită run-uri corelate și ordine temporală confirmată.
- Progresul nu se inventează din transcript, tokenuri sau durată.
- RPG Factory observă și explică; planner-ul Pi conduce munca.

## Starea livrată

Sunt livrate:

- backend securizat și testabil;
- SQLite, profiluri și runs;
- readers și ingestie Pi bounded;
- proiecție Pi allowlisted;
- mission board, gold/proof și handoff-uri confirmate;
- The Living Citadel, strict 2D top-down;
- registry modal accesibil;
- UI/runtime public în engleză.

Release-ul principal este `861fe57`, cu review final ACCEPT / Merge OK și 723 pass / 0 fail / 3 skip din 726.

## Intent operațional închis: RF-LIVE-01

Produsul livrat este conectat read-only la roots Pi reale. Execuțiile de probă au demonstrat starea API și browser live/terminală, iar gate-urile sunt închise. Nu există un intent operațional nou autorizat.

Succesul înseamnă:

1. roots absolute, explicite și bounded;
2. misiune și run reale;
3. snapshot `ready/fresh` în timpul rulării;
4. activitate numai pentru noduri `running`;
5. mission board disponibil fără date private;
6. browserul reflectă aceleași stări;
7. după finalizare, animația încetează și starea terminală rămâne adevărată.

## Nu facem în RF-LIVE-01

- reporter sau hook global;
- modificări de schemă/migrare;
- orchestrator secundar;
- multi-regat;
- leveling/memorie avansată;
- resolver/Open pentru proof targets;
- redesign;
- activitate simulată;
- publicare fără aprobare.

Registrul complet al deciziilor istorice rămâne în `docs/DECISIONS.md`; nu este lectură obligatorie pentru taskul curent.
