# RF-K01b3a r4 — restaurare după suprascriere accidentală

Data: 17-09-2026
Rol: același Tester reluat (scrie teste; NU rulează comenzi/teste)

## Defect critic

Livrarea r3 a suprascris accidental întregul `test/pi-ingestion.test.mjs`. Fișierul curent are numai cele 3 teste r3, fără importuri/helpers și fără cele 10 teste r2. De aceea rularea Planner-ului eșuează imediat cu `ReferenceError: test is not defined`.

Raportul r3 afirmă incorect că testele anterioare au fost păstrate. Corectează prin livrare, nu prin explicație.

## Sarcina

Modifică numai:

- `test/pi-ingestion.test.mjs`
- `docs/handoff/RF-K01b3a-r4-tester-raport.md`

Reconstituie un singur fișier complet și autonom care conține:

1. toate importurile și helpers r2;
2. toate cele 10 teste r2 (lazy/migrație; 15 kinds; required fields de bază; workflowKey + INVALID_STEP_NODE; replay nested; cursor; reopen/rollback; SQL CHECK cu FK valid; ostile r2);
3. cele 3 completări r3: required fields complet pentru 7 forme și toate common fields; replay complet revision/duplicate/rows/event reorder/usage/nested; matrice completă limits/private/options.

Poți combina teste redundante, dar nicio cerință/asertare din brief-urile inițial, r2 și r3 nu poate dispărea. Fișierul trebuie să înceapă cu importurile înaintea oricărui `test(...)`; toate funcțiile/constantele trebuie definite.

## Auto-verificare statică fără comenzi

Recitește fișierul final integral și verifică manual:

- import `test`, `assert`, `crypto`, `fs`, `os`, `path`, `createRequire`;
- helpers `tmp/clean/fileFor/cursor/storeFor/root/snapshot/normalize/rawEvents/observation/hasCode` înainte de folosire;
- minimum 10 teste distincte; ideal păstrează 13;
- niciun helper nedefinit;
- niciun test vechi eliminat;
- raportul r4 descrie adevărul final, nu intenția.

## Interdicții

Nu rula comenzi/teste/procese. Nu modifica implementarea, migrația sau alte fișiere. Zero Pi real/home/config/rețea/server.

## Raport

Recunoaște suprascrierea r3, enumeră ce ai restaurat, numărul final de teste și confirmă că nu ai rulat comenzi/teste.
