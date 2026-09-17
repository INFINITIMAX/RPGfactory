# RF-K01b1 r3 — brief Tester

Data: 16-09-2026

## Context

Citește `docs/handoff/RF-K01b1-r2-reviewer-raport.md`, brief-ul/raportul Coder r3 și implementarea actuală. Planner-ul a confirmat prin probe sintetice root swap, swap-restore și ordinea identity/type.

## Fișiere permise

- modifică `test/adapters/pi-subagents-files.test.mjs`;
- creează `docs/handoff/RF-K01b1-r3-tester-raport.md`.

Nu modifica implementarea sau alte fișiere.

## Regresii obligatorii

### 1. Root swap înainte de canonicalizare

- creează un root container intern valid și un container extern cu status valid și marker privat unic;
- monkeypatch temporar `fs.realpathSync` numai pentru root-ul testat;
- după `lstat`-ul făcut de implementare, dar înainte de realpath-ul real, redenumește root-ul și pune în loc un junction/symlink către extern;
- lasă link-ul în loc până când scanner-ul face reverificarea;
- cere zero runs, exact `ROOT_LINK_REJECTED` și absența markerului/id-ului extern;
- restaurează metoda și filesystem-ul în `finally`; skip explicit doar la `EPERM`/`EACCES`.

### 2. Root swap → realpath extern → restore

Adaugă o variantă distinctă sau subtest clar care:

- face swap-ul înainte de realpath;
- obține canonical path-ul extern;
- înlătură junction-ul și restaurează root-ul original înainte ca `canonicalDirectory()` să continue;
- dovedește că verificarea căii canonical memorate detectează totuși identitatea externă: zero runs, `ROOT_LINK_REJECTED`, fără marker privat.

Această regresie nu trebuie să poată trece dacă implementarea verifică numai root-ul curent după realpath.

### 3. Identity mismatch are prioritate față de tip

- pornește de la un status regulat valid;
- instrumentează temporar `fs.fstatSync` pentru descriptorul scanner-ului și întoarce o identitate diferită, plus `isFile() === false`;
- cere exact `STATUS_LINK_REJECTED`, nu `STATUS_NOT_FILE`;
- restaurează monkeypatch-ul în `finally` și dovedește că descriptorul este închis dacă este practic fără a duplica inutil testul r2.

## Disciplină

- Numai directoare tmp sintetice; fără Pi real, home/config, DB, rețea, server sau child process.
- Toate monkeypatch-urile și mutările filesystem se restaurează în `finally`, inclusiv la fail/skip.
- Nu slăbi testele existente și nu adăuga teste tautologice.
- Nu rula comenzi/teste; planner-ul rulează tot.

## Raport

Descrie mecanismul determinist al celor două root races, de ce swap-restore validează canonical identity, regresia identity/type, cleanup-ul și eventualele skip-uri. Confirmă că nu ai rulat nimic.
