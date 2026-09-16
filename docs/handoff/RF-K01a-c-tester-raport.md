# RF-K01a-c — raport regresii Tester

Data: 16-09-2026

## Fișiere schimbate

- `test/adapters/pi-subagents-contract.test.mjs`
- `docs/handoff/RF-K01a-c-tester-raport.md`

Nu am adăugat fixture: cele trei intrări ostile sunt mici, locale și permit aserțiuni exacte asupra bugetului fără a introduce un fixture redundant.

## Regresii adăugate

1. **Steps invalizi multipli.** Un array sintetic de 50 de steps `null`, cu `maxNodes: 3`, verifică root plus numai două elemente întâlnite: zero copii proiectați, exact două `INVALID_STEP_NODE` și `truncated.count: true`. Acest test ar eșua pe implementarea veche, care parcurgea toate elementele invalide și producea warnings nelimitate.
2. **Duplicate la nivel de step.** Cu `maxNodes: 3`, primul step este păstrat, duplicatul încă încape și produce exact `DUPLICATE_NATIVE_ID`, iar al treilea step nu este procesat/proiectat; `truncated.count` este true. Testul distinge consumarea bugetului înainte de deduplicare de numărarea veche a copiilor acceptați.
3. **Duplicate nested.** Cu `maxNodes: 4`, root-ul, step-ul părinte, primul nested și duplicatul nested consumă bugetul. Primul nested rămâne, duplicatul produce exact warning-ul așteptat, următorul copil nested nu este proiectat și `truncated.count` este true. Acoperă aceeași regulă în ramura recursivă `children`.

Aserțiunile verifică exact lista `children`, lista `warnings` și obiectul `truncated` relevante, nu doar existența generală a unui warning.

## Izolare și rulare

Regresiile folosesc exclusiv obiecte sintetice locale și modulul pur. Nu accesează date Pi reale, filesystem lifecycle, SQLite, rețea, server sau UI.

Nu am rulat comenzi, teste, procese sau servere. Planner-ul trebuie să valideze rularea.
