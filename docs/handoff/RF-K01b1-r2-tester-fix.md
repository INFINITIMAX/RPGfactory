# RF-K01b1 r2 — corecție fixture growth

Data: 16-09-2026

## Rezultat planner

Suita țintită: 16 total, 14 pass, 1 fail, 1 skip. Serverul a rămas PID 40652.

Fail: `growth after fstat is bounded, rejected, and closes its descriptor` la `assert.equal(grew, true)`.

Cauza măsurată: fixture-ul inițial serializat are exact 65 bytes:

```json
{"runId":"small-id","state":"running","startedAt":100,"steps":[]}
```

Testul configurează `maxStatusBytes = 64`, deci implementarea îl respinge corect înainte de `fstat/readSync`; monkeypatch-ul nu este apelat.

## Sarcina

Corectează exclusiv fixture-ul sau limita astfel încât:

- statusul inițial valid să fie demonstrabil sub limită;
- append-ul să îl ducă clar peste limită;
- aserțiunile pentru `grew`, `STATUS_TOO_LARGE`, request maxim `maxStatusBytes + 1` și exact un `closeSync` să rămână;
- nu slăbi celelalte teste și nu modifica implementarea.

Actualizează `docs/handoff/RF-K01b1-r2-tester-raport.md` cu rezultatul primei rulări r2 și cauza/corecția fixture-ului.

## Fișiere permise

- `test/adapters/pi-subagents-files.test.mjs`
- `docs/handoff/RF-K01b1-r2-tester-raport.md`

Nu rula comenzi/teste și nu atinge alte fișiere.
