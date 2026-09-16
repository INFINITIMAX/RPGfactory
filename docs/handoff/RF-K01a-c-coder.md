# RF-K01a-c — a doua corecție coder

Data: 16-09-2026

## Dovada eșecului

Planner-ul a rulat o probă directă pe forma reală `AsyncStatus`. Sintaxa trece, dar proba eșuează: root `totalTokens: {input, output, total, window}` produce `usage: null`. Comanda s-a oprit la această aserțiune, înainte de suita completă.

Inspecția schemei reale arată încă o mapare greșită: root/nested folosesc `state`, dar step folosește `status`.

## Sarcina

Modifică numai `adapters/pi-subagents-contract.js` și scrie `docs/handoff/RF-K01a-c-coder-raport.md`.

1. `TokenUsage` este obiect, nu număr:
   - root/nested citesc `totalTokens`;
   - step citește `tokens`;
   - obiectul acceptă numai `input`, `output`, `total`, opțional `window`, `windowPeak`;
   - fiecare valoare acceptată trebuie să fie număr finit nenegativ;
   - câmpurile invalide se omit și produc `INVALID_USAGE`; dacă nu rămâne nicio valoare validă, `usage` este null;
   - fără aliasuri `inputTokens`, `outputTokens`, `contextWindow`, `peakContextTokens` și fără număr scalar;
   - fără agregare sau recalculare între câmpuri/scope-uri.

2. Starea step-ului:
   - root și nested: `state`;
   - step: `status`;
   - lifecycle mapping rămâne neschimbat.

3. Nu modifica mapările corecte din RF-K01a-b: `activityState`, `children`, `parentRunId`.

## Interzis

Nu modifica teste/fixture-uri/alte fișiere în afara raportului nou. Nu rula comenzi sau teste. Nu citi artefacte reale.

## Raport

Descrie cele două corecții și confirmă că nu ai rulat comenzi/teste.
