# Pivot propus — un singur regat viu înaintea hărții cu mai multe proiecte

Data: 16-09-2026

## Verdict

Direcția RF-UI-01 este tehnic funcțională, dar a pornit în ordinea greșită. A făcut mai întâi o hartă generală cu mai multe proiecte și un HUD modern, înainte să demonstreze complet produsul într-un singur regat viu.

Următorul vertical slice trebuie să conțină **exact un proiect/regat**, urmărit cap-coadă: ierarhie reală Pi, subagenți vizibili în timpul execuției, activitate inspectabilă, muncă animată numai când există dovadă, predări coder → tester → reviewer și rezultat verificat. Abia după acceptarea acestui slice se proiectează navigarea între mai multe regate.

## Ce arată auditul de paritate

Referință fixată: `Station-Sciences/bot-crossing@a4972429ddf6a66a17445abfedbe39e90969d554`.

`docs/PARITY.md` este un inventar, nu dovada parității. Din cele 56 de poziții, suprafețele operaționale principale P01–P09, P15–P26 și mai multe comportamente P51/P53–P56 sunt absente; selecția, acțiunile și memoria hărții sunt cel mult parțiale sau adaptate. Nu este corect să atribuim un procent unic, deoarece unele poziții sunt controale 3D neaplicabile, dar paritatea de utilizare este clar joasă.

Ce are Bot Crossing și ne lipsește încă în produsul utilizabil:

- contoare de stare și navigare la următorul agent relevant;
- panou real de proiect și listă de sesiuni ordonată operațional;
- focus hartă ↔ listă, Viewed, next-needing-you, hide/unhide proiect;
- acțiuni complete Open/New/Reveal/Copy și feedback de succes/eroare;
- comportamente vii: apariție, mers, lucru, așteptare, eroare, plecare;
- evitare de obstacole și separarea personajelor;
- construcție vizuală per sesiune și memorie spațială matură;
- adaptoare Claude Code, Codex și Cursor printr-un contract comun.

Ce are RPG Factory și originalul nu rezolvă:

- profil persistent separat de sesiune;
- SQLite și istoricul configurațiilor/asocierilor;
- ierarhia planner → coder/tester/reviewer;
- task, criterii, predări și work proof;
- Pi ca sursă obligatorie;
- leveling validat, nu transcript size prezentat drept progres.

## Fork direct sau pivot pe baza actuală

### Fork direct Bot Crossing

Avantaje:

- oferă imediat o suprafață operațională matură și o lume care pare vie;
- are adaptor modular de harness, stări, HUD, navigare, sticky layout și multe interacțiuni deja rezolvate;
- licența MIT permite reutilizare cu păstrarea notificării.

Costuri:

- rendererul este Three.js/WebGL 3D; aplicarea Tiny Swords 2D nu este un skin, ci înlocuirea majorității modulelor din `src/world`, `src/agents` și `src/core`;
- modelul lui este repo → thread; nu are profil permanent → run → task → event/artifact;
- starea este în `data/colony.json`, deținută de browser, incompatibilă conceptual cu fundația SQLite deja verificată;
- nu are adaptor Pi și nici ierarhie/work proof; acestea tot trebuie construite;
- un fork ar abandona o mare parte din serverul întărit și cele 584 de teste actuale fără să elimine munca grea specifică RPG Factory.

### Pivot pe baza actuală, cu transplant selectiv MIT

Avantaje:

- păstrează backend-ul, SQLite, profilele, asocierile, siguranța HTTP și testele;
- putem arunca din nou doar compoziția frontend, care este partea greșită;
- putem porta/adapta explicit contractul de harness, modelul de stare, ordonarea HUD, focusul și algoritmii de navigare din commitul fixat;
- Pi și work proof intră direct în modelul canonic, nu ca extensii forțate peste `thread`.

**Recomandare:** nu fork direct. Păstrăm baza actuală și facem un pivot ferm single-kingdom-first, cu reutilizare selectivă și atribuită MIT din Bot Crossing. Păstrăm o clonă read-only a commitului upstream ca oracol de comportament și verificăm fiecare funcție din `docs/PARITY.md` cu dovadă.

## Pi: sursa reală este disponibilă

Pe mașină este instalat `pi-subagents@0.60.0`, iar sesiunea curentă expune instrumentele de subagenți. Pachetul documentează artefacte machine-readable:

- `status.json` — stare, pași, timestamps, model, tokens/cost când providerul le oferă;
- `events.jsonl` — pornire, progres de lifecycle, atenție, completed/failed/paused/stopped;
- `output-<n>.log` și artefacte finale;
- misiuni cu copii, faze, heartbeat și legături către artefacte.

Integrarea nu trebuie să scrapeze terminalul. Propun două căi complementare:

