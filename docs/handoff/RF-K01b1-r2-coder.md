# RF-K01b1 r2 — corecție Coder după review

Data: 16-09-2026

## Context și finding acceptat

Citește integral `docs/handoff/RF-K01b1-reviewer-raport.md`. Reviewer-ul a respins prima versiune deoarece `readStatus()` verifică `lstat`/`realpath`, apoi redeschide `status.json` prin cale cu `readFileSync`. Un swap între verificare și open poate urma un symlink extern, iar un fișier care crește poate fi citit integral înainte de gate-ul de bytes.

Contractul și planul nu se schimbă. Corectezi execuția citirii.

## Fișiere permise

- `adapters/pi-subagents-files.js`;
- creează `docs/handoff/RF-K01b1-r2-coder-raport.md`.

Nu modifica teste sau alte fișiere.

## Remediu obligatoriu

În `readStatus()`:

1. Păstrează verificările inițiale de tip/link/size și containment canonical.
2. Deschide `status.json` o singură dată cu `fs.openSync` și păstrează descriptorul stabil pentru toate verificările/citirea ulterioară.
3. Folosește `fs.constants.O_RDONLY` și adaugă `fs.constants.O_NOFOLLOW` numai dacă este disponibil numeric pe platformă.
4. Imediat după open, folosește `fs.fstatSync(fd)`:
   - trebuie să fie fișier regulat;
   - compară identitatea cu `lstat`-ul inițial cel puțin prin `dev` și `ino`;
   - orice diferență sau refuz NOFOLLOW devine `STATUS_LINK_REJECTED`, fără eroare brută.
5. Verifică dimensiunea din `fstat` înainte de citire.
6. Nu folosi `readFileSync(statusPath)`. Citește exclusiv din descriptor într-un buffer plafonat la `maxStatusBytes + 1`, folosind `fs.readSync` în buclă până la EOF sau până ai citit acel plafon.
7. Dacă sunt citiți mai mult de `maxStatusBytes`, întoarce `STATUS_TOO_LARGE`; nu aloca și nu citi fișierul integral.
8. Închide descriptorul în `finally` în toate ramurile. O eroare de close nu trebuie să suprascrie warning-ul deja decis și nu trebuie să arunce.
9. Parsează numai bytes efectiv citiți, în UTF-8, apoi folosește același normalizator RF-K01a.
10. Orice eroare internă neclasificată rămâne `STATUS_READ_FAILED`, fără message/path.

Poți extrage helpers mici pentru identity/read bounded, dar nu extinde scope-ul.

## Cerințe de compatibilitate

- CommonJS, API/envelope/warnings existente neschimbate.
- Funcționează când `O_NOFOLLOW` nu există (Windows), bazându-se și pe identity check.
- Maximum de alocare pentru payload este `maxStatusBytes + 1`.
- Fără dependențe noi, DB, events, server, UI, reporter sau acces real Pi.
- Fără side effects la import.
- Nu rula comenzi/teste; planner-ul le rulează.

## Raport

În raport descrie exact flags, comparația de identitate, bucla bounded, mapping-ul erorilor, închiderea FD și riscurile reziduale. Confirmă că nu ai rulat comenzi/teste.
