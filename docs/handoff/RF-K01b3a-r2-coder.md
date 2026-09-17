# RF-K01b3a r2 — corecții Coder înainte de Tester

Data: 16-09-2026
Rol: același Coder reluat (scrie cod; NU rulează comenzi/teste)

Citește brief-ul inițial, raportul tău și aceste constatări ale Planner-ului. Modifică numai `migrations/005-pi-ingestion.sql`, `pi-ingestion.js` și scrie `docs/handoff/RF-K01b3a-r2-coder-raport.md`.

## Defecte obligatoriu de reparat

1. **Cursor incompatibil cu b2b:** cursorul real este exact `{ version:1, fileKey, offset, discardingOversizedLine? }`. Implementarea actuală respinge `version` și returnează cursor fără versiune. Acceptă exact versiunea 1; respinge versiuni/chei necunoscute; markerul opțional poate fi numai `true` (nu `false`); `getCursor` și rezultatul commit întorc forma v1 path-free.
2. **Regresia cursorului este ignorată, nu respinsă:** pentru același `fileKey`, `offset` mai mic trebuie să producă eroare stabilă și rollback total, nu să comită snapshot/events păstrând cursorul vechi. Verifică regresia în tranzacție înainte de orice scriere. Un fileKey nou permite resetul.
3. **Câmpuri obligatorii de eveniment tratate ca opționale:** setul global `OPTIONAL_EVENT_FIELDS` face ca `agent`/`stepIndex` să poată lipsi din step events și `agent` din control. Definește required/optional separat per `kind`, exact conform outputului din `adapters/pi-subagents-events-contract.js`. Exemple: step events cer mereu `stepIndex`+`agent`; control cere `agent`+`attention`; child-status cere `childId`+`childStatus`; numai câmpurile adăugate condițional de b2a sunt opționale.
4. **Post-COMMIT:** nu apela o operație DB care poate eșua în blocul care apoi încearcă rollback după COMMIT. Construiește rezultatul cursorului sanitizat din input sau separă clar faza post-commit; un rezultat raportat ca eșec nu trebuie să ascundă o tranzacție deja comisă.
5. **Schema:** întărește CHECK-urile pentru hash/file_key lowercase hex și `event_type` la cele 15 kind-uri allowlisted. Migrația nu a fost aplicată pe date reale, dar nu modifica nicio migrație mai veche.
6. **Opțiuni:** `createPiIngestionStore(null)` sau options ne-obiect trebuie să eșueze stabil fără TypeError brut; păstrează deschiderea lazy.

## Păstrează

- tranzacția unică și erorile fără payload/SQL/căi;
- hashing/canonicalizare și limitele;
- lipsa I/O Pi/server/API/UI;
- scope-ul inițial.

## Raport

Descrie fiecare reparație și confirmă explicit că nu ai rulat comenzi/teste.