1. adaptor read-only care citește artefactele lifecycle pentru execuții async și recovery;
2. reporter Pi opt-in, în proces, pentru actualizări cu latență mică și execuții foreground;
3. ingestie idempotentă în SQLite pentru istoricul RPG Factory, deoarece artefactele temporare Pi au retenție limitată.

Cât timp există, fișierele lifecycle sunt autoritare pentru starea run-ului; reporterul este acceleratorul live, iar SQLite păstrează numai evenimentele normalizate și dovezile aprobate. Prompturile și transcripturile brute nu sunt copiate în UI implicit.

## Contractul vertical slice-ului

Un singur regat selectat, fără hartă multi-proiect în acest lot:

1. Castelul reprezintă proiectul și rădăcina de coordonare.
2. Planner-ul și copiii reali apar pe baza run-urilor Pi observate.
3. Legăturile planner → copii sunt vizibile pe hartă și în arbore DOM.
4. Un agent merge spre un loc de muncă numai după un eveniment real de pornire.
5. Minează/lucrează numai cât starea autoritară este `running`; `unknown`, `stale`, `waiting` și `blocked` au comportamente distincte.
6. Aurul nu este procent și nu se acumulează din timp/tokenuri. O piesă de aur reprezintă o dovadă discretă: raport/artefact predat, test rulat de planner, review acceptat sau gate verificat.
7. Culoarea indică rolul/ierarhia. Mărimea poate crește până la 2× numai din usage recent real, conform I04–I06; dacă providerul nu oferă usage, rămâne explicit indisponibilă și nu simulăm creșterea. Starea are simbol și text separat. Leveling-ul rămâne ulterior.
8. Inspectorul arată activitatea reală disponibilă, sursa și timestamp-ul; lipsa datelor rămâne indisponibilă.
9. Coder → tester → reviewer se vede ca predare reală, nu ca animație temporizată.
10. Acțiunile reale Open/Reveal/Copy/Viewed și stările de eroare rămân accesibile din UI.

## Tiny Swords pentru meniuri

Asset-urile există local și nu au lipsit. Pachetul include `WoodTable`, `RegularPaper`, `SpecialPaper`, `Banner`, `Ribbons`, `Buttons`, `Bars`, `Icons`, `Human Avatars`, `Swords` și sloturi 9-slice.

Nu au fost integrate în RF-UI-01 deoarece direcția aleasă a separat greșit „lume Tiny Swords” de „HUD modern mat”. A fost o decizie de design greșită, nu o limitare tehnică.

În noul slice:

- WoodTable/sloturile formează rama principală;
- hârtia formează inspectorul și arborele;
- ribbons/banners separă rolurile și stările;
- butoanele Tiny Swords primesc stări reale normal/pressed/focus/disabled;
- barele se folosesc numai pentru valori reale, nu pentru progres inventat;
- textul critic rămâne HTML/DOM accesibil peste/deasupra asset-urilor, nu rasterizat în Canvas.

## Ordinea propusă

1. **RF-K01a — contract Pi și fixture-uri sanitizate:** mapare run/child/event/artifact, fără UI final.
2. **RF-K01b — ingestie Pi reală:** adaptor read-only + reporter opt-in; stări live și recovery.
3. **RF-K01c — regatul unic viu:** castel, ierarhie, pawn-uri, trasee și locuri de muncă.
4. **RF-K01d — mining/work proof:** animații legate de stări reale și aur legat de dovezi discrete.
5. **RF-K01e — meniuri Tiny Swords:** inspector, arbore, acțiuni, tastatură și responsive.
6. **RF-K01f — verificare cap-coadă:** un workflow real planner → coder → tester → reviewer, capturat și inspectabil.
7. Numai după acceptarea RF-K01: proiectarea multi-kingdom.

## Gates înainte de extindere

- niciun pawn activ fără run real și proveniență;
- ierarhia din UI corespunde run-urilor Pi observate;
- mining se oprește la waiting/blocked/stale/unknown;
- fiecare piesă de aur poate deschide dovada care a produs-o;
- predările apar în ordinea și cu statusul real;
- restartul UI reconstruiește corect starea din artefacte;
- toate informațiile Canvas au alternativă DOM și operare cu tastatura;
- 390×844 fără overflow orizontal;
- nicio regresie în backend/API și suita completă rămâne verde;
- review independent funcțional și vizual acceptă slice-ul.

## Skill-uri potrivite înainte de implementare

- `ai-native-sdlc` — intent → spec → plan → build/verificare → review → deploy gate;
- `impeccable` și `design-taste-frontend` — compoziția regatului și integrarea coerentă a meniurilor Tiny Swords;
- `playwright-cli` — probe browser desktop/mobil și capturi incremental vizibile.
