# HANDOFF — RPG Factory

> **Precedență:** `instructiuni.md` are prioritate peste tot ce s-a muncit până acum în proiect. Dacă acest fișier îl contrazice, `instructiuni.md` câștigă. Vezi `AGENTS.md` § „Precedența documentelor”.


Actualizat: **19-09-2026**.

## 1. Stare curentă și următoarea acțiune

Direcția activă este **single-kingdom-first**: un singur regat funcțional, alimentat cu agenți Pi reali și dovezi reale, înainte de multi-regat sau polish extins. RF-UI-01 a fost acceptat tehnic, dar respins ca direcție finală de produs.

### Citire obligatorie pentru un agent nou, în ordine

1. `instructiuni.md` — autoritatea supremă locală.
2. `HANDOFF.md` — acest rezumat de continuitate.
3. `intent.md` și `docs/DECISIONS.md`.
4. `spec.md`.
5. `TASKS.md`, apoi secțiunea relevantă din `GATES.md` și brief-ul curent din `docs/handoff/`.
6. `docs/PARITY.md` — inventar/oracol, nu dovadă că paritatea este implementată.
7. Pentru starea narativă și greșelile recente: ultimele intrări din `JURNAL.md`.

`AGENTS.md` conține regulile persistente de proiect și trebuie respectat înainte de orice editare. Nu deduce statusul din timestamp-uri; `TASKS.md` este indexul, iar rapoartele din `docs/handoff/` sunt dovada.

### Starea exactă

- RF-K01a, RF-K01b1, RF-K01b2a, RF-K01b2b și codul RF-K01b3a sunt comise și publicate în checkpoint-ul `61a6c8d`.
- RF-K01b3a (ledger SQLite atomic) este **ÎNCHIS** 17-09-2026: **13/13 țintit; 660 pass, 0 fail, 2 skip din 662 complet; review ACCEPT / Merge OK**.
- RF-K01b3b (coordonator explicit și recovery) este **ÎNCHIS** 17-09-2026: **7/7 țintit; 667 pass, 0 fail, 2 skip din 669 complet; syntax/diff-check PASS; server PID 40652 înainte/după**.
- Reviewer-ul final b3b, fresh și read-only pe `gpt-5.6-terra` medium, a dat **ACCEPT / Merge OK**, fără findings P0/P1/P2. Raport integral: `docs/handoff/RF-K01b3b-reviewer-raport.md`.
- B3b este local și necomis; checkpoint-ul public `61a6c8d` se oprește la codul b3a.
- RF-K01c este **ACCEPTAT / Merge OK** 18-09-2026: endpoint/proiecție/UI desktop și binding Pi live opt-in; **18/18 țintit; 684 pass, 0 fail, 2 skip din 686; syntax/diff-check PASS**. Reviewer fresh: fără P0/P1; P2 a fost rezolvat prin test direct că ramura live nu creează ledger. Raport: `docs/handoff/RF-K01c-live-reviewer-raport.md`.
- Proba Pi reală autorizată a fost read-only, pe server și DB temporare: `ready`, 3 noduri focale, 190 alte observații, 0 active deoarece snapshotul era stale/terminal; fără căi sau ID-uri native în răspuns.
- În timpul primei probe Playwright RF-K01d, vechiul listener 5311/PID 9908 s-a oprit dintr-o cauză nedemonstrată. Lucian a autorizat separat restartul: aplicația rulează persistent acum pe PID 48192, pagina HTTP 200, kingdom `ready/fresh`, 2 noduri. Configurația `.env` rămâne locală și exclusă din Git.
- Commit publicabil creat și publicat: `48c3b6f` (`Add Pi ingestion coordinator and live kingdom`), exact 15 fișiere de cod/config exemplu/teste; `origin/master` coincide cu HEAD. Documentele locale și artefactele private au fost excluse.
- RF-K01b3c este **PUBLICAT** 18-09-2026: reader + persistență pentru misiuni allowlisted și proof opac, migrarea `006`; **24 pass, 0 fail, 1 skip țintit; 695 pass, 0 fail, 3 skip din 698 complet; review final ACCEPT / Merge OK**. Commit `05801ec` pe `origin/master`; HEAD și remote coincid, ahead/behind 0/0. Raport: `docs/handoff/RF-K01b3c-r2-reviewer-raport.md`.
- RF-K01d este **ACCEPTAT / Merge OK / LOCAL NECOMIS** 18-09-2026: mission board, 3 tipuri de legături dovedite în fixture, exact un gold per proof, selecție sincronizată și UI desktop finisat; **33/33 țintit; 717 pass, 0 fail, 3 skip din 720 complet**. Captură: `docs/handoff/RF-K01d-desktop-final.png`; review: `docs/handoff/RF-K01d-reviewer-raport.md`. Root-ul mission absolut nu este configurat.
- RF-K02 este **ÎNCHIS TEHNIC / ACCEPT / Merge OK / LOCAL NECOMIS** 19-09-2026: oraș medieval strict 2D top-down, hartă edge-to-edge și registru modal contextual. Cele trei P1 inițiale (cadre/proporții sprite, overflow Pawn și izolare focus) plus deplasarea `main.scrollLeft` sunt închise. **71/71 țintit; 721 pass, 0 fail, 3 skip din 724 complet**; browser desktop și mobil fără overflow, erori sau warnings. Capturi: `RF-K02-desktop-final.png`, `RF-K02-mobile-final.png`; review: `RF-K02-final-reviewer-raport.md`.
- RF-L10N-01 este **ÎNCHIS TEHNIC / ACCEPT / Merge OK** 20-09-2026: UI curent și legacy, runtime/API, codul activ și documentația publică sunt English-only. **73/73 țintit; 723 pass, 0 fail, 3 skip din 726 complet**; ambele suprafețe browser au consolă 0/0. Review final fără findings.
- Serverul real rulează pe 5311, PID 49348, HTTP 200, după restartul autorizat pentru încărcarea backend-ului tradus. Configurarea Pi live rămâne pusă pe pauză până după publicare.

