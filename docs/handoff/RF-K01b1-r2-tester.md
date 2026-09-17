# RF-K01b1 r2 — brief Tester

Data: 16-09-2026

## Context

Citește `docs/handoff/RF-K01b1-reviewer-raport.md`, `docs/handoff/RF-K01b1-r2-coder.md` și implementarea actuală. Coder r2 a înlocuit citirea path-based cu FD stabil, identity check și citire bounded. Planner-ul a rulat probe sintetice pentru swap-junction, growth și candidate-link; toate au trecut. Transformă findings-urile Reviewer-ului în regresii independente.

## Fișiere permise

- modifică `test/adapters/pi-subagents-files.test.mjs`;
- creează `docs/handoff/RF-K01b1-r2-tester-raport.md`.

Nu modifica implementarea sau alte fișiere.

## Teste obligatorii noi

### 1. TOCTOU containment

Într-un director temporar:

- creează container/victim cu status valid intern și un director extern cu status valid care conține un marker privat unic;
- interceptează temporar `fs.openSync` numai pentru calea `victim/status.json`;
- exact înaintea open-ului real, redenumește directorul victim și pune în loc un symlink/junction către directorul extern;
- restaurează `fs.openSync` în `finally` indiferent de rezultat;
- dovedește că statusul extern nu intră în `runs` și markerul nu apare nicăieri în rezultat;
- cere warning-ul stabil `STATUS_LINK_REJECTED`;
- dacă platforma refuză crearea link-ului cu `EPERM`/`EACCES`, marchează testul skip explicit, cu motiv.

### 2. Creștere după `fstat`, citire bounded

- creează un status valid sub o limită mică;
- interceptează temporar `fs.readSync`; înaintea primei citiri, adaugă suficienți bytes la același fișier ca să depășească limita;
- restaurează metoda în `finally`;
- dovedește `STATUS_TOO_LARGE`, fără run acceptat;
- înregistrează lungimile cerute lui `readSync` și dovedește că bufferul/request-ul nu depășește `maxStatusBytes + 1`; testul nu trebuie să depindă de citirea întregului payload crescut.

### 3. Candidate link consumă buget

- într-un container, sortează un symlink/junction candidat înaintea unui run valid;
- rulează cu `maxRuns: 1`;
- cere `RUN_CANDIDATE_REJECTED`, zero runs și `truncated.runs === true`;
- skip explicit numai pentru `EPERM`/`EACCES` la crearea link-ului.

### 4. Descriptor închis

Adaugă cel puțin o aserțiune semnificativă că descriptorul deschis este închis și pe o ramură de respingere (de exemplu TOO_LARGE sau identity mismatch), prin instrumentarea temporară și restaurată a `fs.closeSync`. Nu depinde de numărul global de descriptori ai procesului.

## Disciplină de test

- Folosește numai tmp sintetic; fără Pi real, home/config, DB, rețea, server sau child process.
- Orice monkeypatch global trebuie restaurat în `finally`, chiar dacă aserțiunea eșuează.
- Nu slăbi testele existente și nu dubla inutil acoperirea.
- Nu rula comenzi/teste; planner-ul rulează tot.

## Raport

Descrie noile regresii, mecanismul determinist al cursei, izolarea monkeypatch-urilor, eventualele skip-uri de platformă și confirmă că nu ai rulat nimic.
