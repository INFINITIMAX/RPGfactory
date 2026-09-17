# RF-K01b2b — corecție Coder r4 după review

Data: 16-09-2026

## Sarcină

Modifică exclusiv:

- `adapters/pi-subagents-events-file.js`;
- `docs/handoff/RF-K01b2b-coder-raport.md`.

Nu modifica testele și nu rula comenzi/teste.

## P1 de reparat

Un payload valid de exact `maxEventBytes`, urmat de CR, dar cu LF încă neobservat, nu trebuie clasificat oversized. În ramura `newline === -1`:

- dacă ultimul byte disponibil este CR, tratează-l provizoriu ca posibil delimitator CRLF și exclude-l din comparația cu `maxEventBytes`;
- cât timp LF nu confirmă delimitatorul, nu parsa și nu avansa cursorul peste linie;
- la EOF setează `incompleteLine:true`, `hasMore:false`;
- dacă mai există bytes în snapshot dincolo de fereastră, păstrează cursorul la începutul liniei și setează `limits.bytes:true`, `hasMore:true`;
- când LF apare, linia completă trebuie procesată o singură dată prin `consumeLine`, care elimină CR înainte de limita payload-ului;
- dacă byte-ul următor nu este LF și payload-ul real depășește limita, intră normal în discard bounded.

## Prevenirea retry-ului fără progres

Actualizează validarea astfel încât `maxReadBytes >= maxEventBytes + 2`. Valori cu diferență 0 sau 1 sunt `INVALID_OPTIONS`. Defaulturile/hard caps rămân neschimbate.

## Păstrează

Toate verificările filesystem, cursor/rotation/truncation, warning-urile, privacy, descriptor/finally și corecțiile r2/r3. Nu extinde scope-ul.

Actualizează raportul și menționează explicit că nu ai rulat validarea.
