# HANDOFF — RPG Factory

**Actualizat:** 22-09-2026, EET

**Scop:** document autosuficient pentru următorul Planner.
**Autoritate:** `instructiuni.md` câștigă dacă apare o contradicție.

---

## 1. Rezumat în 60 de secunde

RPG Factory este o aplicație locală Node + SQLite + Canvas/DOM care transformă run-uri reale Pi și Claude Code într-un oraș medieval 2D observabil.

Produsul actual livrează:

- un singur oraș top-down dens, „The Living Citadel”;
- proiecție Pi cu ierarhie, lifecycle, prospețime și activitate strict allowlisted;
- animație numai pentru `running + fresh`;
- mission board read-only;
- gold exact din proof-uri și handoff-uri numai când sunt confirmate temporal;
- registru tehnic într-un drawer modal accesibil;
- backend securizat/testabil, SQLite, profiluri, runs și API-uri legacy păstrate;
- UI, runtime și documentație publică curentă în engleză.

Release-ul este publicat și acceptat. `RF-LIVE-01` este închis: roots read-only sunt configurate explicit, serverul 5311 rulează, iar proba Pi a fost verificată live și după terminare. În timpul run-ului, API-ul și browserul au arătat `ready/fresh`, 2 noduri `running` active și 0 active non-running; după terminare au arătat 2 noduri `completed` și `active=0`.

**Nu există un task nou autorizat.** Serverul rămâne pornit pentru vizualizare; backlog-ul nu pornește automat.

---

## 2. Unde este proiectul și ce este publicat

- Repository local: rădăcina checkout-ului curent (calea nu se publică)
- Remote: `https://github.com/INFINITIMAX/RPGfactory.git`
- Branch: `master`
- HEAD local și remote verificat înaintea resetului documentar: `a61872212c8abb673b298b49abd4a9791d7678dd`
- Ahead/behind atunci: `0/0`

Commituri relevante:

- `861fe57097a5ac7eb24850d54652c02e91b6e437` — mission citadel + English UI;
- `881a2930c880a066c5fe3f23c01123e85ecb6022` — release status;
- `a61872212c8abb673b298b49abd4a9791d7678dd` — reconcilierea handoff-ului public.

Resetul documentar cerut în sesiunea curentă nu are automat autorizație de commit/push. Verifică `git status` înainte de lucru și nu publica fără acord explicit.

---

## 3. Starea reală verificată la 22-09-2026

### Git și fișiere

- Înaintea acestei rescrieri, tracked working tree și staging erau curate.
- Existau 123 artefacte locale neversionate, în principal handoff-uri, capturi și rapoarte interne.
- Aceste artefacte nu trebuie publicate în masă. Unele conțin română istorică, căi locale, loguri sau materiale private.
- Tiny Swords, sprite-urile exportate, inspirația, `.env`, DB-urile și logurile sunt excluse din Git.

### Server

- Portul 5311 este **pornit cu autorizarea utilizatorului** și răspunde HTTP 200.
- Procesul a fost pornit și este deținut de Planner pentru RF-LIVE-01.
- `npm start` folosește `node --env-file=.env server.js`.
- Nu opri sau restarta procesul fără un motiv verificat și fără a păstra starea cerută de utilizator.

### Configurație Pi

Fără a afișa valorile `.env`, verificarea a confirmat:

- `.env` există;
- `PORT` este setat;
- `PI_SUBAGENTS_ROOTS` este setat și validat ca root absolut, explicit, existent și non-symlink;
- `PI_SUBAGENTS_MISSION_ROOT` este setat și validat la fel, după autorizarea utilizatorului.

Prima execuție Pi de probă a fost observată `ready/fresh` cu 2 noduri active, ambele `running`; după terminare proiecția este `ready/stale`, cu 2 noduri `completed` și `active=0`.

Mission board-ul răspunde `ready`, fără warnings și fără truncare. Căile roots nu se copiază în rapoarte sau răspunsuri.

### Teste și review

Ultima dovadă completă de release, din 20-09-2026:

