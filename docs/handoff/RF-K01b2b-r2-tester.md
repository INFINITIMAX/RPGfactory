# RF-K01b2b — corecție Tester r2 după review/r5

Data: 16-09-2026

## Sarcină

Modifică exclusiv:

- `test/adapters/pi-subagents-events-file.test.mjs`;
- `docs/handoff/RF-K01b2b-tester-raport.md`.

Nu modifica implementarea și nu rula comenzi/teste.

## Regresii obligatorii

1. Separă testul combinat de link-uri în trei teste independente: root-link, run-link și events-file-link. Fiecare are propriul `try/catch` și skip numai la `EPERM`/`EACCES`, astfel încât skip-ul file-link pe Windows nu ascunde pass-urile root/run.
2. Validarea ferestrei: `maxReadBytes === maxEventBytes` și `maxEventBytes + 1` sunt `INVALID_OPTIONS`; `maxEventBytes + 2` este acceptat.
3. Regresia exactă P1:
   - construiește un eveniment JSON valid cu byte length exact egală cu `maxEventBytes`;
   - scrie payload + CR, fără LF;
   - primul read cu fereastră `maxEventBytes + 2` produce zero evenimente, zero warning oversized, cursor neschimbat la început, `incompleteLine:true`, `hasMore:false`;
   - append LF;
   - următorul read emite evenimentul exact o dată, fără `EVENT_LINE_TOO_LARGE`, iar al treilea read nu îl repetă.
4. Linie clar oversized terminată în CR la EOF: după excluderea CR, payload-ul încă depășește limita; trebuie `EVENT_LINE_TOO_LARGE`, cursor avansat la EOF cu `discardingOversizedLine:true`, fără retry la offset zero.
5. Payload exact la limită urmat de CR și apoi un byte non-LF: CR nu este delimitator confirmat, linia devine oversized și intră în discard bounded.

## Păstrează

Toată matricea existentă, aserțiunile stricte, izolarea sintetică și restaurarea monkeypatch-urilor. Actualizează raportul cu review-ul respins și corecțiile; spune explicit că nu ai rulat validarea.
