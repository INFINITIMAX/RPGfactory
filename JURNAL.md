# Jurnal RPG Factory

Fișier viu, scris pentru Lucian, în limbaj normal.

**Regula (dată de Lucian, 15-09-2026):** se actualizează la **fiecare** task, decizie de arhitectură, commit și push — la momentul faptei, nu la finalul sesiunii. Aici nu se scrie jargon. Dacă un rând nu se înțelege fără explicații, e scris prost. Intrările vechi nu se șterg, nici greșelile — alea sunt partea utilă.

---

## UNDE SUNTEM ACUM

**15-09-2026.**

Aplicația **încă nu se vede**. Lucrăm la fundație: serverul și baza de date. Primul lot în care apare ceva pe ecran e RF-04, adică peste încă două etape.

| Etapă | Ce face | Stare |
|---|---|---|
| RF-00 | pune ordine în documente | ✅ gata |
| RF-01 | face serverul sigur și testabil | ✅ gata, **urcat pe GitHub** |
| RF-02a | baza de date: structura și migrațiile | ✅ gata (297/297 teste), **urcat pe GitHub** |
| RF-02b | profilurile agenților, salvate permanent, cu API | ✅ gata (370/370 teste), **aștept aprobarea ta pentru push** |
| RF-02c | legarea sesiunilor reale de profiluri | ⬜ urmează |
| RF-03 | citirea reală din Pi și Claude Code | ⬜ |
| RF-04 | **primul ecran vizibil**: tabele, arbore, inspector | ⬜ |
| RF-05 | harta cu hexagoane, personaje, mișcare | ⬜ |
| RF-06 | consum de tokeni, istoric, alerte | ⬜ |
| RF-07 | verificare pe date reale, 20 agenți / 5 proiecte | ⬜ |

**Pe GitHub:** ultimul urcat e `2e004ec` (RF-02a).

**Datele tale:** neatinse. `data/state.json` nemodificat din 13 septembrie. Baza nouă se construiește **alături**, nu peste. Serverul tău de pe portul 5311 (PID 54236) rulează în continuare, n-a fost oprit niciodată.

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
