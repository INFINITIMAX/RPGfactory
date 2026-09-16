# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Lucian este utilizatorul principal. Folosește aplicația local, în timpul lucrului cu mai mulți agenți Pi și Claude Code, pentru a înțelege rapid cine lucrează, cine coordonează, cine așteaptă intervenție și unde există blocaje sau date lipsă.

## Product Purpose

RPG Factory este o consolă locală de observabilitate și administrare a profilurilor de agenți reali. Succesul înseamnă că starea flotei poate fi înțeleasă dintr-o privire, iar un agent, proiect, task sau incident poate fi inspectat fără a citi transcripturi brute.

## Positioning

Produsul proiectează execuții reale Pi și Claude Code, cu identitate persistentă, proveniență și adevăr operațional, într-o lume medievală 2D în care un repo este un regat și un specialist este un personaj stabil. Harta nu este decor: este o proiecție navigabilă a flotei.

## Operating Context

- rulează local, loopback, în browser;
- planner-ul Pi/Claude conduce munca; RPG Factory observă și explică, nu devine scheduler;
- profilul, sesiunea, procesul, ierarhia, activitatea, atenția și prospețimea sunt concepte distincte;
- datele lipsă rămân `unknown`/indisponibile, nu sunt inventate;
- Bot Crossing este referința funcțională principală, adaptată la 2D.

## Capabilities and Constraints

- Există: server Node, SQLite, profiluri/configurații, sesiuni asociabile, adaptor Claude Code, HUD de bază și layout hex persistent.
- Lipsesc încă: adaptor Pi, flux de activitate efectivă, ierarhie completă, taskuri/criterii, usage/cost, intervenții și dosare complete.
- Cerință confirmată de Lucian la 16-09-2026: produsul trebuie să arate munca efectivă în desfășurare, nu doar faptul că un agent este `running`. Pașii/activitatea sunt afișați numai când provin dintr-o integrare reală; până la adaptorul Pi rămân explicit indisponibili.
- Un repo este un regat extensibil prin hexagoane adiacente.
- Ordinea obligatorie este single-kingdom-first: un singur proiect trebuie demonstrat complet și viu înaintea navigării multi-regat.
- Primul regat arată run-urile Pi și ierarhia lor reală; mining-ul apare numai pentru lucru confirmat, iar aurul reprezintă dovezi discrete inspectabile.
- Hartă dominantă, HUD operațional compact în dreapta, inspector comun selecției din hartă/listă.
- Toți specialiștii sunt Pawn inițial; mărimea viitoare folosește numai usage propriu recent, maximum 2×.
- Nu se elimină funcții pentru a simplifica aspectul.
- Stack-ul existent rămâne Node + HTML/CSS/JavaScript + Canvas 2D; fără framework nou fără motiv demonstrat.
- Produs desktop-first; viewports înguste trebuie să rămână lizibile și utilizabile, fără a redefini experiența principală.

## Brand Commitments

- Nume: RPG Factory.
- Lume medievală 2D top-down, cu personaje și clădiri ușor frontale.
- Tiny Swords este direcția de artă existentă și asset-ul local disponibil; licența sa custom nu permite publicare tacită.
- Meniurile folosesc asset-urile Tiny Swords disponibile local (WoodTable, papers, banners, ribbons, buttons și bars), nu un strat generic modern separat de lume.
- Textul, tabelele și stările operaționale rămân DOM accesibil, foarte lizibil, peste compoziția medievală.
- Paleta structurală preferată: planner albastru, agent direct galben, subagent violet; stările de atenție folosesc simbol/formă, nu schimbă sensul acestor culori.

## Evidence on Hand

- Cerințe confirmate: `intent.md`, `docs/DECISIONS.md`.
- Contract tehnic: `spec.md`.
- Audit curent: `docs/AUDIT-16-09-2026.md`.
- Inventar paritate: `docs/PARITY.md`.
- Implementare live pe `http://127.0.0.1:5311/`.
- Sprite-uri locale în `public/sprites/`; nu sunt pe GitHub.
- Nu există încă date reale complete pentru ierarhie, taskuri și usage; interfața nu trebuie să le simuleze ca adevăr.

## Product Principles

1. Adevărul operațional înaintea spectacolului.
2. Munca agentului trebuie să fie inspectabilă în timp ce se întâmplă; un simplu bec `running` nu este suficient.
3. Un singur regat complet și convingător precedă orice extindere multi-regat.
4. Harta este instrument de orientare și selecție, nu fundal decorativ.
5. Unknown, stale, waiting și blocked nu se confundă.
6. Profilurile și pozițiile sunt stabile; sesiunile sunt temporare.
7. Orice stare importantă trebuie să poată fi citită și fără culoare sau animație.

## Accessibility & Inclusion

Interfața trebuie să poată fi operată cu tastatura, să aibă focus vizibil, alternativă DOM pentru informația din Canvas, contrast WCAG AA și comportament explicit pentru `prefers-reduced-motion`.
