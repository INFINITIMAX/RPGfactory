# RF-04 — raport tester

## Fișier creat

`test/hud.test.mjs` — încarcă `public/hud.js` REAL cu `node:vm`, în același tipar folosit deja de `test/app.test.mjs` (sandbox minim cu `document`/`fetch`/`setTimeout` simulate, funcțiile declarate cu `function`/`async function` la nivel de script devin proprietăți ale obiectului global din sandbox și pot fi apelate direct din teste).

DOM fals propriu (`FakeElement`), scris de la zero pentru `hud.js` (nu am putut reutiliza mock-ul din `app.test.mjs`, care e specific canvas/`innerHTML` — `hud.js` manipulează un arbore DOM real cu `appendChild`/`insertBefore`/`removeChild`/`classList`): arbore minimal cu `parentNode`/`childNodes`/`appendChild`/`insertBefore`/`removeChild`/`remove`/`classList`/`textContent`/`addEventListener`+`dispatch`. **`innerHTML` (get și set) aruncă explicit** — orice regresie care ar reintroduce `innerHTML` cu date interpolate (exact bug-ul din `docs/AUDIT-13-09-2026.md`) ar face să pice IMEDIAT orice test care randează ceva, nu doar testele XSS dedicate.

## Ce am testat (pe secțiuni din brief)

**2.1 `reconcileTable`** — 6 teste: listă goală șterge tot; adăugare păstrează ordinea; date schimbate actualizează celulele fără să recreeze `<tr>` (verificat prin identitate de obiect, `assert.strictEqual`); reordonare reflectată în DOM; element dispărut șters din `tbody` ȘI din `rowMap`; element cu același `id` reapărut mai târziu e un `<tr>` NOU (`assert.notStrictEqual` pe referințe), nu o resurecție.

**2.2 `setRowCells`** — 4 teste: update la număr neschimbat de valori; adăugare de celule; eliminare de celule; optimizarea „nu rescrie dacă valoarea e identică” — verificată prin `Object.defineProperty` pe `textContent` al fiecărei celule, numărând scrierile efective, apoi apelând `setRowCells` din nou cu aceleași valori și verificând `writes === 0`.

