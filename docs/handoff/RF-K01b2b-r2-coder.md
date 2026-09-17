# RF-K01b2b — corecție Coder r2

Data: 16-09-2026

## Sarcină

Modifică exclusiv:

- `adapters/pi-subagents-events-file.js`;
- `docs/handoff/RF-K01b2b-coder-raport.md`.

Nu rula comenzi sau teste.

## Defecte de reparat

1. **Oversized fără LF la EOF.** În ramura `newline === -1`, verificarea `remaining > maxEventBytes` trebuie să aibă prioritate față de clasificarea EOF incomplete. O linie finală care a depășit limita intră în discard bounded, avansează cursorul peste bytes citiți, păstrează `discardingOversizedLine:true` și emite `EVENT_LINE_TOO_LARGE`; nu rămâne blocată la același offset ca `incompleteLine`.

2. **Read failure nu trebuie să piardă cursorul sigur.** După stabilirea fileKey/reset/offset/discarding, o excepție `readSync` trebuie să întoarcă cursorul de start sigur pentru acea citire și reset-ul deja detectat. Pentru aceeași identitate păstrează offset-ul primit, nu revine la zero și nu dublează evenimente la retry. Resetarea la zero rămâne corectă numai când rotația/truncarea fusese deja detectată sau când citirea prematură dovedește truncare concurentă.

3. **Non-file portabil.** Dacă `events.jsonl` observat inițial nu este fișier regulat, întoarce `EVENTS_NOT_FILE` înainte de `openSync`, ca Windows să nu-l clasifice accidental `EVENTS_READ_FAILED`. Păstrează verificarea de identitate înaintea tipului după `fstat`, pentru swap-urile concurente ale unui fișier inițial valid.

4. Importă explicit `TextDecoder` din `node:util`/`util`, fără a depinde de global implicit.

## Constrângeri

- Nu schimba API-ul, shape-ul, limitele sau scope-ul.
- Nu slăbi verificările root/run/file, `O_NOFOLLOW`, descriptor/finally ori privacy.
- Actualizează raportul cu remediile și spune explicit că nu ai rulat validarea.
