# HANDOFF — RPG Factory

> **Precedență:** `instructiuni.md` are prioritate peste tot ce s-a muncit până acum în proiect. Dacă acest fișier îl contrazice, `instructiuni.md` câștigă. Vezi `AGENTS.md` § „Precedența documentelor”.


Actualizat: **17-09-2026**.

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

- RF-K01a este acceptat, comis și publicat la `2d8049c`.
- RF-K01b1, RF-K01b2a și RF-K01b2b sunt acceptate de Reviewer, dar sunt încă locale, necomise și nepublicate.
- RF-K01b3a (ledger SQLite atomic) are implementarea și testele verzi: **13/13 țintit; 660 pass, 0 fail, 2 skip din 662 complet; syntax/diff-check PASS; server PID 40652 înainte/după**.
- RF-K01b3a este formal deschis numai fiindcă Reviewer-ul final nu a pornit: `gpt-5.6-sol` a întors `The usage limit has been reached`. Lucian a spus că va schimba agentul/modelul pentru continuare.
- Raportul/brief-ul de reluare este `docs/handoff/RF-K01b3a-r3-reviewer.md`; dovada publicabilă sanitizată este `docs/handoff/RF-K01b3a-validation-summary.md` (logul brut rămâne local); blocajul este consemnat în `docs/handoff/RF-K01b3a-r3-reviewer-attempt.md`.

### Următoarea acțiune

1. Rulează un **review read-only independent** pentru RF-K01b3a asupra stării curente; nu mai rescrie implementarea/testele dacă nu există finding concret.
2. Transcrie verdictul integral în `docs/handoff/RF-K01b3a-r3-reviewer-raport.md` și actualizează `GATES.md`, `TASKS.md`, `JURNAL.md`.
3. Dacă verdictul este ACCEPT, implementează **RF-K01b3b minimal**: coordonator explicit b1+b2b+ledger/recovery, fără polling global.
4. După b3b, prioritatea devine imediat vizuală: leagă ierarhia/stările Pi reale la kingdom. Nu lăsa b3c/b4 să blocheze primul kingdom funcțional; proof-ul complet și reporter-ul opt-in pot urma după vertical slice-ul vizibil.

Nu instala/activa reportere globale, nu citi artefacte Pi reale fără configurație/aprobare explicită, nu migra baza reală, nu opri serverul și nu face commit/push/deploy fără gate separat.

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
- local, nepublicat: b1 discovery/status reader, b2a event contract, b2b JSONL reader, b3a migrarea `005`, `pi-ingestion.js` și testele aferente.

Dovada curentă a suitei complete este **660 pass, 0 fail, 2 skip din 662** pe 17-09-2026. Testele RF-K01b folosesc numai date sintetice/DB temporare; serverul de pe portul 5311 a rămas PID 40652.

Nu există încă: coordonatorul b3b activ, citire Pi reală activată, binding-ul kingdom la Pi, mining/proof vizual complet sau reporter global.

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