- targeted final: 73/73;
- full suite: 723 pass, 0 fail, 3 skip din 726;
- `git diff --check`: PASS;
- UI curent și legacy: `lang=en`, fără overflow;
- browser console: 0 errors / 0 warnings;
- Reviewer final: ACCEPT / Merge OK.

Cele 3 skip-uri sunt de mediu, inclusiv cazul Windows unde symlink-ul poate întoarce `EPERM`.

Nu reutiliza aceste numere ca dovadă pentru schimbări noi. Rulează verificări noi dacă se schimbă codul sau configurația operațională.

---

## 4. Ce a fost finalizat

### Fundația

- server HTTP loopback, input/static/origin/CAS întărite;
- teste izolate și porturi efemere;
- SQLite cu migrații versionate;
- profiluri, configurații și runs;
- integrare Claude Code existentă;
- ingestie Pi bounded pentru `status.json` și `events.jsonl`;
- ledger idempotent și recovery;
- misiuni Pi allowlisted și proof refs opace.

### RF-K01c / RF-K01d

- endpoint kingdom read-only;
- proiecție bounded și deterministă;
- ID-uri publice opace;
- ierarhie doar din relații dovedite;
- lifecycle, attention și freshness separate;
- mission board read-only;
- exact N proofs → N gold objects + N controls;
- zero proofs → zero gold;
- handoff numai din ordinea temporală confirmată;
- fără proof resolver/Open și fără targeturi private.

### RF-K02

- oraș medieval strict 2D top-down, edge-to-edge;
- castel, districte, drumuri, apă, vegetație, resurse și posturi;
- poziții deterministe până la limita publică de 200 noduri;
- sprite frames și proporții corecte;
- drawer modal cu `aria-modal`, `inert`, focus trap, Escape și focus restoration;
- defectul care muta `main.scrollLeft` a fost reparat.

### RF-L10N-01

- produsul curent și legacy UI în engleză;
- runtime/API și maintained production code în engleză;
- test contractual permanent pentru localizare;
- textele istorice neafectate pot rămâne evidență internă în română.

---

## 5. Ce NU este finalizat

- Demonstrația live API și browser a fost executată; run-ul de probă este acum terminal și inactiv.
- Mission root este configurat local, explicit și validat; valorile rămân private.
- Reporterul Pi opt-in nu este instalat sau activat global.
- Multi-regatul nu este început.
- Telemetria completă de cost/CPU/RAM, leveling-ul și memoria avansată nu sunt livrate.
- Clean clone nu reproduce arta Tiny Swords, deoarece asset-urile nu pot fi publicate brut.
- README-ul public vechi era depășit și este actualizat în resetul documentar curent.

---

## 6. Task operațional închis: RF-LIVE-01

### Obiectiv

Demonstrează onest, cap-coadă, că un workflow Pi real apare în The Living Citadel cât timp lucrează și încetează să fie activ după finalizare.

### Scope permis

- inspecție read-only a roots Pi aprobate;
- validarea configurației existente fără afișarea valorilor;
- setarea locală a `PI_SUBAGENTS_MISSION_ROOT` la un root absolut verificat;
- pornirea serverului 5311 după confirmare;
- lansarea unui workflow Pi bounded, nepericulos și cu mission record;
- verificare API + browser;
- raport sanitizat cu numere și stări, fără IDs/căi/private payload.

### În afara scope-ului

- reporter/hook global;
- migrare sau ștergere DB;
- schimbări de schemă;
- redesign UI;
- multi-regat;
- proof Open/resolver;
- publicarea asset-urilor sau datelor;
- commit/push/deploy fără aprobare separată.

### Ordine recomandată