### Următoarea acțiune

**Acțiunea curentă autorizată:** publică pe GitHub toate fișierele sigure și publicabile pentru RF-K01d + RF-K02 + RF-L10N-01, prin manifest explicit. Exclude `.env`, date/sesiuni reale, loguri, inspirația privată, paths/ID-uri private și asset-urile Tiny Swords restricționate.

După publicare, oprește-te. Configurarea live Pi/root mission rămâne separată și nu se reia automat. Nu instala/activa reportere globale și nu migra baza reală.

## 2. Ce construim acum

Un **singur kingdom 2D funcțional** pentru un proiect viu: planner și subagenți Pi reali, ierarhie inspectabilă, stări adevărate, mișcare/mining numai pe activitate confirmată, aur ca proof discret și meniuri Tiny Swords accesibile. Bot Crossing rămâne oracol comportamental MIT, nu renderer de copiat integral.

- Hartă 2D medievală dominantă, cu informație critică și comenzi disponibile și în DOM accesibil.
- Repo = regat, extensibil prin celule hexagonale vecine; posturi persistente.
- Zoom progresiv și focalizare locală fără pierderea totalurilor globale.
- Tabele nivel ierarhic × stare, global și pe regat; arbore și legături la selecție.
- Profil stabil ≠ sesiune/PID. O execuție activă per specialist ca regulă a planner-ului; încălcările observate nu se ascund.
- Specializare principală stabilă; munca se predă între coder/tester/reviewer. Activități auxiliare mici permise, cele distincte delegate.
- Research la arhivă/mănăstire; coordonare lângă castel; pădure/mină numai pentru working confirmat cu activitate nespecificată.
- Dimensiune maximă 2× după tokenuri proprii recente; ierarhie preferat albastru/galben/violet. Toți Pawn inițial.
- Profiluri noi propuse de planner și aprobate de Lucian; asociere prin ID explicit și manual la excepții. Fără ghicit după nume/model.
- Administrare profil și retragere din taskuri noi; fără scheduler/assignment/pause/cancel în UI inițial.
- Configurații versionate, dosare de task și ultim proiect. Niveluri per competență pe evaluare + experiență validată, implementate ulterior.
- Progres = etapă + criterii verificate, nu mărimea transcriptului.
- Blocked-confirmed / suspected / needs-user / stale distincte; notificări discrete și inbox; „văzut” nu înseamnă „rezolvat”.
- Tokenuri/cost/CPU/RAM când datele există, cu proveniență; propriu separat de echipă, fără dublare.
- Dosare/agregate permanente, eșantioane detaliate 30 zile.
- Țintă inițială: 20 specialiști / 5 proiecte. House2 este doar preferință provizorie pentru atelier, nu lucru de implementat înaintea fundației.

## 3. Ce există efectiv în cod

Repo: `https://github.com/INFINITIMAX/RPGfactory`, branch `master`. Pe 17-09-2026 Lucian a autorizat explicit commit-ul și push-ul checkpoint-ului `Checkpoint Pi lifecycle ingestion pipeline`, care include munca publicabilă b1–b3a. Documentele ignorate, logurile brute, datele și asset-urile restricționate nu fac parte din publicare. Verifică `git log -1` pentru hash-ul exact.

Există efectiv:

- server HTTP securizat/testabil, SQLite versionat, profiluri, configurații, runs și asocieri;
- integrare Claude Code existentă;
- hartă Canvas 2D și prototip HUD;
- RF-K01a: contract status Pi pur și acceptat;
- checkpoint-ul public `61a6c8d`: b1 discovery/status reader, b2a event contract, b2b JSONL reader, b3a migrarea `005`, `pi-ingestion.js` și testele aferente.

