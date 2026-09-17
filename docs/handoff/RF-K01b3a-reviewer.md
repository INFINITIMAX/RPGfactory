# RF-K01b3a — brief Reviewer read-only

Data: 16-09-2026
Rol: Reviewer (strict read-only; nu scrie și nu rulează comenzi)

Citește autoritățile proiectului, secțiunea RF-K01b3a din `GATES.md`, brief-urile/rapoartele Coder și Tester, implementarea, migrația, testele și probele Planner-ului din `docs/handoff/RF-K01b3a-planner-validation.txt`.

## Verifică explicit

- scope/ownership: fără cod inutil și fără atingerea adaptoarelor/serverului/UI;
- schema aditivă și compatibilitatea cu `db.js`/`runs`;
- deschidere lazy/close corect;
- validarea strictă allowlisted și limitele bounded;
- tranzacția atomică run+snapshot+events+cursor și rollback real;
- snapshot-ul rămâne autoritar, evenimentele nu schimbă lifecycle;
- canonicalizare/hashing determinist și replay idempotent fără usage dublat;
- cursor monotonic pentru același fileKey și reset permis numai la fileKey nou;
- recovery close/reopen;
- confidențialitate: fără task/prompt/message/output/error/path/cwd/session/URL/unknown în DB, rezultate sau erori;
- testele Tester-ului sunt independente, pot prinde defecte și nu trec indiferent de cod;
- probele Planner-ului sunt suficiente și serverul existent a rămas neatins.

## Output

Întoarce un raport complet în conversație, fără a scrie fișiere:

1. Verdict: `ACCEPT` sau `REJECT`.
2. Merge: `OK` sau `BLOCKED`.
3. Findings ordonate P0/P1/P2, cu fișier/linie și impact.
4. Matrice K01B3A-1…K01B3A-9: PASS/FAIL/NEDEMONSTRAT.
5. Evaluarea separată a codului și testelor.
6. Riscuri reziduale.
7. Comenzi: confirmă că nu ai rulat nimic.

Orice P0/P1 sau gate nedemonstrat blochează merge-ul. Nu accepta doar pentru că testele Planner-ului sunt verzi.
