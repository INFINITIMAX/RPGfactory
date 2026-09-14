# RF-00-R — brief reviewer (read-only)

**Data:** 14-09-2026, EET.
**Rol:** reviewer independent, read-only.
**Lansat de:** planner.
**Task-ul revizuit:** RF-00 — consolidarea contractului documentar (interviu → intent → spec → plan → gates), înainte de primul lot de cod RF-01.

---

## 1. Sarcina

Nu revizuiești cod. RF-00 a produs **numai documente**. Verifici dacă acele documente formează un contract pe care un coder îl poate executa fără să inventeze nimic, și dacă nu conțin afirmații false despre ce este deja construit.

Răspunde la cinci întrebări, în ordinea asta:

### Î1 — Trasabilitate: intenția utilizatorului a supraviețuit?

`docs/DECISIONS.md` conține registrul I01–I43 al interviului. `instructiuni.md` §3 conține același registru, în formă de tabel.

- Sunt toate cele 43 prezente în ambele? Lipsește vreuna? Diferă vreuna ca sens între cele două copii?
- Apar în `intent.md` și `spec.md` fără a fi slăbite, extinse sau reinterpretate?
- Există în `spec.md` / `plan.md` vreo cerință care **nu** derivă din I01–I43 și nici nu este etichetată ca propunere?

### Î2 — Propunere vs. aprobare: cine a decis, de fapt?

Handoff-ul insistă (`instructiuni.md` §1, §13) că SQLite, fereastra de consum de 60 s, pragurile de mărime și schema detaliată sunt **propuneri ale planner-ului**, nu răspunsuri ale lui Lucian.

- Sunt etichetate ca atare peste tot unde apar? Caută în `spec.md` §2, §3, `plan.md` §3, §7, `TASKS.md`, `GATES.md`.
- Există vreun loc unde o propunere a planner-ului este prezentată ca decizie a utilizatorului, sau ca fapt stabilit?
- Invers: există vreo decizie reală a lui Lucian (I01–I43) degradată la statut de „propunere”?

### Î3 — Contradicția centrală: este RF-01 autorizat sau blocat?

Aceasta este cea mai importantă întrebare a review-ului.

`instructiuni.md` §1 declară explicit: *„Interviul s-a încheiat… nu cere încă o aprobare generală pentru primul lot”* și *„începerea fusese deja autorizată”*.

Dar:
- `TASKS.md`, rândul RF-01, spune `BLOCAT DE APROBAREA PLANULUI`;
- `TASKS.md` §„Următoarea acțiune” pct. 2 cere *„Lucian confirmă arhitectura propusă… și începutul RF-01”*;
- `GATES.md` G4 este nebifat: *„Lucian a aprobat arhitectura propusă și începerea RF-01”*;
- `plan.md` are în antet `Status: PROPUS, în așteptarea aprobării lui Lucian înainte de Build` și §7 „Aprobare solicitată”;
- `AGENTS.md` §„Înainte de cod” spune *„Planul trebuie aprobat”*;
- `intent.md` §„Pași și aprobare” pct. 2 cere aprobarea planului înainte de schimbări non-triviale.

**Ce trebuie să stabilești:**

1. Este contradicția reală, sau este o distincție legitimă între *două aprobări diferite* — (a) începerea lucrului la RF-01, care e dată, și (b) aprobarea arhitecturii SQLite/RF-02, care nu e dată?
2. Dacă e o distincție legitimă, care documente o exprimă greșit și **exact ce formulare** ar trebui să aibă, ca RF-01 să poată porni fără ca gate-urile reale (SQLite, instalări globale, migrare, push) să fie desființate din greșeală?
3. Există riscul invers — ca „alinierea statusurilor” să devină pretext pentru a bifa gate-uri care chiar sunt nebifate?

Fii concret: dă lista `fișier → formulare actuală → formulare corectă`.

### Î4 — Afirmații false despre starea reală

Verifică dacă vreun document susține că există ceva ce nu există:

- `TASKS.md` rândul RF-00-R indică drept dovadă `docs/handoff/RF-00-reviewer.md` — brief-ul acesta, care **nu exista** în momentul în care rândul a fost scris. Statusul spunea „PREGĂTIT, nelansat”. Este onest sau induce în eroare?
- Baseline-ul „205 teste / 0 eșecuri” (`TASKS.md`, `instructiuni.md` §5, `intent.md`) — este peste tot marcat ca istoric, în copie izolată, netransferabil? Sau apare undeva ca dovadă curentă?
- `docs/PARITY.md` (P01–P56) — este prezentat ca inventar de lucru, sau undeva ca paritate implementată?
- Există link-uri către fișiere inexistente? Verifică fiecare referință de forma `docs/...`, `*.md#ancoră`.
- Rapoartele istorice `docs/handoff/T-01…T-19-*.md` — sunt undeva prezentate drept certificare a stării curente, contrar avertismentului din `AGENTS.md`?

### Î5 — Este RF-01 executabil ca atare?

Citește `plan.md` §2 („Primul lot de cod propus: RF-01”), `instructiuni.md` §10 (pași + fișiere + criterii) și `docs/AUDIT-13-09-2026.md`.

