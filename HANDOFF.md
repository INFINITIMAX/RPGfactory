# HANDOFF — RPG Factory

> **Precedență:** `instructiuni.md` are prioritate peste tot ce s-a muncit până acum în proiect. Dacă acest fișier îl contrazice, `instructiuni.md` câștigă. Vezi `AGENTS.md` § „Precedența documentelor”.


Actualizat: **14-09-2026**.

## 1. Stare curentă și următoarea acțiune

**Interviul de produs este încheiat. Estetica fină este amânată.** Lucian a cerut să trecem la construire, nu să continuăm alegerea clădirilor.

> **NOTĂ DE PRECEDENȚĂ (14-09-2026).** Punctul de aprobare de mai jos a fost **înlocuit** de `instructiuni.md` §1/§13 și de reparația cerută de review-ul RF-00-R (constatarea C1). Textul original al pasului 2 cerea o singură aprobare pentru două lucruri diferite — arhitectura SQLite *și* pornirea RF-01 — ceea ce bloca RF-01 de o decizie de care nu depinde tehnic. Citește `instructiuni.md` **înaintea** acestui fișier. Restul documentului rămâne valabil.

Deciziile confirmate sunt în `docs/DECISIONS.md` (I01–I43), rezumate în `intent.md`. Specificația tehnică e în `spec.md`; planul de producție e în `instructiuni.md` §10 (`plan.md` a fost înlocuit). **Nu există cod nou de produs în această etapă.**

Următorii pași:
1. ~~Închide review-ul documentar RF-00-R~~ — **făcut** 14-09-2026: verdict RESPINS, transcris integral în `docs/handoff/RF-00-reviewer-raport.md`, constatări acceptate și reparate. Re-review (RF-00-R2) urmează.
2. **RF-01 este autorizat să înceapă** (gate G4a) — nu mai cere aprobare generală pentru el; păstrează stocarea JSON. **Arhitectura SQLite rămâne neaprobată** (gate G4b) și se confirmă separat, înainte de RF-02.
3. Brief coder pe disc → coder → brief tester → tester → teste rulate de planner → reviewer read-only → raport integral/decizie.
4. Nu instala reportere/global hooks, nu migra date reale, nu opri serverul activ și nu face push/deploy fără gate separat.

**Indexul de lucru este `TASKS.md`; nu deduce statusul din timestamps.**

## 2. Ce construim acum

Consolă locală de observabilitate pentru **Pi + Claude Code**, cu profiluri permanente și istoric. Bot Crossing este referința funcțională principală; codul/controalele pot fi reutilizate cu MIT și păstrate temporar cu aspectul lor original dacă reskin-ul nu este gata.

- Hartă 2D medievală dominantă, panou operațional în dreapta.
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

Bază Git: `6fecdadb773bb8ec0015bfcccedaaaf697ff7b77`, repo `https://github.com/INFINITIMAX/RPGfactory`. La auditul din 13-09-2026, HEAD local și remote erau identice. Orice confirmare ulterioară cere `git ls-remote`, nu deducție din `git log`.

Implementare existentă: Node HTTP fără framework, CommonJS, Canvas 2D într-un `public/app.js` mare, citire numai a registrului Claude CLI și a cozilor transcripturilor, `rank.js`, `status.js`, `state.js`, `zones.js`, `merge-state.js`. Date în `data/state.json`, artă locală ignorată de Git.

**Nu există încă:** adaptor Pi, profiluri permanente/SQLite, HUD de paritate, dosare/telemetrie completă sau leveling verificat.

Auditul complet este `docs/AUDIT-13-09-2026.md`. Probleme-cheie: animații contrare activității, selecție ambiguă, XSS, stale invizibil, bind pe toate interfețele, containment static incomplet, validare/CAS insuficiente și plecare invizibilă înainte de turn.

Dovadă istorică: **205 teste, 0 fail**, rulate pe 13-09-2026 într-o copie izolată, cu `child_process.spawn` substituit pentru a nu deschide harness-uri. Nu pretinde că această dovadă validează noua arhitectură.

**ATENȚIE:** testele actuale de state modifică temporar fișierul real `data/state.json`, iar testele API pot lansa opener-ul Windows. Până la RF-01, nu rula suita direct peste checkout-ul activ. Folosește copie temporară și opener substituit, conform auditului. RF-01 trebuie să elimine această nevoie prin dependency injection.

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
