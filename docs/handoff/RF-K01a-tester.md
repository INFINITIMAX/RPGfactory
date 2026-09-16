# RF-K01a — brief Tester

Data: 16-09-2026

## Context

Coder-ul a implementat funcția pură CommonJS `normalizePiSubagentsStatus(raw, options)` în `adapters/pi-subagents-contract.js`. Planner-ul a inspectat codul, a rulat o probă directă pe schema reală și suita existentă: proba trece, iar suita este 584/584.

Citește înainte: `GATES.md` secțiunea RF-K01a, `docs/handoff/RF-K01a-coder.md`, `docs/handoff/RF-K01a-b-coder.md`, `docs/handoff/RF-K01a-c-coder.md`, implementarea curentă și rapoartele Coder-ului.

## Sarcina

Scrie teste independente și fixture-uri integral sintetice pentru contract. Poți modifica numai:

- `test/adapters/pi-subagents-contract.test.mjs`
- `test/fixtures/pi-subagents/**`
- `docs/handoff/RF-K01a-tester-raport.md`

Nu modifica implementarea.

## Acoperire obligatorie

1. Forma de succes: `schemaVersion:1`, `source:'pi-subagents'`, `observedAt`, root separat și copii flatați determinist.
2. Schema reală Pi:
   - root/nested: `state`, `totalTokens`;
   - step: `status`, `tokens`;
   - atenție: `activityState`;
   - recursie: `children`.
   Include aliasuri-capcană (`usage`, `nested`, booleenele `needs_attention`/`active_long_running`) și dovedește că sunt ignorate.
3. Lifecycle: pending/queued/running/complete/completed/failed/stopped/paused; `partial` și `rejected` rămân unknown cu avertisment, nu succes.
4. `needs_attention` rămâne atenție; `active_long_running` nu devine atenție și produce avertisment; activitatea absentă rămâne null.
5. Usage per scope, fără însumare: câmpurile allowlisted `input/output/total/window/windowPeak`; numere finite nenegative; valorile invalide sunt omise cu `INVALID_USAGE`; obiect fără valori valide și scalarul devin null.
6. Ierarhie root → step → nested: ID explicit, fallback determinist, `parentRunId` valid și fallback structural, duplicate ID, ordine stabilă.
7. Limite: `maxDepth`, `maxNodes`, opțiuni invalide și indicatoarele `truncated.depth/count`.
8. Input invalid: null/array/missing fields/startedAt invalid/steps non-array întorc exact eroarea stabilă fără throw și fără date brute.
9. Allowlist ostil la root, step și nested: prompt/task/description/args/output/recentOutput/error brut, căi session/transcript/artifact, chei necunoscute nu apar nicăieri în rezultatul serializat. Verifică și bounded strings plus `currentTool` care seamănă a path/control chars.
10. Fixture-uri sanitizate distincte pentru single, workflow+nested, terminal, hostile și limits. Nu copia conversații, căi sau artefacte reale.

## Constrângeri

- Nu accesa sesiuni Pi reale, home directory, filesystem lifecycle, SQLite, rețea, server sau UI.
- Fixture-urile sunt date sintetice statice din repo.
- Nu rula comenzi sau teste. Planner-ul le va rula.
- Nu afirma că testele trec.

## Raport

În `docs/handoff/RF-K01a-tester-raport.md`, enumeră testele și fixture-urile scrise, explică ce defecte ar detecta, confirmă lipsa I/O real și declară explicit că nu ai rulat teste.
