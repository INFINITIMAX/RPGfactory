VERDICT: REJECT

## Review

### Corect

- Compoziția urmărește direcția cerută: hartă dominantă și rail compact, cu inspectorul înlocuind conținutul rail-ului (`public/index.html:24-104`, `public/hud.css:56-76`, `public/hud.js:199-220`).
- Sunt afișate numai date existente: profile, sesiuni, lifecycle, proiect și asociere. Nu am găsit taskuri, usage, cost sau blocked fabricate (`public/hud.js:118-160`).
- Harta are stări distincte loading/ready/empty/error și păstrează ultimul instantaneu la eroare (`public/world.js:342-361`).
- Textul extern este introdus prin `textContent`, noduri text sau Canvas. Nu am găsit `innerHTML` în fișierele UI inspectate.
- Polling-ul este secvențial, iar request token-ul protejează răspunsurile întârziate (`public/hud.js:386-403`, `public/world.js:342-361`).
- Layout-ul mobil, focus styling și reduced-motion sunt prezente (`public/hud.css:127-160`).
- Testele VM pentru XSS, polling, actualizarea inspectorului, empty/stale și zoom verifică în general comportament real, nu doar existența unor șiruri.

### Constatări

- **Finding: P1 — schimbarea selecției de la profil la run lasă pawn-ul anterior evidențiat.**
  `public/hud.js:53-59` schimbă selecția și inspectorul la run, dar nu emite `rpg:profile-selected` cu `null` sau cu profilul asociat run-ului. După selectarea unui profil, lumea îl marchează; selectarea ulterioară a unei sesiuni păstrează marcajul vechi, deși HUD-ul și inspectorul indică altă entitate. Aceasta contrazice selecția coerentă hartă ↔ HUD ↔ inspector. Testele noi acoperă numai selecția profilului în ambele direcții (`test/hud.test.mjs:404-424`), nu tranziția profil → run.
  **Remediere minimă:** la `selectRun`, emite fie deselectarea hărții, fie profilul asociat run-ului conform comportamentului ales, și adaugă regresia corespunzătoare.

- **Finding: P1 — alternativa DOM introduce controale focusabile complet invizibile.**
  `public/world.js:261-274` creează butoane pentru pawn-i, dar containerul lor folosește permanent `.sr-only` (`public/index.html:48`, `public/hud.css:128`). Butoanele intră în ordinea Tab, însă containerul de 1×1 px cu clipping ascunde inclusiv outline-ul de focus. Cerința de operare cu tastatura și focus vizibil nu este astfel îndeplinită pentru alternativa Canvas.
  **Remediere minimă:** afișează controlul focalizat printr-un stil `:focus-within`/overlay accesibil sau folosește o alternativă vizibilă coerentă, apoi verifică ordinea Tab în browser.

- **Finding: P1 — starea explicit cerută „acțiune în curs” nu este implementată.**
  Contractul include inspectorul în stare de acțiune în curs (`docs/handoff/RF-UI-01-surface.md:33`). Acțiunile din `public/hud.js:289-377` nu dezactivează controlul, nu setează `aria-busy` și nu afișează progres. Dublu-click-ul poate trimite mutații concurente cu aceeași revizie și produce un conflict evitabil. Testele acoperă doar succesul și eroarea, nu o cerere rămasă în așteptare.
  **Remediere minimă:** marchează controlul/inspectorul busy, dezactivează repetarea până în `finally` și testează cu un fetch amânat.

- **Finding: P1 — calea principală de click/tap pe pawn nu este testată.**
  Hit-testing-ul Canvas este implementat în `public/world.js:300-330`, dar `test/ui-contract.test.mjs` activează doar butonul din lista DOM alternativă. Nu există test pointer pozitiv/negativ, pan-versus-click sau dovadă browser pentru click pe pawn, deși UI-G3 cere explicit această cale. Bugurile de coordonate, scalare sau target radius pot trece fără ca testele actuale să eșueze.
  **Remediere minimă:** adaugă test comportamental pentru pointerdown/pointerup pe un target și în afara lui, plus verificare reală la rezoluțiile obligatorii.

- **Finding: P2 — primul rezultat de polling șterge indicatorul vizual de conexiune.**
  HTML-ul definește punctul stilizat în `public/index.html:18-20`, dar `setConnectionState` rescrie `textContent` pe container (`public/hud.js:380-383`), eliminând ambii copii, inclusiv `.connection-dot`. Testul verifică doar textul și clasele, deci nu observă regresia.
  **Remediere minimă:** păstrează referința la span-ul de text și actualizează numai acel nod.

### Evaluare coder

Implementarea este bine delimitată și evită datele fictive, `innerHTML` și buclele evidente de polling. Structura vizuală corespunde direcției. Totuși, selecția globală, focusul alternativei Canvas și starea acțiunilor au defecte materiale, deci livrarea nu poate fi acceptată încă.

### Evaluare tester

Testele VM sunt utile pentru XSS, polling, evenimente și stările hărții. Totuși, nu acoperă tranziția profil → run, starea pending, focusul vizibil real sau click-ul geometric pe Canvas. Contractele CSS statice nu pot demonstra lipsa overflow-ului sau utilizabilitatea la rezoluțiile țintă.

### Riscuri reziduale și verificări obligatorii în browser

- 1440×1000: măsurarea proporției hartă/rail și verificarea lipsei overflow-ului.
- 390×844: `scrollWidth <= innerWidth`, controale netăiate și HUD accesibil sub hartă.
- Click/tap pe fiecare pawn, pan fără selecție accidentală și selecție după zoom/reset.
- Ordinea Tab și vizibilitatea focusului, inclusiv butoanele din alternativa DOM.
- Reduced-motion cu pawn `working`.
- Stările loading/empty/stale și erorile acțiunilor în browser.
- Suita completă și absența diff-urilor backend/game nu sunt atestate: review-ul a fost strict read-only și fără comenzi.
- `DESIGN.md` lipsește încă, deși contractul de finisare îl cere; acesta pare pas de integrare al planner-ului, nu abatere a coder-ului, care avea explicit interdicție de a modifica documentul.

**Merge verdict: BLOCK**

---

## Decizia planner-ului

Respingerile sunt corecte și materiale. Direcția vizuală se păstrează, dar RF-UI-01 nu se închide. Se deschide corecția RF-UI-01b pentru cele cinci constatări, urmată de teste, re-review și verificare reală desktop/mobil. Nu se face commit sau push.
