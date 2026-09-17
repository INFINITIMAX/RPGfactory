# RF-K01b2b — raport Coder r5

## Fișiere schimbate

- `adapters/pi-subagents-events-file.js`
- `docs/handoff/RF-K01b2b-coder-raport.md`

## Corecții livrate

- Pentru o linie fără LF, reader-ul calculează separat bytes comparabili ai payload-ului: `remaining - 1` dacă ultimul byte este CR, altfel `remaining`. Dacă aceștia depășesc `maxEventBytes`, intră imediat în discard bounded și avertizează `EVENT_LINE_TOO_LARGE`, inclusiv când EOF-ul curent se termină în CR.
- Numai un CR terminal cu payload în limită rămâne provizoriu candidat pentru delimitatorul CRLF: la EOF reader-ul păstrează cursorul la începutul liniei, indică `incompleteLine: true` și nu are lucru suplimentar; dacă snapshot-ul continuă dincolo de fereastra citită, indică `limits.bytes: true` și `hasMore: true`, tot fără avansarea cursorului.
- La citirea ulterioară, numai LF-ul confirmă CRLF; atunci `consumeLine` procesează linia o singură dată și exclude CR înainte de aplicarea limitei payload-ului. Dacă octetul ulterior nu este LF, calea existentă de discard bounded clasifică payload-ul real oversized.
- Validarea opțiunilor cere acum `maxReadBytes >= maxEventBytes + 2`, astfel încât o fereastră validă poate conține payload-ul maxim și delimitatorul CRLF, fără retry fără progres. Defaulturile și hard caps nu au fost schimbate.

## Comportament și limite păstrate

Modulul CommonJS exportă `readPiSubagentsEvents(options)`. Primește numai rădăcina și directorul de run injectate explicit, `expectedRunId`, cursorul opțional și limitele de citire. Opțiunile sau cursorul invalide întorc exact `INVALID_OPTIONS`, fără excepție.

Reader-ul deschide exclusiv `events.jsonl` din directorul verificat, cu verificări `lstat`/`realpath`/identitate, containment canonic, descriptor read-only și `O_NOFOLLOW` unde este disponibil. Citește doar snapshot-ul fixat prin `fstat`, închide descriptorul în `finally` și nu face write, scanare, deduplicare semantică sau proiecție a stării curente.

Valorile implicite sunt 256 KiB per citire, 64 KiB per eveniment și 200 linii. Plafonurile sunt 4 MiB, 1 MiB și 1000 linii; citirea trebuie să fie de cel puțin limita unui eveniment plus cei doi octeți CRLF.

## Validare și riscuri rămase

Nu am rulat validare, comenzi sau teste, conform brief-ului. Rămâne necesară testarea independentă a frontierelor `maxEventBytes` cu payload oversized urmat de CR fără LF, apoi CRLF, CR urmat de alt octet, a retry-ului pentru `maxReadBytes` cu diferențe 0/1/2 și a curselor filesystem.