**2.3 `renderInspector`/`lastRenderedInspector` (RF-04-b, cel mai important)** — 3 teste directe cu un „marker" DOM inserat manual în inspector, plus 2 teste de flux real prin `pollOnce()`:
- selecție+date neschimbate → `renderInspector()` NU reconstruiește (marker-ul supraviețuiește);
- schimbare de `id` cu **aceeași revizie** → reconstruiește (exact capcana raportată de planner în RF-04-b — dacă cineva ar compara doar `revision` fără `id`, acest test ar cădea);
- aceeași selecție, `revision` schimbată → reconstruiește;
- flux complet prin poll: elementul selectat dispare din snapshot → inspector golit explicit (`classList.contains('hidden')`, `childNodes.length === 0`), apoi revine cu **aceeași revizie** ca înainte → reselectarea reconstruiește (nu rămâne „blocată" crezând că nimic nu s-a schimbat — asta verifică explicit resetarea `lastRenderedInspector = null`);
- selecția supraviețuiește unui poll fără schimbări reale (rândul rămâne `.selected`, inspectorul rămâne vizibil).

**2.4 `pollOnce` — single-flight și token** — 5 teste:
- verificare structurală: după pornire, e programat **exact un** timer prin `setTimeout`, la 3000ms (`POLL_INTERVAL_MS`) — dacă cineva ar schimba înapoi la `setInterval`, acest test ar eșua imediat cu `ReferenceError: setInterval is not defined` (sandbox-ul nu are `setInterval`), deci regresia e prinsă, deși indirect;
- token de cerere: două `pollOnce()` pornite înainte ca primul să se termine, cu fetch-uri controlate manual (`flags.deferGets`), rezolvate în ordine INVERSĂ (ciclul mai nou răspunde primul) — verific că starea finală reflectă ciclul mai nou, nu răspunsul vechi sosit ulterior;
- analog pentru eșec: un eșec de rețea vechi, sosit după ce un ciclu mai nou a reușit deja, NU suprascrie indicatorul „conectat";
- eșec de rețea (fetch aruncă) → `connection-retrying`, revenire → `connection-connected`;
- răspuns non-OK (500) tratat identic cu excepția de rețea.

**2.5 Acțiunile** — pentru fiecare din `approveProfile`, `toggleAssignable`, `associateRun`, `dissociateRun`, formularul de creare: cel puțin un test de succes (aplică rezultatul, golește eroarea) și un test de eșec (400/404/409, mesaj afișat, NU se aplică nimic). Specific:
- `associateRun` cu 409 + `activeRuns`: verific explicit că mesajul conține id-urile din listă (`run-activ-1`, `run-activ-2`), nu doar mesajul generic;
- `associateRun` fără profil ales: eroare locală, **zero** cereri trimise (`calls.associate.length === 0`);
- excepție de rețea (fetch aruncă în implementarea mock-ului): mesaj `'cererea a eșuat'`, fără excepție nescăpată (`assert.doesNotReject`);
- formular creare profil: nume gol/doar spații → eroare locală, zero cereri; succes → apare imediat în tabel (optimist, fără poll), inputuri golite; eșec → eroare afișată, inputurile NU se golesc.

**3. XSS (obligatoriu)** — 4 teste: nume cu `<img src=x onerror=alert(1)>` apare literal în celula tabelului de profiluri, cu `childNodes.length === 0` (nicio structură reală creată); `native_id`/`project` cu `<b>test</b>` apar literal în inspectorul unui run; specializare cu `<script>` apare literal în inspectorul unui profil; test explicit că mock-ul de DOM aruncă la orice `innerHTML =` (regresie structurală — dacă hud.js ar folosi vreodată `innerHTML` cu date, ORICE test din fișier ar pica zgomotos, nu doar cele patru XSS dedicate).

## Ce NU am testat, și de ce

- **Randare CSS/aspect vizual** — exclus explicit de brief (§4); planner a verificat deja vizual.
- **Comportamentul EXACT al `setTimeout` real (3000ms reale, suprapunere de timere reale)** — nu am simulat trecerea reală a timpului, doar am verificat structural (un singur timer programat, cu `ms = 3000`) și am testat direct suprapunerea de cicluri apelând `pollOnce()` de două ori manual, nu prin trecerea reală a ceasului. Motivul: brief-ul însuși spune „nu poți testa direct absența unui bug ipotetic" — am acoperit ce e verificabil determinist (ordinea corectă a aplicării răspunsurilor, nu mecanismul intern al lui `setTimeout`).
- **Wiring complet DOM→acțiune** (click real pe butonul „Asociază" din inspectorul randat, citind `select.value`) — am testat funcțiile de acțiune (`associateRun` etc.) direct, cu un `errorEl` creat manual, nu prin simularea unui click pe butonul construit de `renderRunInspector`. Motivul: fiabilitate — un test prin `dispatch('click', ...)` pe butonul găsit prin parcurgere recursivă a arborelui ar adăuga complexitate de căutare fără să testeze o logică suplimentară (handler-ul e `() => associateRun(run, select.value, errorEl)`, un simplu pass-through). Risc rezidual: dacă cineva greșește parametrii la înregistrarea listener-ului (ex. pasează `run.id` în loc de `run`), testele mele NU l-ar prinde. Recomand planner-ului să verifice manual (vizual, în browser) exact acest fir, dacă nu a făcut-o deja explicit pentru butonul de asociere (raportul RF-04-coder-raport.md menționează că a verificat vizual asocierea capăt la capăt după RF-04-b, deci acest risc pare deja acoperit empiric).
- **`toggleBtn`/`approveBtn` afișate condiționat** (ex. „Aprobă profilul" apare doar dacă `approval_state === 'proposed'`) — nu am testat explicit absența butonului la alt `approval_state`, fiindcă brief-ul nu o cere explicit în §2.3/§2.5; e o verificare de UI condițională, nu de logică critică. Poate fi adăugată ulterior dacă planner o cere.
- **`pruneSelection` apelat izolat, în afara lui `pollOnce`** — l-am testat doar prin fluxul complet (`pollOnce`), nu chemat direct cu stare pre-fabricată, fiindcă `profiles`/`selection` sunt variabile `let`/`const` de nivel de script, inaccesibile direct din sandbox (nu devin proprietăți globale — doar funcțiile `function`/`async function` devin). Fluxul prin `pollOnce()` testează totuși exact calea reală de producție.

## Suspiciuni de bug găsite

Niciuna nouă. Am recitit codul `hud.js` cu atenție (inclusiv cache-ul `lastRenderedInspector` din RF-04-b) și logica pare corectă conform brief-ului; testele de mai sus sunt construite să cadă dacă vreo regresie ar strica exact ce raportul coder-ului susține că a implementat (comparație pe `kind`+`id`+`revision`, token de cerere, `textContent` peste tot, fără `innerHTML`).

## Comanda exactă de rulat

```powershell
node --test test/hud.test.mjs
```

sau, pentru tot suite-ul de teste al proiectului:

```powershell
node --test test/
```

Nu am rulat nimic — conform rolului, doar planner-ul rulează comenzi.
