# RF-K01b2b — raport Reviewer

VERDICT: REJECT

## Review

### Findings

- **Finding: P1 — un eveniment CRLF valid poate fi pierdut definitiv la limita `maxEventBytes`.**
  **Locație:** `adapters/pi-subagents-events-file.js:274-278`, `adapters/pi-subagents-events-file.js:333-342`; contract: `spec.md:154-156`.
  `consumeLine()` elimină corect CR înainte să aplice limita, dar ramura fără LF compară întreaga secvență cu `maxEventBytes`. Dacă payload-ul are exact limita, iar prima citire se termină după CR, înainte de LF, `remaining === maxEventBytes + 1`: codul îl marchează prematur `EVENT_LINE_TOO_LARGE`, avansează cursorul și intră în discard. După apariția LF, evenimentul este abandonat, deși CR trebuia exclus din limită și linia incompletă nu trebuia să avanseze cursorul.
  **Corecție minimă:** tratați un CR terminal posibil ca parte a delimitatorului CRLF înainte de declararea oversized; păstrați cursorul la începutul liniei până când LF confirmă delimitarea. Adăugați regresie: payload exact la limită + CR, apoi append LF, cu emitere unică și fără warning oversized.

- **Finding: P2 — testul combinat pentru link-uri face dovada platform-specific neclară.**
  **Locație:** `test/adapters/pi-subagents-events-file.test.mjs:88-103`.
  Root-link, run-link și file-link sunt în același subtest. Conform dovezii Planner, crearea file-symlink a primit `EPERM`, iar întregul subtest a fost raportat skipped, deși aserțiunile root/run fuseseră deja executate. Astfel, rezultatul nu atestă separat cele două cazuri reușite.
  **Corecție minimă:** separați root-link, run-link și events-link în trei teste, fiecare cu propriul skip limitat la `EPERM`/`EACCES`.

### Evaluare Coder

- Validarea opțiunilor și cursorului este strictă și path-free (`adapters/pi-subagents-events-file.js:153-164`).
- Sunt implementate containment-ul canonic, `O_NOFOLLOW`, comparația identității descriptorului și închiderea în `finally` (`adapters/pi-subagents-events-file.js:168-224`, `360-365`).
- Snapshot-ul, cursorul, rotation/truncation și păstrarea cursorului la read failure sunt coerente (`adapters/pi-subagents-events-file.js:227-269`).
- Liniile complete consumă buget înainte de decodare/parsing/normalizare, iar warning-urile nu includ payload brut (`adapters/pi-subagents-events-file.js:274-305`).
- Reluarea oversized nu mai dublează offset-ul, iar EOF/multi-window sunt tratate bounded (`adapters/pi-subagents-events-file.js:308-358`).
- Modulul nu introduce discovery, DB, server/UI sau write side effects.
- Defectul P1 împiedică însă garantarea cursorului fără pierderi pentru toate liniile CRLF permise.

### Evaluare Tester

- Matricea acoperă opțiuni/cursori, ferestre, bugete, normalizare/privacy, oversized incremental, rotation/truncation, read failures, TOCTOU și snapshot growth.
- Nu am identificat aserțiuni tautologice sau teste evident always-pass.
- Lipsește cazul de frontieră descris în P1.
- Testul combinat de link-uri trebuie separat pentru dovadă clară.
- Rezultatele de execuție sunt dovezi furnizate de Planner, nu rerulate în acest review read-only: 16 țintite, 15 pass, 1 skip; 644 complete, 642 pass, 2 skip.

### Residual risks

- Respingerea file-symlink nu a fost certificată dinamic pe Windows din cauza `EPERM`; este susținută doar de inspecția codului.
- Integrarea cu artefacte Pi reale nu a fost verificată, conform scope-ului intenționat.
- După corecția P1 trebuie rerulate testul țintit și suita completă în mediul izolat.

**Merge verdict: BLOCKED**

---

## Decizia Planner-ului

Verdict acceptat integral. P1 este defect de implementare, iar P2 este defect de dovadă. Ciclul revine la Coder pentru frontiera CRLF și apoi la Tester pentru regresie/separarea testelor. Pentru a evita un retry fără progres când `maxReadBytes` este doar cu un byte peste `maxEventBytes`, contractul va cere spațiu pentru payload + CRLF: `maxReadBytes >= maxEventBytes + 2`.
