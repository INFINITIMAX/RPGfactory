# RF-UI-01b — corecții tester după review

## Sarcina

După corecția coder-ului, scrie teste de regresie pentru constatările respinse. Lucrezi numai la:

- `test/hud.test.mjs`
- `test/ui-contract.test.mjs`
- `docs/handoff/RF-UI-01b-tester-raport.md`

Citește `docs/handoff/RF-UI-01-reviewer-raport.md` și `docs/handoff/RF-UI-01b-coder-raport.md`.

## Teste obligatorii

1. Selecție profil, apoi run asociat → evenimentul către hartă conține profilul asociat; run neasociat → `profileId: null`.
2. Stare pending cu fetch amânat: controlul este disabled, inspectorul/formularul este `aria-busy`, a doua activare nu trimite o cerere duplicată, iar starea se eliberează atât la succes, cât și la eroare.
3. `setConnectionState` nu elimină `.connection-dot` și actualizează nodul text dedicat.
4. Pointer/hit-testing real în sandboxul `world.js`: pointerdown+pointerup pe target emite exact selecția; în afara targetului nu emite; un drag/pan peste target nu selectează accidental.
5. Contractul CSS/DOM pentru alternativa Canvas verifică mecanismul de vizibilitate la focus, nu doar existența clasei `sr-only`.

Nu scrie teste pentru coordonate sau clase arbitrare care nu protejează comportamentul. Nu modifica producția și nu slăbi testele vechi.

## Constrângeri și raport

Nu rula comenzi/teste. Scrie `docs/handoff/RF-UI-01b-tester-raport.md` cu acoperirea, defectele găsite și confirmarea că planner-ul trebuie să ruleze suita.
