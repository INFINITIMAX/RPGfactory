# RF-K01b2b — corecție Coder r3

Data: 16-09-2026

## Sarcină

Modifică exclusiv `adapters/pi-subagents-events-file.js` și actualizează `docs/handoff/RF-K01b2b-coder-raport.md`. Nu rula comenzi/teste.

## Defecte

1. În ramura de reluare `discardingOversizedLine`, după găsirea LF, codul setează `index = newline + 1` și apoi face și `offset += index`. Cursorul ulterior folosește `offset + index`, deci prefixul abandonat este numărat de două ori și poate sări peste evenimentul valid următor. Păstrează o singură bază absolută nemutată pentru buffer și calculează toate cursor-ele ca `baseOffset + index`; nu dubla avansul.

2. Când o linie depășește `maxEventBytes` fără LF, dar segmentul citit ajunge exact la `snapshotSize`, cursorul trebuie să intre în `discardingOversizedLine:true`, însă `hasMore` și `limits.bytes` trebuie să fie `false`: nu mai există bytes procesabili până când sursa crește. Ele devin `true` numai dacă snapshot-ul mai conține bytes necitiți din cauza ferestrei `maxReadBytes`.

## Păstrează

Toate corecțiile r2, shape-ul API, limitele, warning-urile și verificările de securitate. Raportul trebuie să spună explicit că validarea nu a fost rulată.