Checkpoint-ul public `48c3b6f` include b3b și RF-K01c. Checkpoint-ul public `05801ec` adaugă RF-K01b3c: `pi-missions.js`, migrarea `006` și testele sintetice. Local și necomis există RF-K01d: `pi-mission-board.js`, endpointul `/api/pi/mission-board`, mission rail, handoff-uri Canvas și seif gold/proof. Peste el, RF-K02 înlocuiește suprafața principală cu orașul medieval top-down și registrul contextual, păstrând aceleași contracte de date.

Dovada curentă este **721 pass, 0 fail, 3 skip din 724** pe 19-09-2026, plus validare browser desktop/mobil și review final ACCEPT. Există gold/proof și handoff-uri vizibile pentru snapshoturi mission configurate. Nu există reporter global, resolver/Open pentru targeturi private sau root mission real configurat automat.

## 4. Descoperiri tehnice și propuneri

`docs/INTEGRATIONS.md` separă instalat/configurat/expus/disponibil de capabilități încă nedemonstrate.

- Pi global 0.85.1; pi-subagents 0.60.0; Node 24.19.0 cu `node:sqlite` disponibil.
- Pi oferă sesiuni JSONL și artefacte de delegare. `parentId` al mesajului NU este părinte de agent.
- `agent_settled` este ancora documentată pentru status stabil după retries/compaction, nu `agent_end` singur.
- Artefactele pot conține metadate private/control tokens; se extrag numai câmpuri allowlisted.
- Herdr rămâne multiplexor, nu sursă autoritară de runtime.
- Pentru identity/activity/task/progress precis poate fi necesar reporter opt-in; nicio extensie RPG nu este încă instalată.
- SQLite local și modelul profil/configuration/run/task/evidence sunt **propuse**, nu aprobate în interviu. RF-01 precede migrarea și rămâne concentrat pe izolare/siguranță.

## 5. Referința Bot Crossing

Commit fixat pentru inventarul curent: `a4972429ddf6a66a17445abfedbe39e90969d554`.

Clona inspectată este la `C:/tmp/pi-github-repos/runtime-9TBgpz/cb3c6e7a123a8852c7bfa878192b656e946752e03ee4b1fcaaa8126db935b466`. Este temporară; verifică existența înainte de a o folosi. Dacă lipsește, recuperează referința fixată, nu ghici vechea cale Bash.

`docs/PARITY.md` are inventarul verificat de meniuri/acțiuni/setări și diferențele 2D. Înainte de un brief de portare, citește sursa relevantă efectiv.

Corecții față de handoff-ul vechi:
- `prState` Claude este citit din evidența Desktop, nu printr-un polling GitHub implementat acolo.
- `transcriptProgress` nu este procent real al taskului; noi folosim criterii/etape.
- Codul original este MIT; păstrează notificarea pentru porțiunile reutilizate.
- Funcțiile strict 3D sunt decizii explicite în inventar, nu motive pentru a importa Three.js sau a afișa controale fără efect.

## 6. Artă, date și publicare

Tiny Swords este pachetul local activ. `assets/`, `public/sprites/`, `public/ui/` sunt ignorate de Git. `assets/README.md` este și el doar local; viitorul manifest/licențe trebuie pus într-un director versionat fără a publica arta brută.

Nu există încă un export/setup automat care reproduce aspectul din clean clone. Nu rezolva prin publicarea asset-urilor fără verificarea licenței. Fișierele `.env`, starea, sesiunile și dosarele private nu intră în Git.

Handoff-ul istoric consemna push după fiecare task închis. Nu îl folosi ca dovadă că un plan încă neaprobat, datele private sau o migrare au fost autorizate pentru publicare. Gate-ul global de review/aprobare înainte de push/deploy rămâne aplicabil.

## 7. Continuitate și reguli

Regulile de proiect sunt `AGENTS.md`. Predările sunt în `docs/handoff/`, statusul în `TASKS.md`, gates în `GATES.md`.

Vechile `HANDOFF.md` și `intent.md` au fost păstrate integral în `docs/history/pre-interview-14-09-2026/`. Cele 103 handoff-uri T-01–T-19 rămân nemodificate. Nu le șterge și nu le „corecta” retrospectiv; consemnează diferențele în documentele curente.

Nu continua interviul estetic. **RF-01 este autorizat să înceapă** (gate G4a) — nu așteaptă nicio aprobare generală suplimentară; aprobarea separată privește doar arhitectura SQLite pentru RF-02 (gate G4b). Cod și teste separate pe roluri, comenzi executate numai de planner în PowerShell.
