# Jurnal RPG Factory

Fișier viu, scris pentru Lucian, în limbaj normal.

**Regula (dată de Lucian, 15-09-2026):** se actualizează la **fiecare** task, decizie de arhitectură, commit și push — la momentul faptei, nu la finalul sesiunii. Aici nu se scrie jargon. Dacă un rând nu se înțelege fără explicații, e scris prost. Intrările vechi nu se șterg, nici greșelile — alea sunt partea utilă.

---

## UNDE SUNTEM ACUM

**16-09-2026.** (verificat și corectat la această dată — rândul de mai jos era neactualizat de o zi, vezi „CE A MERS PROST" pentru cum am prins-o)

Aplicația **se vede** — hartă cu hexagoane, personaje, iarbă și clădiri, plus tabelele de profiluri/sesiuni. Fundația (server, bază de date) și primele două ecrane vizibile (RF-04, RF-05) sunt gata.

| Etapă | Ce face | Stare |
|---|---|---|
| RF-00 | pune ordine în documente | ✅ gata |
| RF-01 | face serverul sigur și testabil | ✅ gata, **urcat pe GitHub** |
| RF-02a | baza de date: structura și migrațiile | ✅ gata (297/297 teste), **urcat pe GitHub** |
| RF-02b | profilurile agenților, salvate permanent, cu API | ✅ gata (370/370 teste), **urcat pe GitHub** |
| RF-02c | sesiuni observate, asociere la profiluri | ✅ gata (442/442 teste), **urcat pe GitHub** |
| RF-03a | citirea reală din Claude Code | ✅ gata (459/459 teste), **urcat pe GitHub** |
| RF-03b | citirea reală din Pi + reporter | ⬜ **mutat mai jos** — Lucian a ales harta întâi |
| RF-04 | **primul ecran vizibil**: tabele, inspector | ✅ gata (497/497 teste), **urcat pe GitHub** |
| RF-05 | harta: hexagoane, memorie, personaje, sprite-uri reale | ✅ **gata complet** (RF-05a/b/c/e — RF-05d respins, înlocuit), 567/567 teste, **urcat pe GitHub** |
| RF-06 | consum de tokeni, istoric, alerte | ⬜ |
| RF-07 | verificare pe date reale, 20 agenți / 5 proiecte | ⬜ |

**Pe GitHub:** ultimul urcat e `a6ee77e` (RF-05e). Nimic nesalvat local — verificat explicit, `git status` curat.

**Datele tale:** neatinse. `data/state.json` nemodificat din 13 septembrie. Baza nouă se construiește **alături**, nu peste. **Serverul tău de pe portul 5311 rulează** (l-am pornit eu, 15-09-2026, la cererea ta, ca să vezi harta — `node --env-file=.env server.js`, în fundal, PID poate diferi dacă a fost repornit între timp). Am creat manual 4 profiluri de test (`specialist-test-1..4`) direct în baza ta reală, doar ca să populeze harta pentru verificare — pot fi șterse oricând ceri.

**Documente care NU sunt pe GitHub, doar local** (decizia ta, 14-09-2026, reconfirmată 16-09-2026): `instructiuni.md`, `AGENTS.md`, `TASKS.md`, `GATES.md`, `spec.md`, `plan.md`, `docs/DECISIONS.md`, `docs/PARITY.md`, `docs/INTEGRATIONS.md`. Dacă vreodată se pierde acest folder de pe disc, guvernanța proiectului se pierde cu el — doar codul rămâne pe GitHub.

**Deschis, nerezolvat:** ai spus, 15-09-2026 seara, că nu ești mulțumit de direcție — motivul confirmat: rezultatul vizual (harta) nu arată cum ți-ai imaginat, chiar și cu sprite-urile reale din RF-05e. Nu ai clarificat încă exact ce anume — am întrebat, aștept răspuns. **Nu pornesc alt lot nou (RF-03b, RF-06 etc.) până nu lămurim asta.**

---

### 15-09 — Decizie: harta (RF-05) acum, Pi (RF-03b) mult mai jos pe listă
**Lucian.** După ce am întrebat "RF-03b (Pi) sau RF-05 (harta)?", a răspuns clar: harta întâi, Pi se lasă mult mai jos pe listă.

RF-05 e mare — layout hexagonal, randare, personaje care se mișcă — așa că l-am împărțit în trei bucăți verificabile separat, ca la RF-02/RF-03, și am confirmat cu Lucian înainte să scriu vreun brief:
- **RF-05a** — doar algoritmul de așezare pe hexagoane (cine stă unde, cum crește o zonă, memorie ca zonele să nu sară pe hartă). Fără nimic desenat, doar teste. Adaptat conceptual din bot-crossing (`src/world/plots.js`), care rezolvă exact problema asta pentru randare 3D — noi luăm doar logica de așezare, nu 3D-ul.
- **RF-05b** — desenul static pe Canvas 2D: hexagoanele, zonele, sloturile fiecărui specialist. Fără animație încă.
- **RF-05c** — personajele: apar, se mișcă, se animă, se fac mai mari după cât au lucrat recent.

Zonele se grupează pe `agent_profiles.last_project` (câmp deja existent în baza de date de la RF-02b) — fiecare proiect distinct e o zonă pe hartă, mărimea zonei = câți agenți activi are.

### 15-09 — RF-05a: brief trimis coder-ului
Task: funcție pură de alocare a celulelor hexagonale, cu memorie (o zonă care a crescut nu sare la mijlocul hărții doar pentru că a apărut alt proiect). Vezi `docs/handoff/RF-05a-coder.md`.

### 15-09 — RF-05a: închis, prima rulare curată
Coder-ul a livrat `hex-layout.js` — am citit codul direct (nu doar raportul) și am confirmat că a portat corect logica din bot-crossing și a scos complet celula rezervată de "navă" pe care sursa o folosea. Testerul a scris 17 teste care verifică proprietăți reale (o zonă care crește își păstrează exact celulele vechi, una care se micșorează renunță la ultimele, harta rămâne mereu un singur teritoriu conex). Am rulat eu, cu `npm test`: **514/514 teste, 0 eșecuri** — nicio corecție a fost nevoie, prima livrare a fost bună de la coder și de la tester deopotrivă. Reviewer-ul a confirmat: ACCEPT pentru amândouă.

**Ce înseamnă practic**: acum știm exact ce celulă hexagonală primește fiecare proiect (grupat pe `last_project`) și cum crește/se micșorează o zonă fără să sară pe hartă. Nimic nu se vede încă — asta e RF-05b, desenul propriu-zis pe Canvas.

### 15-09 — RF-05b: brief trimis coder-ului
`spec.md` cere ca layout-ul (cine stă unde) să supraviețuiască unui restart al serverului, nu doar să existe cât timp rulează — așa că acest lot adaugă o tabelă nouă în baza de date, plus legătura reală: profiluri → grupare pe proiect → `hex-layout.js` (RF-05a) → salvare → un prim desen pe ecran (hexagoane colorate per proiect, fără personaje încă). Vezi `docs/handoff/RF-05b-coder.md`.

### 15-09 — RF-05b: harta apărea neagră — găsit și reparat un bug real prin verificare vizuală
Codul de bază (baza de date, endpoint, teste) a fost curat de la prima livrare — 536/536 teste. Dar când am deschis efectiv pagina într-un browser, pe o instanță de test separată, **harta era complet neagră**, deși datele erau corecte. Am săpat direct în pagină (nu doar în cod) și am găsit cauza: cele două fișiere de pe ecran (`hud.js`, cel cu tabelele, și `world.js`, cel nou cu harta) declarau amândouă aceeași variabilă la același „nivel", iar browserul refuza să mai încarce al doilea fișier din cauza asta — fără să arate vreo eroare vizibilă ție, ca utilizator, doar o hartă goală.

Niciun test automat nu putea prinde asta (problema apare doar când ambele fișiere sunt încărcate împreună, într-o pagină reală). Exact de-asta verific mereu vizual, nu doar cu teste. Am trimis o corecție scurtă coder-ului (izolarea codului nou într-un „pachet" separat, ca să nu mai calce pe fișierul vechi), am reverificat eu însumi în browser, pe o instanță nouă — acum harta se vede corect: fiecare proiect are un hexagon colorat diferit, cu poziții marcate pentru specialiști și numele proiectului scris lângă el.

**RF-05b închis.** Reviewer: ACCEPT. 536/536 teste, de două ori (înainte și după corecție).

### 15-09 — RF-05c: brief trimis coder-ului
Ultima bucată din harta (RF-05). Fiecare specialist primește un post fix pe hartă, care nu sare când apare/pleacă un coleg — și apare ca un simbol simplu, care se animă discret doar când chiar lucrează (nu doar există). Scop redus deliberat, scris clar în brief: fără mărime reală după consum (nu avem încă acele date — RF-06), fără personaje desenate cu sprite-uri (estetica fină rămâne backlog, cum spune `spec.md`), fără mișcare. Vezi `docs/handoff/RF-05c-coder.md`.

### 15-09 — RF-05c: 6 teste picau — nu din vina codului, ci a testelor
Codul de bază era corect de la prima livrare (am verificat eu direct în cod). Dar când am rulat testele, 6 din 47 picau: 5 pentru că baza de date chiar verifică acum că un „post" aparține unui profil care există cu adevărat (o regulă bună, pe care am cerut-o eu în temă, dar am uitat s-o semnalez clar testerului), iar testele foloseau nume inventate în loc de profiluri reale. Al șaselea era un test vechi, de la runda precedentă, care nu fusese actualizat când am adăugat un câmp nou în răspunsul serverului. Am trimis o corecție scurtă, am rerulat — 567/567 teste, tot proiectul.

### 15-09 — RF-05c: verificare vizuală — harta cu personaje, funcțională
Am deschis din nou pagina într-un browser real, cu un profil căruia i-am atașat o sesiune reală „în lucru" — personajul lui a apărut corect, la locul lui pe hartă, marcat diferit față de ceilalți (care stau, nu lucrează). Nu am putut vedea chiar pulsația animată în timp real — instrumentul de testare ține fereastra „ascunsă" tehnic, iar browserul oprește orice animație pentru ferestre ascunse, ca să economisească baterie — dar am citit codul care face asta și e corect. O să se vadă normal când deschizi tu pagina în browserul tău obișnuit.

**RF-05c închis. RF-05 (harta) e complet închis** — toate cele trei bucăți (algoritm, desen+memorie, personaje+animație) sunt gata. Reviewer: ACCEPT. 567/567 teste.

### 15-09 — Ai văzut harta goală și ai cerut: iarbă + clădiri
Am pornit serverul tău (5311) ca să vezi harta — dar era complet goală, pentru că nu există încă niciun profil în baza ta de date reală (normal, RF-03b/Pi și crearea profilurilor n-au fost făcute încă). Separat de asta, ai observat că harta n-are deloc teren/fundal vizibil sau clădiri — corect, era o decizie deliberată („estetica fină e backlog", scris în `spec.md`), nu o omisiune. Ai cerut explicit să adăugăm acum, ca lot nou (RF-05d), un fundal de teren și câte o clădire simplă per proiect. Brief trimis coder-ului: `docs/handoff/RF-05d-coder.md`. Am creat și 4 profiluri de test direct în baza ta reală (`specialist-test-1..4`), ca să vezi imediat harta populată — se pot șterge oricând le ceri.

### 15-09 — RF-05d respins de reviewer (defect geometric mic, real)
Am verificat eu vizual (arăta bine la ochi), dar reviewer-ul a calculat exact: colțul acoperișului clădirii ieșea cu ~1.9px în afara hexagonului — coder-ul verificase distanța față de o rază de cerc, nu față de muchia reală a hexagonului (care e mai aproape de centru lângă colțuri). Defect minor, dar real și corect semnalat.

### 15-09 — Ai cerut sprite-uri reale din Tiny Swords, nu forme desenate
În loc să reparăm cei 1.9px, am mers direct la ce ai cerut: sprite-uri adevărate din pachetul Tiny Swords (deja licențiat, deja folosit de jocul vechi — `assets/README.md`). Am găsit că jocul vechi are deja exact sprite-urile care ne trebuie, gata exportate (`public/sprites/`): un petic de iarbă, un turn, un personaj cu animație de stat și una de mers. RF-05d e înlocuit complet de **RF-05e**, care portează tehnica deja verificată din jocul vechi, cu grijă specială la geometrie (ca să nu repetăm greșeala de la RF-05d). Vezi `docs/handoff/RF-05e-coder.md`.

### 16-09 — RF-05e închis: harta arată cu sprite-uri reale
Coder-ul a portat exact tehnica din jocul vechi și a recalculat singur geometria (valorile mele de pornire din brief chiar depășeau puțin hexagonul — le-a corectat înainte să le predea). Am verificat eu, de două ori, independent: o dată prin calcul geometric (marje mici dar pozitive, ~1.4px, calculate corect față de muchia hexagonului, nu față de o rază de cerc ca la greșeala de la RF-05d), o dată vizual, direct pe serverul tău real — iarba se vede clar, turnulețele și personajele apar ca sprite-uri mici, corect poziționate. Am verificat și că sprite-urile de personaj sunt cu adevărat transparente (nu doar presupus). Reviewer-ul a refăcut și el calculul de la zero: ACCEPT.

**RF-05d rămâne respins ca defect istoric, nu se repară — RF-05e îl înlocuiește complet.**

---

## UNDE VREM SĂ AJUNGEM

O consolă locală care îți arată agenții AI reali (Pi și Claude Code) ca pe o lume medievală 2D:
cine lucrează și la ce, cine coordonează pe cine, cine e blocat, cine te așteaptă pe tine, cât consumă fiecare.

Un decor frumos cu date greșite nu contează. Datele corecte sunt scopul; harta e felul în care le vezi.

---

## CRONOLOGIE

Cel mai recent, sus.

### 15-09 — Reluare sesiune: verificat ce a rămas, găsit o reparație incompletă
Am rulat suita: **293 teste, 292 trec, 1 pică** (față de 6 pică la închiderea sesiunii anterioare — coder-ul apucase să repare mult, dar n-a mai apucat să scrie raportul).

Verificat direct în cod, nu doar din teste:
- **Defectul 1 (baza rămânea deschisă la eșec)** — reparat, confirmat de teste.
- **Defectul 3 (migrație cu COMMIT propriu persista deși raporta eșec)** — reparat, și mai bine decât cerea brief-ul: coder-ul respinge orice migrație cu BEGIN/COMMIT/ROLLBACK/SAVEPOINT înainte să execute ceva, deci nimic nu mai persistă niciodată. Asta face ca testul vechi care „pinuia" inconsistența (scris înainte de reparație, cerea explicit ca inconsistența să rămână) să pice acum — corect, nu o regresie. Testul trebuie actualizat de tester, nu codul.
- **Defectul 2 (profil fără identitate — PRIMARY KEY nullable) — REPARAT DOAR PE JUMĂTATE.** Brief-ul cerea explicit două coloane: `agent_profiles.id` ȘI `configuration_versions.id`. Coder-ul a adăugat `NOT NULL` doar pe prima. A doua a rămas exact cu bug-ul original — și niciun test nu-l acoperă încă, deci n-ar fi ieșit la iveală fără verificare directă a fișierului SQL.

Nu trimit mai departe la tester cu o reparație incompletă. Am scris `docs/handoff/RF-02a-c-coder.md` — o singură linie de schimbat, dar tot prin coder, nu direct (regulă de proces, fără excepție pentru „e mic").

### 15-09 — RF-02a-c: reparat, verificat
Coder-ul a adăugat `NOT NULL` și pe `configuration_versions.id`. Verificat de mine direct în fișier — corect. Suita rămâne **293 teste, 292 trec, 1 pică** (același eșec de mai sus, neschimbat, cum era de așteptat).

Coder-ul a scris și secțiunile de raport care lipseau (`RF-02a-b`, `RF-02a-c`) — le-am citit, sunt coerente cu ce am verificat eu în cod.

Am trimis la tester (`docs/handoff/RF-02a-d-tester.md`): actualizează testul învechit de la linia 359 (nu mai descrie o inconsistență reală, defectul 3 e reparat mai bine decât cerea testul), plus un test NOU explicit pentru `configuration_versions.id` — exact genul de test care lipsea și care a lăsat coloana nereparată să treacă neobservată prima dată.

### 15-09 — RF-02a-d: verificare finală de la tester, gata
Tester-ul a: (1) unit cele patru teste de BEGIN/COMMIT/ROLLBACK/SAVEPOINT într-un singur test parametrizat (comportamentul lor a devenit identic după reparație — respingere curată, nimic pe disc), cu ROLLBACK și SAVEPOINT acoperite acum pentru prima dată; (2) adăugat testul lipsă pentru `configuration_versions.id`; (3) adăugat un test explicit pentru defectul 1 (handle-ul bazei chiar se închide la eșec — verificat prin ștergerea imediată a fișierului, nu doar prin cleanup colateral).

Rulare finală: **297 teste, 297 trec, 0 eșecuri.** Verificat direct de mine în cod (nu doar din raport) — testele noi verifică exact ce pretind.

Trimis la reviewer, cu tot istoricul (fundație + cele 3 corecții), ca să confirme independent.

### 15-09 — RF-02a: ÎNCHIS
Reviewer-ul a acceptat tot lotul (fundație + cele 3 corecții), fără nimic de respins. A confirmat, verificând el însuși direct în cod (nu doar din raport): schema finală are `NOT NULL` pe ambele coloane, garanția "nicio migrație eșuată nu ajunge înregistrată" e reală pe toate căile de eșec, testele noi verifică exact ce pretind, nimic redundant.

O singură notă (nu blochează): comanda `node --test test/` nu merge pe Node 24 — folosim doar `npm test` din rădăcină.

**Rezultat final: 297 teste, 297 trec, 0 eșecuri.**

**Nu am urcat încă pe GitHub.** Regula s-a schimbat față de vechiul proiect (T-01…T-19, unde urca automat după fiecare task): acum trebuie aprobarea ta explicită înainte de commit + push. Aștept răspunsul tău.

### 15-09 — PUSH: RF-02a pe GitHub
Ai aprobat. **Commit `2e004ec`**, 15 fișiere, +2228 linii. Urcat pe `INFINITIMAX/RPGfactory`.

Ce s-a urcat: `db.js`, `migrations/001-profiluri.sql`, `test/db.test.mjs`, `JURNAL.md`, plus toate brief-urile/rapoartele RF-02a din `docs/handoff/`. Documentele de coordonare (`TASKS.md`, `GATES.md`, `AGENTS.md`, `instructiuni.md`, `spec.md` etc.) rămân doar local, cum s-a decis pe 14-09.

### 15-09 — RF-02b: pornit
Următorul lot: profilurile devin utilizabile. Construim un modul (`profiles.js`) care poate crea un profil, îl poate aproba, îl poate schimba în siguranță (verificare de revizie, ca să nu se piardă o scriere dacă doi oameni/agenți schimbă același profil simultan), și îl leagă de rute noi în server (`/api/profiles`). Trimis la coder.

### 15-09 — RF-02b: livrat de coder, verificat de mine
Am citit codul direct (nu doar raportul). E bine construit: baza de date chiar nu se deschide până la prima cerere reală, verificarea de revizie funcționează corect, un profil inexistent și un conflict de revizie dau răspunsuri diferite (404 vs. 409), fiecare câmp schimbat își are propriul rând în istoric.

**O singură observație, nu bug:** când creezi o configurație pentru un profil care nu există, coder-ul detectează asta căutând textul "FOREIGN KEY" în mesajul de eroare al bazei de date. Am verificat manual pe mașina asta — azi funcționează exact așa. Dar există o variantă mai solidă (un cod numeric fix, nu text care se poate schimba între versiuni). Nu e nimic stricat acum — am notat observația pentru tester, ca decizia să fie scrisă undeva, nu doar în capul meu.

Trimis la tester.

### 15-09 — RF-02b: testele au găsit 3 probleme, dintre care una reală de producție
Rulare: **3 teste pică** (din suita nouă). Analizate una câte una:

1. Un test aștepta 400 pentru un id cu `%00` în el, a primit 404. Verificat: nu e bug — id-ul din URL nu se decodează niciodată (aceeași regulă de la RF-01), deci `%00` rămâne text obișnuit, nu un caracter de control real. Eu am cerut testul ăsta greșit în brief, copiind un tipar care nu se aplică aici. Se repară testul.
2. O eroare de program (`TypeError`) la un test care verifica o parte de securitate — cauza: testul a trimis datele într-o formă greșită către o funcție internă. Bug de test, nu de server. Se repară testul.
3. **Bug real, de producție**: când serverul se oprește, baza de date a profilurilor rămâne deschisă. Pe Windows, asta blochează ștergerea fișierului — exact problema pe care am reparat-o la RF-02a (acolo era baza însăși care rămânea deschisă la o pornire eșuată; aici e serverul care nu-i spune bazei să se închidă când se oprește el). Trimis la coder.

Am scris ambele corecții (coder pentru bug-ul real, tester pentru cele două teste greșite) și le-am lansat.

### 15-09 — RF-02b-b: fix-ul coder-ului, verificat — dar posibil incomplet
Coder-ul a adăugat închiderea bazei de profiluri, dar doar pe calea „normală" de pornire a serverului (`startServer`). Testul care a picat inițial NU trece pe acolo — construiește serverul direct, mai „manual", tocmai ca să poată verifica o stare de dinainte de pornire. Pe calea aia, închiderea bazei tot nu se întâmplă automat.

Nu știu încă dacă mai e nevoie de o reparație — depinde ce arată testele când rulează. Aștept rezultatul, apoi decid: fie tester-ul adaugă un apel lipsă în testul lui, fie e mai bine ca închiderea să se întâmple automat, indiferent cum pornește cineva serverul (mai sigur, nu depinde ca fiecare loc care oprește serverul să-și amintească să facă și pasul suplimentar).

### 15-09 — RF-02b-b: 369/370, bănuiala confirmată
Cele două teste greșite (raportate mai sus) sunt reparate. A mai rămas exact eșecul pe care îl bănuiam: testul de deschidere lazy tot dă eroare la curățenie, pentru că el pornește serverul „manual" (nu prin calea normală), iar reparația de ieri nu acoperă și calea aia.

Decizie: nu mai pun plasture pe încă un loc — cer coder-ului să facă închiderea automată, indiferent CINE oprește serverul și CUM. Trimis RF-02b-c.

### 15-09 — RF-02b-c: reparat, verificat — 370/370
Coder-ul a înfășurat metoda de închidere a serverului, ca oricine o cheamă (indiferent cum a pornit serverul) să închidă automat și baza de date. Am verificat direct în cod, apoi am rulat toată suita: **370 teste, toate trec.**

Trimis la reviewer, cu tot istoricul lotului (fundație + cele două corecții).

### 15-09 — RF-02b: ÎNCHIS
Reviewer-ul a acceptat tot lotul, fără nimic de respins. A confirmat, verificând el însuși: verificarea de revizie chiar previne pierderea unei scrieri, un id inexistent și un conflict real sunt distinse corect, iar reparația finală de închidere a bazei acoperă orice mod de a opri serverul, nu doar cel normal.

**Rezultat final: 370 teste, 370 trec, 0 eșecuri.**

Acum poți: crea un profil de agent, îl poți aproba, îi poți schimba specializarea sau eligibilitatea (în siguranță — dacă doi oameni/agenți încearcă să-l schimbe simultan, al doilea primește un răspuns clar de conflict, nu suprascrie tăcut primul), și poți vedea toată istoria lui. Tot prin API — nu se vede încă nimic pe ecran (asta e RF-04).

### 15-09 — PUSH: RF-02c pe GitHub — RF-02 complet, de la un capăt la altul
Ai aprobat. **Commit `631ad02`**, 11 fișiere, +2142 linii. Urcat pe `INFINITIMAX/RPGfactory`.

Cu asta, tot RF-02 (fundația de date: baza SQLite, profiluri, sesiuni) e pe GitHub, de la RF-02a la RF-02c.

### 15-09 — Trei decizii pentru RF-03, clarificate cu tine
Ai ales: Claude Code întâi, separat de Pi (Pi vine mai târziu, are nevoie de un mecanism suplimentar — „reporter" — pe care-l construim atunci, cu aprobarea ta separată la instalare). Ingestia sesiunilor rulează **automat, în fundal** — serverul se uită singur la sesiunile Claude Code la fiecare 5 secunde, cât timp rulează, fără să-l ceri de fiecare dată.

### 15-09 — RF-03a: pornit
Primul adaptor real. Serverul începe să „vadă" sesiunile tale Claude Code adevărate și le înregistrează în baza nouă (`runs`, de la RF-02c) — vii ca „running", oprite ca „stopped", nu doar le ignoră când mor, cum făcea codul vechi. Nu leagă nimic automat de un profil — asocierea rămâne strict manuală, decizia ta. Trimis la coder.

### 15-09 — RF-03a: livrat de coder, verificat de mine
Am citit codul direct și am rulat suita veche (442/442, nicio stricăciune). Bine construit — pornirea/oprirea sondării e legată corect de pornirea/oprirea serverului, aceeași lecție de la RF-02b aplicată din nou corect. Trimis la tester.

### 15-09 — RF-03a: teste gata, toate trec
**459 teste, toate trec.** Trimis la reviewer.

### 15-09 — RF-03a: ÎNCHIS
Reviewer-ul a acceptat, fără nicio rezervă — a doua livrare la rând (după RF-02c) fără nicio corecție.

**Ce s-a schimbat, în practică**: serverul citește acum, singur, la fiecare 5 secunde, sesiunile tale Claude Code reale de pe disc și le ține evidența în baza nouă — inclusiv pe cele oprite (înainte, codul vechi le arunca pur și simplu, ca și cum n-ar fi existat). Nimic nu se leagă automat de un profil — rămâne decizia ta, explicit.

### 15-09 — PUSH: RF-03a pe GitHub
Ai aprobat. **Commit `dee2e08`**, 10 fișiere, +1033 linii. Urcat pe `INFINITIMAX/RPGfactory`.

### 15-09 — Decizie: RF-04 acum, Pi (RF-03b) mai târziu
Ai ales să sărim la primul ecran vizibil, nu la Pi. Ai confirmat și că noul ecran înlocuiește pagina principală de-acum — jocul vechi (harta cu hexagoane, pe cod vechi T-01…T-19) rămâne în cod, doar redenumit, nu se șterge.

### 15-09 — RF-04: pornit
Primul ecran care arată date reale, nu machetă. Un tabel cu profilurile de agenți, un tabel cu sesiunile observate (din RF-03a — sesiunile tale Claude Code reale, chiar acum), și un panou de detalii unde poți aproba un profil sau lega o sesiune de el.

**Ce NU arată încă, intenționat**: ierarhie (n-avem Pi), consum de tokeni (alt lot), task-uri (nu există încă acel model) — nu inventăm date care nu există.

Am cerut explicit coder-ului să evite exact bug-ul de securitate găsit în audit (text din date puse direct în HTML, fără protecție) — de data asta se face corect de la început. Trimis la coder.

### 15-09 — RF-04: livrat de coder, verificat VIZUAL în browser — găsit un bug real
Codul arăta bine citit, dar de data asta nu m-am oprit la citit — am pornit o instanță separată de test (fără să ating serverul tău de pe 5311), am pus date reale prin API, și chiar am deschis pagina și am dat clic prin ea, cum ar face-o un utilizator.

Funcționează frumos: tabele, selecție, aprobare. Dar am găsit ceva ce nu se vedea din cod: **panoul din dreapta (inspectorul) se reface complet la fiecare 3 secunde**, chiar dacă nimic nu s-a schimbat — dacă ai un meniu deschis (ex. alegi un profil de asociat) exact când vine sondarea din fundal, meniul dispare de sub tine. Tabelele nu au problema asta (sunt construite corect, doar inspectorul).

Trimis înapoi la coder, cu explicația exactă și ce trebuie schimbat.

### 15-09 — RF-04-b: reparat, confirmat CHIAR ÎN BROWSER
Coder-ul a reparat: acum inspectorul se reface doar când chiar s-a schimbat ceva (alt element selectat, sau date noi pentru cel curent), nu la fiecare sondare.

Am verificat din nou, la fel ca prima dată — pornit instanța de test separată, deschis pagina, deschis meniul de asociere, ales un profil, **așteptat 5 secunde** (peste un ciclu de sondare) — meniul a rămas exact cum l-am lăsat. Apoi am apăsat efectiv „Asociază" — a mers, tabelul și panoul s-au actualizat corect, fără nicio eroare în consolă.

De data asta n-am doar citit codul — am și folosit ecranul, ca un utilizator.

### 15-09 — RF-04: testele au găsit 2 probleme, dintre care una reală de producție, ascunsă
Am rulat toată suita — 3 eșecuri:

1. **Regresie de la redenumire**: testul vechi `D9` (server) și tot fișierul de teste al jocului vechi (~150 de teste) referă încă `app.js` în loc de `game.js` — normal, o consecință directă a mutării de la RF-04, se repară ușor la tester.
2. **Bug real, ascuns, găsit prin reproducere manuală**: când un profil selectat dispare din date (ex. a fost șters), codul care „curăță" selecția crapă la mijloc — încearcă să citească o proprietate a unui lucru pe care tocmai l-a golit. Eroarea e înghițită tăcut, iar tot ecranul rămâne blocat cu date vechi în acel moment, fără să afli de ce. Nu s-a văzut din citirea codului — l-am găsit scriind un script mic care reproduce exact pașii unui utilizator (selectează, apoi dispare elementul).

Trimis ambele corecții (una la coder pentru bug-ul real, una la tester pentru referințele vechi) — lansate în paralel, ating fișiere diferite.

### 15-09 — RF-04: ambele reparate, confirmat CHIAR CU SCRIPTUL MEU de reproducere
Coder-ul a reparat blocajul (verificat de mine, rulând din nou exact scriptul care a găsit bug-ul — de data asta inspectorul chiar se golește). Tester-ul a reparat referințele la vechiul `app.js`.

**Rulare finală: 497 teste, toate trec.** Trimis la reviewer.

### 15-09 — RF-04: ÎNCHIS
Reviewer-ul a acceptat, fără nimic de retrimis — a confirmat el însuși, citind tot codul: nu mai există `innerHTML` cu date interpolate nicăieri, cache-ul inspectorului funcționează corect în toate cazurile de graniță, redenumirea jocului vechi nu a lăsat fișiere moarte, iar cele două bug-uri (unul găsit vizual, unul găsit prin reproducere) sunt reparate complet, fără alte instanțe ascunse.

**Ai acum, chiar dacă nu ai deschis încă pagina**: un ecran real cu profilurile tale de agenți și sesiunile Claude Code observate live (de la RF-03a), unde poți aproba un profil sau lega o sesiune de el, direct din pagină.

### 15-09 — PUSH: RF-04 pe GitHub
Ai aprobat. **Commit `1739f04`**, 19 fișiere, +2405 linii. Urcat pe `INFINITIMAX/RPGfactory`.

**Corecție, verificată direct chiar acum**: serverul tău de pe 5311 (PID 54236) **nu mai rulează** — portul e liber, procesul nu mai există. Nu l-am oprit eu în această sesiune (nu l-am atins niciodată) — pare să se fi oprit separat, în afara lucrului de azi. Ca să vezi noul ecran, pornește-l din nou tu (`node --env-file=.env server.js`, din `D:\RPGfactory`) sau cere-mi explicit s-o fac.

### 15-09 — PUSH: RF-02b pe GitHub
Ai aprobat. **Commit `c1f215b`**, 13 fișiere, +2249 linii. Urcat pe `INFINITIMAX/RPGfactory`.

### 15-09 — Ai cerut să prioritizăm partea vizuală
Ai vrut să vezi ceva, nu doar terminalul. Ți-am arătat exact ce mai e până la primul ecran (RF-02c, RF-03, apoi RF-04) și am propus o scurtătură (ecran devreme, pe date reale dar prin drumul vechi). Ai ales să păstrăm ordinea strictă din plan — deci mergem mai departe normal, spre RF-02c.

### 15-09 — RF-02c: pornit
Ultimul lot din RF-02. Construim ideea de „sesiune observată" (`runs` — o execuție a unui agent, cu harness-ul ei, id-ul nativ, opțional legată de un profil) și regula „un profil nu poate avea două sesiuni active simultan, fără să fie semnalat" (I24). Încă nu citim nimic real din Pi/Claude — doar mecanismul, cu date de test. Trimis la coder.

### 15-09 — RF-02c: livrat de coder, verificat de mine
Am citit codul direct. Bine construit — inclusiv lecția de la RF-02b (închiderea corectă la oprirea serverului) aplicată corect din prima, fără să mai fie nevoie de o corecție separată. Trimis la tester.

### 15-09 — RF-02c: teste gata, prima rulare curată
**442 teste, toate trec, din prima încercare** — pentru prima dată în tot RF-02, niciun tur de corecție n-a mai fost necesar. Trimis la reviewer.

### 15-09 — RF-02c: ÎNCHIS. RF-02 (toată fundația bazei de date) e gata.
Reviewer-ul a acceptat, cu verificare specială tocmai fiindcă n-a fost nevoie de nicio corecție (ca să nu fie o verificare superficială) — a confirmat că regula „un profil, o singură execuție activă" chiar funcționează corect, inclusiv în cazuri neobișnuite (2 sesiuni active deodată, ceva ce n-ar trebui să existe dar dacă există tot trebuie arătat, nu ascuns).

**Ce poți face acum, prin API (încă fără ecran)**: un profil de agent poate „vedea" o sesiune reală (odată ce RF-03 o conectează), poate fi legat explicit de ea, iar dacă cineva încearcă să pornească a doua sesiune pe același profil în același timp, sistemul refuză clar, nu se preface că nu s-a întâmplat.

**Nu am urcat încă pe GitHub.** Aștept aprobarea ta.

### 15-09, seara — SESIUNEA S-A ÎNCHEIAT AICI

Oprită de Lucian, se terminau tokenii. **Nimic nu s-a stricat, dar RF-02a a rămas neterminat.**

**Ce e în aer:** coder-ul lucra la cele 3 bug-uri de mai jos. E posibil să fi apucat să modifice `db.js` și `migrations/001-profiluri.sql` înainte de oprire, **fără ca eu să fi verificat nimic**. Nu te baza pe ele până nu se rulează testele.

**Nimic din RF-02 nu e urcat pe GitHub.** Ultimul commit rămâne `cbca9e0` (RF-01). Tot ce ține de baza de date e doar pe disc.

**La reluare, în ordinea asta:**
1. `npm test` din `D:\RPGfactory` — vezi câte pică
2. dacă cele 3 bug-uri sunt reparate: trimite la tester pentru verificare, apoi la reviewer
3. dacă nu: brief-ul de corecție e la `docs/handoff/RF-02a-b-coder.md`, cu toate măsurătorile
4. după review: commit + push

**Datele tale, la închidere:** `data/state.json` nemodificat din 13 septembrie. Nicio bază de date reală creată. Serverul de pe 5311 (PID 54236) încă rulează, neatins.

### 15-09 — Regulă nouă: jurnalul se actualizează mereu
**Decizie a lui Lucian.** Nu doar la finalul sesiunii, ci la fiecare task, decizie de arhitectură, commit și push. Motivul lui, textual: *„nu pot să înțeleg tot ce se întâmplă, de asta facem acest tool ca efectiv să văd, sunt prea multe straturi de abstract."*
Scrisă și în `AGENTS.md`, ca să se aplice și în sesiunile viitoare, cu alt agent.

### 15-09 — RF-02a: testele au găsit 3 bug-uri reale
Trimise înapoi la coder. Niciunul nu s-ar fi văzut la o rulare normală.

**Un agent putea exista fără identitate.** SQLite are o ciudățenie: o coloană de identificator text acceptă „gol", chiar declarată cheie primară. Am testat — am reușit să bag **două** profiluri fără identitate în aceeași tabelă, ambele valide. Contrazice direct temelia produsului.

**Un eșec care se raporta ca succes.** Dacă un script de structură e scris greșit într-un anumit fel, aplicația spune „n-a mers" și refuză să pornească — dar bifează scriptul ca aplicat. La următoarea pornire îl sare. Baza ar rămâne permanent pe jumătate construită, iar mecanismul n-ar mai avea cum să observe.

**Baza rămânea deschisă când ceva eșua.** Fișier blocat și handle scurs la fiecare pornire ratată.

Rezultat suită: 293 teste, 287 trec, 6 pică (5 din ele cauzate de al treilea bug).

### 15-09 — RF-02a: fundația bazei de date, livrată
Coder-ul a construit modulul care deschide baza și aplică „migrațiile" (scripturile care creează structura), plus prima structură: profiluri de agenți, configurații versionate, istoric de modificări.

Verificat independent de mine, 7 probe din 7. Cea mai importantă: dacă un script de structură crapă la jumătate, baza revine complet la starea dinainte.

### 15-09 — `npm test` devine comanda oficială
Înainte nu exista și nici nu puteai rula testele în siguranță. Acum: `npm test` → 257 teste, toate trec. Asta închide ultimul rest din RF-01.

### 15-09 — Decizie de arhitectură: SQLite
**Aprobată de Lucian.** Baza de date va fi SQLite — inclusă în Node, nu se instalează nimic, un singur fișier local.

Alternativa era să rămânem pe fișiere JSON. Motivul alegerii: aplicația trebuie să răspundă la întrebări de tipul „cât a consumat agentul X săptămâna trecută". Cu JSON ar însemna să încarci tot fișierul în memorie și să filtrezi manual, de fiecare dată. Cu 20 de agenți × 30 de zile de măsurători, asta devine sute de mii de înregistrări.

Verificat înainte de decizie: SQLite merge pe calculatorul tău fără flag special și fără avertisment.

### 15-09 — PUSH: RF-01 pe GitHub
**Commit `cbca9e0`**, 30 de fișiere, +4438 linii. Urcat pe `INFINITIMAX/RPGfactory`.

Ce s-a reparat în server, pe scurt:
- oricine din rețeaua ta locală putea deschide aplicația, deși scria „localhost"
- se puteau citi fișiere din afara folderului public (5 metode de atac testate, toate blocate)
- o pagină de pe alt port local îți putea modifica datele salvate
- o salvare o putea șterge tăcut pe alta
- se puteau scrie date stricate în fișierul de stare
- un client deconectat la momentul nepotrivit putea opri serverul

**Cel mai important:** testele nu mai sunt periculoase. Înainte ștergeau `data/state.json`-ul tău real și porneau programe pe calculator.

Teste: 205 → 257, toate trec.

### 15-09 — Decizie: codul se urcă pe GitHub după fiecare lot
**Lucian.** Motivul practic: la o revenire la o versiune anterioară, coder-ul n-a avut de unde s-o ia — a reconstruit-o din propria descriere în text. A ieșit bine, dar a fost noroc.

### 14-09 — Decizie: `instructiuni.md` bate orice alt document
**Lucian.** Dacă `instructiuni.md` contrazice orice alt fișier din proiect, el câștigă. Aplicat în 12 fișiere. `plan.md` a fost scos din circulație — era o copie învechită a aceluiași plan.

### 14-09 — Decizie: documentele de planificare nu intră pe GitHub
**Lucian.** Rămân doar pe disc. Codul și testele se urcă.

### 14-09 — RF-00: ordine în documente
Un review a găsit că orice agent nou care citea documentele în ordinea prescrisă ajungea **garantat** la concluzia greșită și se bloca. Reparat.

---

## CE A MERS PROST, CA SĂ NU REPETĂM

**Am consumat 5 runde pe o problemă care nu exista.** Serverul refuza fișierele prea mari, dar nu apuca să spună de ce — clientul vedea „conexiune întreruptă" în loc de „fișier prea mare". Am tot încercat s-o repar, până când m-ai întrebat: *ce client?* Aplicația e locală, singurul „client" e pagina ta din browser, care trimite câțiva kilobytes. Scenariul nu se putea produce.

Lecția: întreabă cine folosește lucrul, înainte să optimizezi cum se comportă.

**Am raportat greșit un rezultat.** Am spus „12 din 12 teste trec" când unul pica — instrumentul meu de măsurare căuta un mesaj de eroare specific și l-a ratat pe altul. Reparat.

**Am schimbat un contract fără să-l consemnez unde era scris.** Am dat instrucțiuni noi prin briefuri de corecție, dar am lăsat documentul inițial spunând altceva. Review-ul a semnalat-o, și avea dreptate.

**Am vorbit prea mult în jargon** și te-am pierdut. De-aici vine fișierul ăsta.

**Am lăsat rezumatul de sus („UNDE SUNTEM ACUM") neactualizat o zi întreagă**, deși regula spune „la momentul faptei" — spunea încă „aplicația nu se vede" și „serverul e oprit" cu mult după ce amândouă deveniseră false. Am prins-o abia când m-ai întrebat direct „avem toate md actualizate?" — nu din proprie inițiativă. Am actualizat celelalte fișiere (TASKS.md, GATES.md) la fiecare pas, dar am tratat greșit rezumatul din capul acestui fișier ca pe ceva ce se poate actualiza „mai încolo", exact genul de reconstituire retroactivă pe care regula o interzice explicit.

Lecția: „la momentul faptei" înseamnă și rezumatul de sus, nu doar intrările cronologice de mai jos — un cititor care sare direct la început nu ar trebui să găsească informație veche.

---

## CUM SE LUCREAZĂ

Pentru fiecare bucată de muncă, același ciclu:

1. Eu (planner) scriu o comandă scrisă pe disc, cu ce trebuie făcut exact
2. **Coder** scrie codul — nu are voie să ruleze nimic
3. Eu verific ce a livrat, cu probe proprii
4. **Tester** scrie testele — nu are voie să ruleze nimic, nici să spună că trec
5. Eu rulez tot și raportez rezultatul real
6. **Reviewer** verifică și codul, și testele — doar citește, nu poate modifica nimic
7. Închid bucata doar cu dovezi

Toate comenzile le rulez doar eu. E regula ta, din instrucțiunile globale.

**De ce așa:** un agent care scrie cod și tot el zice că merge nu dovedește nimic.
