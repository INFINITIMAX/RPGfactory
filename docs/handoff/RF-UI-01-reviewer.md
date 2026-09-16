# RF-UI-01 — brief reviewer

## Rol

Review strict, read-only, după coder și tester. Nu modifica nimic și nu rula comenzi.

## Citește

- `docs/handoff/RF-UI-01-surface.md`
- `docs/handoff/RF-UI-01-coder-raport.md`
- `docs/handoff/RF-UI-01-tester-raport.md`
- `GATES.md`, RF-UI-01
- `INspiratie/1.png`
- diff-ul și fișierele UI/testele relevante

## Verificări

1. Coder-ul a implementat doar ce cere brief-ul sau a introdus cod inutil/funcții fictive?
2. Lumea este structural dominantă, HUD-ul compact și inspectorul nu mai rezervă spațiu gol?
3. Datele lipsă rămân necunoscute; nu există taskuri/usage/blocked/cost simulate?
4. Selecția hartă ↔ HUD este coerentă, camera este robustă, stările loading/empty/stale există?
5. Tastatura, alternativa DOM Canvas, focusul, reduced-motion și mobilul sunt tratate real?
6. API/backend/game/asset-uri au rămas neatinse?
7. Siguranță: fără `innerHTML` cu date, injection, listeners/poll loops multiplicate, race nou sau crash când elementele opționale lipsesc?
8. Tester-ul verifică comportamente reale? Există teste redundante, fragile sau care trec indiferent de cod?
9. Semnalează orice incompatibilitate probabilă cu fake DOM-ul și testele existente.

## Verdict

Întoarce în răspuns, integral:

- `VERDICT: ACCEPT` sau `VERDICT: REJECT`;
- constatări ordonate după severitate, cu `fișier:linie`;
- evaluare separată coder/tester;
- riscuri reziduale și ce trebuie verificat în browser.

Reviewer-ul nu scrie raport; planner-ul va transcrie exact răspunsul în `docs/handoff/RF-UI-01-reviewer-raport.md` și va adăuga decizia sa.
