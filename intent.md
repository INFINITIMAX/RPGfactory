# Intent — RPG Factory

> **Precedență:** `instructiuni.md` are prioritate peste tot ce s-a muncit până acum în proiect. Dacă acest fișier îl contrazice, `instructiuni.md` câștigă. Vezi `AGENTS.md` § „Precedența documentelor”.


Actualizat: 14-09-2026.
Status: intenție de produs confirmată în interviu. **Primul lot de cod (RF-01 — izolare și siguranță) este autorizat** (gate G4a). Arhitectura tehnică nouă (SQLite, model canonic — RF-02 și dependenții) rămâne în aprobare (gate G4b). Implementarea nouă nu este încă începută.

## Problema

Lucian are nevoie să vadă clar agenții reali din **Pi și Claude Code**: cine lucrează, ce task are, cine coordonează pe cine, unde se așteaptă o decizie, unde există blocaj și ce resurse consumă. Un decor animat care nu reflectă date corecte nu satisface scopul.

## Rezultat propus

Consolă locală de observabilitate și administrare a profilurilor, cu o lume medievală 2D. **Un repo = un regat**, extensibil prin celule hexagonale adiacente. Hartă dominantă, panou operațional în dreapta, zoom progresiv și focalizare pe proiect.

Baza funcțională este tabloul **Bot Crossing**, nu un subset presupus echivalent. Folosim referința activă și putem reutiliza codul cu respectarea MIT. Tema se adaptează incremental; dacă o componentă nu poate fi adaptată încă, îi păstrăm comportamentul/interfața originală funcțională. Nu importăm rendererul 3D doar pentru a păstra aspectul.

Scopul de prezentare publică rămâne secundar. Estetica fină și alegerea clădirilor nu mai blochează producția.

## Cerințe confirmate

Sursa completă: [docs/DECISIONS.md](docs/DECISIONS.md), I01–I43.

### Observabilitate

- Pi și Claude Code simultan; Herdr nu este harness.
- Stare, activitate declarată, task, ierarhie și prospețime distincte, cu proveniență.
- Blocaj confirmat, posibil blocaj, așteptare de răspuns și telemetrie lipsă nu se confundă.
- Progres = etapă și criterii verificate; nu transcript size sau tokenuri.
- Panou permanent cu tabele **nivel ierarhic × stare**, global și per regat.
- Arbore și legături la selectare; inspector cu coordonator, copii și muncă.
- Listă de intervenții, notificări discrete fără sunet/focus automat; „văzut” nu rezolvă problema.

### Specialiști și istoric

- Profil permanent de la prima versiune, independent de sesiune/PID.
- Un specialist are o singură execuție activă global; planner-ul respectă regula, vizualizatorul nu omoară procese.
- Planner-ul propune profiluri noi, Lucian aprobă. Asociere explicită prin ID, cu corecție manuală pentru sesiuni neasociate; fără identificare ghicită.
- Configurații versionate; fiecare task păstrează model/harness/configurație.
- Administrare nume/specializare și retragere din repartizări viitoare; fără task assignment sau pause/resume/cancel din UI în prima versiune.
- Taskul trece între specialiști; coderul nu devine automat reviewer. Activități auxiliare mici permise, muncă distinctă delegată.
- Dosare structurate independente de transcript: obiectiv, criterii, predări, verificări, review, rezultat și referințe la livrări.
- Istoric pe taskuri cu cronologie, filtre și ultim proiect în profil.
- Niveluri per competență bazate ulterior pe evaluare + experiență validată; nu nivel inventat din model sau cantitatea de knowledge.

### Lume și resurse

- Inițial toți Pawn; identitate vizuală specializată și leveling complet ulterior.
- Ierarhie structurală: coordonator principal, copii direcți, descendenți; paletă preferată albastru/galben/violet.
- Specialiștii au posturi stabile și rămân acolo în repaus; se mută când sunt repartizați la alt proiect.
- Activități inițiale: planificare/coordonare, implementare, testare, review, research.
- Research → arhivă/mănăstire; coordonare → castel. Mina/pădurea sunt fallback numai pentru lucru confirmat cu activitate nespecificată.
- Dimensiune maximă 2×, după ritmul recent de tokenuri proprii, cu praguri comune întregii flote.
- Tokenuri input/output/cache, cost real/estimat și CPU/RAM atribuit justificat; indisponibil nu înseamnă zero.
- Consum propriu distinct de ramura coordonată; totaluri fără dublare.
- Dosare/evaluări/agregate permanente; eșantioane detaliate 30 zile.
- Țintă de validare inițială: 20 specialiști și 5 proiecte; nu plafon artificial.

## Ce nu construim acum

- Un orchestrator care înlocuiește planner-ul Pi/Claude Code.
- O economie RPG care decide execuțiile sau transformă consumul în competență.
- Leveling complet, antrenare ori memorie avansată în primul lot.
- Suport nou pentru alte harness-uri decât Pi/Claude Code fără decizie separată; existența unor adaptoare upstream se consemnează în inventar.
- Arhivarea automată a transcripturilor brute, secrete, fișiere `.env` sau date private în Git.
- Un nou redesign estetic înainte de date corecte și funcționalitate.

## Stare reală

La baza `6fecdad`, aplicația este un prototip Claude-only. Auditul [13-09-2026](docs/AUDIT-13-09-2026.md) a verificat 205 teste în copie izolată, cu opener Windows substituit, și a identificat defecte semnificative neacoperite de suită. Această dovadă NU certifică noul produs și nu se transferă după modificări.

Implementările T-01–T-19 și rapoartele lor rămân istorie, nu o certificare de paritate. Intentul anterior a fost păstrat integral în [docs/history/pre-interview-14-09-2026/intent.md](docs/history/pre-interview-14-09-2026/intent.md).

## Pași și aprobare

1. Consolidare și verificare a specificației/planului, cu propunerile tehnice etichetate.
2. **RF-01 (izolare + siguranță) este autorizat** și nu mai așteaptă o aprobare generală — gate G4a, `instructiuni.md` §1/§13. Păstrează stocarea JSON.
3. **Arhitectura nouă (SQLite, model canonic) cere aprobare separată înainte de RF-02** — gate G4b. Nu blochează RF-01.
4. Build incremental în fluxul planner → coder → tester → reviewer, cu dovezi rulate de planner.
5. Gate separat pentru activarea integrărilor globale, migrare, push și deploy.
