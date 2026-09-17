# RF-K01b1 — corecție Tester

Data: 16-09-2026

## Rezultatul planner-ului

Comanda țintită a rulat 13 teste: 11 pass, 1 fail, 1 skip. Serverul a rămas PID 40652.

Fail-ul este în testul `missing, non-file, oversized, invalid JSON, and semantically invalid status are isolated`.

Așteptat ultimul warning: `STATUS_INVALID`.
Primit: `STATUS_TOO_LARGE`.

Cauza observată: testul rulează scanner-ul cu `maxStatusBytes: 16`, iar JSON-ul fixture-ului semantic invalid este el însuși mai mare de 16 bytes. Reader-ul îl respinge corect la gate-ul de bytes înainte de normalizare, deci cazul semantic nu este atins.

## Sarcina

Corectează exclusiv fixture-ul/limita din test astfel încât:

- cazul oversized să rămână fără echivoc peste limită;
- JSON-ul semantic invalid să rămână sub limită și să ajungă în RF-K01a;
- toate cele cinci warnings să fie testate distinct în aceeași ordine deterministă;
- nu slăbi aserțiunile și nu modifica implementarea.

Actualizează `docs/handoff/RF-K01b1-tester-raport.md` cu această corecție și cu faptul că planner-ul, nu Tester-ul, a executat prima suită.

## Fișiere permise

- `test/adapters/pi-subagents-files.test.mjs`
- `docs/handoff/RF-K01b1-tester-raport.md`

Nu rula comenzi/teste și nu atinge alte fișiere.
