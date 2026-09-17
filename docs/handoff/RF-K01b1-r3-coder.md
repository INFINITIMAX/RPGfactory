# RF-K01b1 r3 — corecție Coder după al doilea review

Data: 16-09-2026

## Context

Citește integral `docs/handoff/RF-K01b1-r2-reviewer-raport.md`. R2 a securizat `status.json`, dar trust anchor-ul root poate fi schimbat în junction exact între `lstat(root)` și `realpathSync(root)`, făcând calea externă să devină chiar `canonicalRoot`.

## Fișiere permise

- `adapters/pi-subagents-files.js`;
- creează `docs/handoff/RF-K01b1-r3-coder-raport.md`.

Nu modifica teste sau alte fișiere.

## Remediu obligatoriu — root anchor

1. Introdu un helper mic de identitate care compară cel puțin `dev` și `ino`.
2. În `canonicalDirectory(root, warnings)` păstrează `lstat`-ul inițial al root-ului valid.
3. După `realpathSync(root)`, reverifică atât:
   - calea root furnizată, printr-un nou `lstat`;
   - calea canonical returnată, prin `lstat`/`stat` potrivit.
4. Ambele obiecte reverificate trebuie să fie directoare normale și să aibă aceeași identitate `dev`/`ino` ca obiectul inițial.
5. Această verificare dublă trebuie să blocheze și varianta swap → `realpath` extern → restore root înaintea reverificării: canonical path-ul memorat trebuie și el să identifice obiectul inițial.
6. Orice symlink/junction ori diferență de identitate devine `ROOT_LINK_REJECTED`, fără cale/mesaj brut. Dispariția sau eroarea de acces poate rămâne `ROOT_UNAVAILABLE`.
7. Returnează canonical root numai după toate verificările.

## Remediu obligatoriu — ordinea status identity/type

În verificarea `fstat` a descriptorului `status.json`:

- compară mai întâi `dev`/`ino` cu `lstat`-ul inițial;
- orice mismatch → `STATUS_LINK_REJECTED`;
- abia dacă identitatea coincide verifică `opened.isFile()` și clasifică `STATUS_NOT_FILE`.

## Constrângeri

- Păstrează API-ul, envelope-ul, warnings și toate celelalte comportamente.
- Nu elimina FD stabil, `O_NOFOLLOW`, citirea bounded sau `finally close` din r2.
- Fără noi dependențe, DB, events, server, UI, reporter sau acces real Pi.
- Fără efecte la import.
- Nu rula comenzi/teste; planner-ul rulează tot.

## Raport

Descrie verificarea root inițial/current/canonical, cum blochează swap-ul și swap-restore, ordinea identity/type pentru status și riscurile reziduale. Confirmă că nu ai rulat comenzi/teste.
