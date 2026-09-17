# RF-K01b3a r3 — corecții după Reviewer

Data: 17-09-2026
Rol: același Coder reluat (scrie cod; NU rulează comenzi/teste)

Citește raportul integral `docs/handoff/RF-K01b3a-reviewer-raport.md`. Modifică numai `pi-ingestion.js` și scrie `docs/handoff/RF-K01b3a-r3-coder-raport.md`. Nu modifica testele sau migrația.

## Corecții obligatorii

1. Adaugă `INVALID_STEP_NODE` în allowlist-ul warning-urilor RF-K01a. Verifică static lista completă din `adapters/pi-subagents-contract.js`; nu adăuga coduri inexistente.
2. Aplică limita contractuală de 128 caractere pentru `workflowKey`; `childId` și `childRunId` rămân max. 256, `agent` max. 128.

Nu extinde scope-ul. Păstrează toate corecțiile r2, atomicitatea, canonicalizarea, erorile sanitizate și API-ul.

## Raport

Scrie modificările, riscurile și confirmarea că nu ai rulat comenzi/teste.
