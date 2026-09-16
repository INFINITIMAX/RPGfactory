# RF-K01a-b — corecție coder

Data: 16-09-2026

## Motiv

Planner-ul a inspectat direct `adapters/pi-subagents-contract.js` și schema reală `pi-subagents@0.60.0` din `src/shared/types.ts`. Implementarea compilează și suita existentă trece 584/584, dar trei câmpuri nu corespund contractului real. Nu schimbăm designul; corectăm exclusiv maparea.

## Sarcina

Modifică numai `adapters/pi-subagents-contract.js` și scrie raportul `docs/handoff/RF-K01a-b-coder-raport.md`.

1. **Atenție/activitate control:** sursa reală este `activityState`, cu valori `needs_attention` sau `active_long_running`.
   - `activityState === 'needs_attention'` → `attention: 'needs_attention'`;
   - `activityState === 'active_long_running'` → attention null și warning `ACTIVE_LONG_RUNNING_UNVERIFIED`;
   - valoare prezentă dar necunoscută/non-string → warning stabil, fără valoare brută;
   - nu mai citi `needs_attention` sau `active_long_running` ca proprietăți booleene inexistente.

2. **Usage:**
   - root `AsyncStatus` și `NestedRunSummary` folosesc `totalTokens`;
   - step folosește `tokens`;
   - nu citi aliasul generic `usage`;
   - păstrează fiecare scope separat, fără agregare.

3. **Copii nested:** schema reală folosește `children`, atât pe step, cât și pe `NestedRunSummary`.
   - înlocuiește citirea proprietății inexistente `nested` cu `children`;
   - recursia rămâne bounded și păstrează relația `parentRunId` validă sau fallback-ul structural documentat.

## Păstrează neschimbat

API-ul public, forma rezultatului, lifecycle mapping, allowlist-ul, limitele, duplicate handling și excluderea datelor private.

## Interzis

- nu modifica teste, fixture-uri, alte module sau primul raport;
- nu rula comenzi/teste; planner-ul le rulează;
- nu citi artefacte reale și nu activa extensii/configurații globale.

## Raport

Scrie ce ai corectat, confirmă cele trei surse reale folosite și confirmă că nu ai rulat comenzi/teste.