1. Verifică `git status`, portul 5311 și prezența cheilor `.env` fără valori.
2. Confirmă că root-ul de runs configurat este absolut, existent, director real și bounded.
3. Derivă mission store-ul proiectului conform `pi-subagents`; confirmă că este director real și conține mission records valide.
4. Cere/confirmă autorizarea înainte de modificarea `.env` și pornirea serverului.
5. Salvează numai cheia mission root, fără a ecoa fișierul.
6. Pornește serverul ca proces deținut de Planner și verifică HTTP 200.
7. Lansează un workflow Pi real, bounded, cu o misiune explicită și task sigur. Nu îi permite schimbări de produs.
8. În timpul run-ului, verifică:
   - kingdom `ready/fresh`;
   - cel puțin un nod `active=true` numai dacă lifecycle este `running`;
   - mission board disponibil;
   - nicio scurgere de native IDs, paths, prompts, output, URLs sau raw errors.
9. Verifică în browser Pawn-ul activ, stările DOM, drawer-ul și consola.
10. După terminarea run-ului, verifică `active=0` pentru run-ul terminat și păstrarea stării terminale reale.
11. Rulează testele relevante. Dacă s-a schimbat codul, rulează suita completă și fluxul Coder → Tester → Reviewer.
12. Actualizează `TASKS.md`, `GATES.md`, `HANDOFF.md` și `JURNAL.md` cu rezultate sanitizate.
13. Oprește-te. Commit/push este un gate separat.

---

## 7. Invariante care nu se negociază

- Numai `node.active === true` animă Pawn-ul.
- `active` poate fi adevărat numai pentru `running + fresh`.
- Stale/completed/queued/paused/unknown nu simulează muncă.
- Root-urile sunt absolute, explicite, opt-in și bounded.
- API/UI nu expun native IDs, paths, prompts, outputs, URLs, SQL, raw errors sau proof targets.
- External data intră în DOM prin API-uri sigure, nu `innerHTML`.
- Gold și handoff-urile sunt exacte, nu metafore decorative inventate.
- RPG Factory nu pornește automat următorul specialist și nu devine scheduler.
- Herdr nu este sursă de adevăr pentru Pi.

---

## 8. Fișiere importante

### Produs

- `server.js`
- `pi-kingdom.js`
- `pi-mission-board.js`
- `pi-missions.js`
- `pi-ingestion*.js`
- `adapters/pi-subagents-*.js`
- `public/index.html`
- `public/hud.js`, `public/hud.css`
- `public/world.js`
- `public/game.*` — UI legacy păstrat

### Teste relevante

- `test/pi-kingdom*.test.mjs`
- `test/pi-mission-board*.test.mjs`
- `test/pi-missions.test.mjs`
- `test/server-pi-live.test.mjs`
- `test/localization-contract.test.mjs`

### Dovezi finale existente

- `docs/handoff/RF-K02-final-validation.md`
- `docs/handoff/RF-K02-final-reviewer-raport.md`
- `docs/handoff/RF-L10N-01-contract.md`
- `docs/handoff/RF-L10N-01-final-validation.md`
- `docs/handoff/RF-L10N-01-reviewer-raport.md`

Nu încărca toate rapoartele istorice. Citește numai fișierul necesar întrebării curente.

---

## 9. Flux și comunicare

- Planner este singurul care rulează comenzi, în PowerShell.
- Pentru o schimbare de cod substanțială: Planner → Coder → Tester → Reviewer.
- Brief-urile și rapoartele se scriu în `docs/handoff/<TASK-ID>-<rol>.md`.
- Reviewer-ul este read-only; Planner-ul îi transcrie integral verdictul.
- `TASKS.md` este indexul stării; `GATES.md` definește acceptarea.
- Actualizează `JURNAL.md` la task, decizie, commit și push.
- Comunică utilizatorului rezultate importante și opririle; nu lăsa operații lungi fără status.

---

## 10. Prima propoziție pentru următorul agent

„Am citit `instructiuni.md`, `HANDOFF.md`, `TASKS.md` și `GATES.md`. Starea publicată este stabilă; RF-LIVE-01 este închis și acceptat; roots explicite sunt configurate, iar serverul 5311 rămâne pornit pentru vizualizare. Nu există un task nou autorizat și nu voi activa reporter global, modifica date reale sau publica fără aprobare.”
