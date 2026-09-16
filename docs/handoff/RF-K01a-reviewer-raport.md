# RF-K01a — raport Reviewer

Data: 16-09-2026

VERDICT: REJECT

## Review
- Correct: `adapters/pi-subagents-contract.js` folosește corect schema reală: `activityState`, `state`/`totalTokens` pentru root+nested, `status`/`tokens` pentru step și recursia `children`. Allowlist-ul este explicit, fără I/O sau copiere generică a inputului. Testele și fixture-urile sunt sintetice și verifică mapările corectate.
- BLOCKER: K01A-3 nu este susținut complet. În `addNested()` și bucla de `steps` din `adapters/pi-subagents-contract.js`, `maxNodes` este verificat numai după numărul de copii acceptați (`children.length`), înainte ca un element să fie validat. Un array extern foarte mare de elemente invalide sau duplicate nu crește `children`, deci este parcurs integral și adaugă avertismente nelimitate. Limita configurată nu mai limitează procesarea/outputul pentru input ostil. Testul `limite: taie determinist...` din `test/adapters/pi-subagents-contract.test.mjs` acoperă numai noduri valide.
  Fix minim: numără elementele întâlnite spre limita de noduri înainte de validare/deduplicare și oprește parcurgerea cu `truncated.count: true`; adaugă regresii cu liste mari de noduri invalide și duplicate.
- MINOR: Raportul inițial al coder-ului, `docs/handoff/RF-K01a-coder-raport.md`, descrie vechile surse `needs_attention`, `active_long_running`, `nested` și usage scalar. Codul final este corectat de rapoartele b/c, dar raportul inițial rămâne istoric și nu trebuie folosit ca descriere a implementării finale.

### Răspunsuri obligatorii
1. **Parțial.** Mapările de schemă reală cerute sunt corecte în cod și sunt testate semnificativ. Limita `maxNodes` nu este aplicată tuturor nodurilor de intrare.
2. **Parțial.** ID-urile, fallback-urile, deduplicarea și relațiile structurale sunt deterministe; însă limita de număr este ocolibilă de elemente invalide/duplicate.
3. **Nu am găsit o cale în nodurile proiectate prin care câmpurile private enumerate să ajungă în output/warnings.** Warnings sunt coduri stabile. Problema găsită este de volum nelimitat al warning-urilor, nu de divulgare a valorilor.
4. **Parțial.** Testele verifică independent mapările defecte anterioare (`usage`, `nested`, booleene legacy, `state` la step) și ar eșua pe acestea. Lipsește regresia pentru limita de noduri cu intrări invalide/duplicate.
5. **Nu am găsit cod inutil în afara RF-K01a sau teste în afara scope-ului.**
6. **K01A-1, K01A-2, K01A-4, K01A-5, K01A-6 și K01A-7 sunt susținute. K01A-3 nu este complet susținută. K01A-8 nu poate fi închis până la remediere și review ACCEPT.** Dovezile de rulare declarate de planner sunt compatibile cu această concluzie, dar nu acoperă cazul lipsă.

### Riscuri reziduale
- Nu s-au inspectat artefacte Pi live și acest lot nu pretinde integrare live; aceasta rămâne corect pentru RF-K01a.

- Merge verdict: BLOCK. RF-K01a nu poate fi închis fără modificarea limitei de număr și testul de regresie aferent.

## Decizia Planner-ului

Respingerea este acceptată integral. K01A-3 și K01A-8 rămân deschise. Ciclul se reia de la Coder cu un fix minim: bugetul `maxNodes` va număra fiecare element de nod întâlnit înainte de validare/deduplicare, incluzând root-ul, și va opri traversarea determinist cu `truncated.count: true`. După livrarea Coder-ului, Tester-ul va adăuga regresii separate pentru liste invalide și duplicate. Raportul inițial al Coder-ului rămâne istoric; rapoartele ulterioare sunt autoritatea asupra stării finale.