- Fiecare criteriu de acceptare RF-01 este **verificabil printr-o probă concretă**, sau unele sunt afirmații de intenție imposibil de testat?
- Lista de fișiere vizate acoperă defectele de securitate pe care RF-01 pretinde că le închide? Lipsește vreun fișier necesar? Este inclus vreunul fără motiv?
- Există defecte din audit care par să pice în RF-01 dar nu sunt menționate nicăieri în lotul lui — sau invers, defecte UI (XSS, animații, jitter/selecție, allocateCells) atribuite greșit lui RF-01 în loc de loturile UI?
- Este lotul prea mare pentru o singură predare către un coder? Dacă da, unde ar trebui tăiat și pe ce criteriu?
- Contrazice ceva din RF-01 regulile de siguranță din `AGENTS.md` §„Siguranță și verificare”?

---

## 2. Contextul

**Proiect:** RPG Factory, `D:/RPGfactory` — consolă locală de observabilitate pentru agenții reali din Pi și Claude Code, reprezentată ca lume medievală 2D. Referința funcțională este dashboard-ul Bot Crossing (MIT).

**Unde suntem:** interviul cu utilizatorul (Lucian) s-a încheiat pe 14-09-2026 și a produs 43 de decizii. Un audit pe 13-09-2026 a găsit defecte reale în prototipul existent (securitate HTTP, validare stare, selecție/animație în canvas). RF-00 a consolidat totul în documente. **Nicio linie de cod nou nu a fost scrisă.** HEAD este `6fecdad`, identic cu remote-ul.

**De ce acest review:** RF-00-R fusese planificat și niciodată lansat. Lucian a cerut explicit ca review-ul documentar să se facă **înainte** de RF-01. Tu ești acel review. Verdictul tău decide dacă planner-ul pornește RF-01 acum sau repară întâi contractul.

**Ordinea de citire recomandată:**
1. `instructiuni.md` — handoff-ul consolidat, 495 linii; §1, §3, §10, §13 sunt cele mai relevante
2. `intent.md` — scopul confirmat și excluderile
3. `docs/DECISIONS.md` — registrul I01–I43
4. `spec.md` — designul tehnic propus
5. `plan.md` — ordinea RF-00…RF-07 și RF-01 în detaliu
6. `TASKS.md`, `GATES.md` — statusul declarat
7. `AGENTS.md` — regulile de proiect
8. `docs/AUDIT-13-09-2026.md` — defectele reale de reparat
9. `docs/PARITY.md`, `docs/INTEGRATIONS.md` — inventare
10. Codul, doar cât să verifici Î5: `server.js`, `state.js`, `test/server.test.mjs`, `test/state.test.mjs`, `package.json`

---

## 3. Rezultatul așteptat

Întoarce un raport în **română**, în text simplu, cu exact structura asta:

```
## VERDICT

APROBAT | APROBAT CU OBSERVAȚII | RESPINS

Într-o frază: de ce.

## CONSTATĂRI

### C1 — [titlu scurt]
Severitate: BLOCANT | MAJOR | MINOR
Fișier: <cale>:<linie sau secțiune>
Ce spune acum: <citat sau parafrază exactă>
De ce e o problemă: <consecința concretă — ce ar face greșit un coder sau planner care citește asta>
Ce ar trebui să spună: <formulare propusă, concretă>

### C2 — ...
```

Apoi, la final:

```
## RĂSPUNS PUNCTUAL LA ÎNTREBĂRI

Î1: ...
Î2: ...
Î3: ...
Î4: ...
Î5: ...

## CE AM VERIFICAT ȘI CE NU

Verificat: <listă>
Neverificat / în afara accesului meu: <listă>
```

**Reguli pentru raport:**
- `BLOCANT` = RF-01 nu poate porni până nu se repară. Folosește-l parcimonios și justifică-l.
- Fiecare constatare trebuie să aibă un fișier și o locație. Fără observații generale nelocalizabile.
- Dacă un document este corect, spune asta explicit. Un review care găsește probleme peste tot ca să pară util este un review prost.
- Nu propune funcționalități noi de produs. Nu e rolul tău aici.
- Dacă nu ai putut verifica ceva, scrie-l la „Neverificat”. Nu deduce.

---

## 4. Constrângeri dure

- **Ești read-only.** Nu ai unelte de scriere și nu trebuie să ceri. Nu scrii niciun fișier, inclusiv raportul tău — planner-ul îl transcrie integral pe disc.
- **Nu rulezi comenzi.** Nici `git`, nici `node`, nici teste. Dacă o verificare ar necesita rulare, notează la „Neverificat” ce anume ar trebui rulat și de ce.
- **Nu delega.** Nu porni alți agenți.
- **Limbă:** română.

### Ce nu ai voie să citești

- `.env` și orice valoare din el
- `data/` — starea de runtime reală
- `assets/`, `public/sprites/`, `public/ui/` — artă sub licență restrictivă
- Orice din `~/.claude/`, `~/.pi/`, sau alte directoare din afara `D:/RPGfactory`
- Nu reproduce în raport secrete, tokenuri, căi de autentificare sau conținut privat, dacă dai peste ele accidental

### Ce nu ai voie să faci în raport

- Nu rescrie deciziile I01–I43. Ele sunt ale utilizatorului, nu ale tale; poți semnala doar dacă un document le-a deformat.
- Nu declara un gate ca îndeplinit. Gate-urile G1–G4 din `GATES.md` sunt manuale și aparțin planner-ului și lui Lucian.
- Nu recomanda commit, push, instalări globale, migrări de date sau pornirea/oprirea vreunui serviciu.
- Nu aproba arhitectura SQLite. Nu e a ta de aprobat — e a lui Lucian. Poți evalua doar dacă e *prezentată* corect ca propunere.
