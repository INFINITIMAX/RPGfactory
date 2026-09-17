# RF-K01b2b — corecție Coder r5

Data: 16-09-2026

## Sarcină

Modifică exclusiv `adapters/pi-subagents-events-file.js` și raportul Coder. Nu rula comenzi/teste.

## Defect

R4 tratează orice segment fără LF care se termină în CR ca posibil CRLF, fără să verifice dacă payload-ul rămas după excluderea CR depășește deja `maxEventBytes`. O linie foarte mare terminată în CR la EOF poate rămâne astfel retryable la același offset.

## Corecție

În ramura fără LF:

1. calculează `endsWithCarriageReturn`;
2. calculează bytes comparabili ai payload-ului: `remaining - 1` dacă se termină în CR, altfel `remaining`;
3. dacă bytes comparabili depășesc `maxEventBytes`, intră imediat în discard bounded exact ca oversized-ul existent, chiar dacă ultimul byte este CR;
4. numai dacă bytes comparabili sunt în limită, CR-ul terminal primește tratamentul provizoriu incomplete/window din r4.

Păstrează cerința `maxReadBytes >= maxEventBytes + 2` și toate celelalte contracte. Actualizează raportul; nu rula validarea.
