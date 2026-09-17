# RF-K01b1 — brief Tester

Data: 16-09-2026

## Sarcina

Scrie teste independente pentru `adapters/pi-subagents-files.js`, conform `spec.md` RF-K01b și gates RF-K01b1. Nu te baza pe raportul Coder-ului ca dovadă. Citește implementarea și contractul RF-K01a numai pentru a construi inputuri valide.

## Fișiere permise

- creează `test/adapters/pi-subagents-files.test.mjs`;
- opțional creează numai fixture-uri sintetice sub `test/fixtures/pi-subagents-files/` dacă sunt cu adevărat utile;
- scrie `docs/handoff/RF-K01b1-tester-raport.md`.

Nu modifica implementarea sau alte fișiere.

## Acoperire obligatorie

Folosește `node:test`, `assert/strict` și directoare create cu `fs.mkdtempSync(path.join(os.tmpdir(), ...))`, șterse în cleanup. Nu folosi home-ul utilizatorului, rădăcini Pi reale, DB, rețea, server ori procese copil.

Testează cel puțin:

1. lipsa options, roots non-array, root relativ, valori invalide pentru fiecare limită și `observedAt` → exact `INVALID_OPTIONS`, fără throw;
2. roots gol → succes, envelope versionat, arrays/flags goale;
3. run dir direct cu status valid;
4. container cu copii imediați sortați determinist;
5. lipsa recursiei la nepoți;
6. root indisponibil, root fișier și root link/junction → warning stabil, fără cale;
7. root canonical duplicat → prima apariție și `DUPLICATE_ROOT`;
8. candidat non-directory/link/invalid consumă bugetul `maxRuns` înainte de validare;
9. `maxRoots` și `maxRuns` setează corect truncarea; nu marca runs trunchiat dacă numărul este exact egal și nu există alt candidat;
10. `status.json` lipsă, directory, symlink, prea mare, JSON invalid și status semantic invalid;
11. duplicate `runId` păstrează prima proiecție validă și consumă buget;
12. `observedAt` ajunge în proiecția RF-K01a și `activityState` rămâne mapat corect;
13. câmpuri ostile/private (`cwd`, task, prompt, description, args, output, error, transcript/session/artifact paths, chei necunoscute) nu apar nicăieri în rezultatul serializat;
14. warning-urile nu conțin căi, nume de fișier controlate de atacator sau mesaje brute;
15. test de regresie cu multe intrări invalide/duplicate dovedește că outputul/warnings sunt limitate de buget.

Pentru symlink/junction, dacă platforma răspunde cu `EPERM`/`EACCES`, marchează acel caz skip explicit; nu transforma indisponibilitatea într-un test verde implicit.

## Constrângeri

- Testele nu au voie să citească directoare reale Pi sau orice cale din profilul utilizatorului, cu excepția directorului temporar creat de test.
- Nu testa `events.jsonl`, DB, server/API/UI, missions sau reporter.
- Nu adăuga dependențe.
- Nu rula comenzi sau teste; planner-ul le rulează și îți va transmite rezultatul dacă este nevoie de corecții.

## Raport

În `docs/handoff/RF-K01b1-tester-raport.md` notează fișierele create, cazurile acoperite, limitele testelor și confirmarea explicită că nu ai rulat nimic și nu ai accesat artefacte Pi reale.
