# RF-K01a-c — regresii Tester după review

Data: 16-09-2026

## Context

Reviewer-ul a respins K01A-3 deoarece `maxNodes` număra numai nodurile acceptate. Coder-ul a introdus `encounteredNodes`, cu root=1 și consum înainte de validare/deduplicare. Planner-ul a rulat o probă ostilă directă și testele existente 8/8; ambele trec.

Citește `docs/handoff/RF-K01a-reviewer-raport.md`, `docs/handoff/RF-K01a-d-coder.md`, implementarea actuală și testul actual.

## Sarcina

Modifică numai:

- `test/adapters/pi-subagents-contract.test.mjs`
- opțional un fixture sintetic nou sub `test/fixtures/pi-subagents/`, numai dacă este realmente util;
- `docs/handoff/RF-K01a-c-tester-raport.md`.

Adaugă regresii independente care dovedesc:

1. O listă mare de elemente step invalide, cu `maxNodes` mic, procesează/warn-uiește numai elementele care încap după root, apoi setează `truncated.count: true`; numărul warning-urilor trebuie să fie bounded.
2. O listă de ID-uri duplicate consumă bugetul înainte de deduplicare: primul nod rămâne, duplicatul care încape produce exact warning-ul așteptat, iar următorul element nu este procesat/proiectat și `truncated.count` devine true.
3. Același principiu este exercitat și pentru `children` nested, nu doar pentru `steps`, fără a duplica inutil întregul test.
4. Aserțiunile trebuie să distingă implementarea veche de cea corectată și să verifice exact children/warnings/truncated relevante.

Nu modifica implementarea sau intenția testelor existente. Nu accesa date reale. Nu rula comenzi sau teste; planner-ul le va rula.
