# RF-01 — raport reviewer (transcris integral de planner)

**Data:** 15-09-2026, EET.
**Brief:** `docs/handoff/RF-01-reviewer.md`
**Reviewer:** agent read-only, fără unelte de scriere.
**Transcriere:** planner-ul, integral și fără rezumat, conform `AGENTS.md`. Decizia planner-ului e la final, separată clar de raport.

---

## RAPORT (verbatim)

## VERDICT

APROBAT CU OBSERVAȚII

Codul repară corect toate cele 12 defecte documentate în oracol, testele sunt în marea lor majoritate regresii reale (verificate manual că ar fi eșuat pe codul vechi), iar suita e sigură pentru datele reale — dar există o deviație de contract nedeclarată la D8/§2.5 și câteva observații minore, niciuna blocantă.

## CONSTATĂRI

### C1 — Deviație de contract nedeclarată la plafonul de body (§2.5)
Severitate: MAJOR
Fișier: `body.js:36-49` (funcția `rejectTooLargeAfterDrain`) și `docs/handoff/RF-01-coder-raport.md:59-61` (secțiunea „Contradicții găsite în brief”)
Ce e: Brief-ul coder-ului spune explicit, la §2.5: „La depășire: răspunde 413, oprește acumularea și distruge cererea. **Nu aștepta să se termine transferul.**” Codul actual (rezultat din RF-01b→RF-01f) face exact opusul pe calea de acumulare (fără `Content-Length` corect): `rejectTooLargeAfterDrain` cheamă `drain()`, care **așteaptă** ca restul body-ului să fie citit și aruncat (până la `'end'` sau până la un plafon de 2 secunde) **înainte** de a scrie răspunsul 413. Motivul e bine documentat tehnic în raport (evitarea unui RST/ECONNRESET cauzat de `Connection: close` + `destroySoon()` intern al Node) — dar secțiunea obligatorie „Contradicții găsite în brief” din raportul coder-ului spune încă „Niciuna”, neschimbat de la versiunea inițială RF-01, deși RF-01b–RF-01f au introdus exact o asemenea contradicție cu litera contractului.
De ce contează: Nu e un bug funcțional — comportamentul e chiar mai sigur pentru client decât ce cerea contractul literal. Problema e de proces: o decizie de proiectare care contrazice explicit un contract de planner a fost luată tacit, în șase runde succesive, fără să fie consemnată formal unde brief-ul cerea exact asta. Dacă altcineva citește doar secțiunea „Contradicții” a raportului inițial, trage concluzia greșită că implementarea respectă §2.5 la literă.
Ce ar trebui: O completare (chiar și scurtă) în raportul coder-ului care spune explicit: „§2.5 cerea distrugere imediată fără așteptare; am ales să dreneze înainte de a răspunde, pentru motivul X — abatere conștientă, nu scăpare”. Nu necesită retrimitere la coder pentru cod — doar documentare.

### C2 — Teste cu dependență de ordine în `test/state.test.mjs`
Severitate: MINOR
Fișier: `test/state.test.mjs:91-116` (D5a/D5b) și testele D6 ulterioare, care citesc `current.updatedAt` prin `getState()` reflectând mutații lăsate de testele anterioare
Ce e: Brief-ul de tester (§5) cere explicit: „Fiecare test își curăță după el și poate rula independent de ordine.” Testele din acest fișier nu respectă asta — D5b depinde explicit de starea lăsată de D5a („continuăm de la starea scrisă de testul anterior”), iar testele D6 ulterioare citesc `updatedAt` curent, care depinde de toate PUT-urile anterioare din fișier.
De ce contează: `node:test` rulează testele dintr-un fișier secvențial, în ordinea declarării, implicit — deci practic nu se rupe nimic acum. Dar dacă cineva activează concurență (`test.concurrent` sau `--test-concurrency` pe fișier) sau reordonează testele, suita devine fragilă în tăcere, fără avertisment.
Ce ar trebui: Nimic urgent — de notat ca risc cunoscut, eventual de izolat cu `before`/`after` per test dacă se retușează fișierul pe viitor.

### C3 — Reconstrucția RF-01f e fidelă, dar bazată doar pe auto-descriere
Severitate: MINOR (informativ, nu defect)
Fișier: `body.js` întreg, comparat cu `docs/handoff/RF-01-coder-raport.md` secțiunea RF-01f
Ce e: Coder-ul a reconstruit `body.js` din propria descriere tehnică din raportul RF-01d, nu dintr-un diff sau backup real (fișierul nu era sub git). Am verificat comentariile din cod linie cu linie față de descrierea din raport (RF-01c/d/f) — sunt consistente între ele, nu am găsit comentarii care descriu un mecanism care nu mai există în cod (ex. nu mai apare nicio referire reziduală la `DRAIN_BYTE_CEILING` din RF-01e, corect eliminat peste tot).
De ce contează: Nu e o problemă găsită — e o confirmare, cerută explicit de planner, că reconstrucția nu a lăsat inconsecvențe cod/comentarii. O notez ca atare.
Ce ar trebui: Nimic. Planner-ul poate totuși rula suita `body.test.mjs` de câteva ori repetate, cum a cerut coder-ul, dat fiind că testul de bază pe fișierul reconstruit nu poate fi verificat prin diff.

### C4 — Bine făcut: separarea `body.js`/`http-guards.js`
Nu e o problemă, ci o confirmare la Î2. Ambele module sunt folosite real din mai multe locuri (`body.js` din `server.js` și `state.js`; `http-guards.js` doar din `server.js`, dar conține logică de securitate izolabilă și testabilă unitar). Nu sunt abstracții „pentru viitor” — fiecare funcție exportată e chemată efectiv. Nu am găsit cod mort sau parametri neutilizați rămași din iterațiile b–f.

## RĂSPUNS PUNCTUAL

**Î1 (testele dovedesc?):** Da, pe marea majoritate. Am verificat manual, defect cu defect (D1–D12), că testele exercită exact granița descrisă în oracol (ex. `D5a`/`D5b` disting explicit `baseUpdatedAt:0` pe stare inexistentă vs. existentă; D7 folosește ceas înghețat exact ca oracolul; D11 verifică efectul — coada rămâne funcțională — nu doar statusul). Nu am găsit `assert.ok(res)` tautologice. Cazul special §3.2 din `test/state-store.test.mjs` chiar dovedește ceva după inversare: nu doar „nu apare `unhandledRejection`”, ci și că o scriere ulterioară primește revizia corectă — asta separă „a înghițit eroarea” de „coada e sănătoasă”, exact distincția cerută de brief. Testul §3.3 (413 vs ECONNRESET) folosește `t.skip` pe ramura de eroare, conform cu instrucțiunea explicită a brief-ului — nu e un test „mereu verde” ascuns, e o limitare asumată și documentată.

**Î2 (cod inutil?):** Nu am găsit cod mort, funcții nefolosite sau abstracții „pentru viitor”. `body.js` și `server/http-guards.js` își merită existența — sunt reale module partajate/izolabile, nu artefacte de refactorizare abandonate.

**Î3 (contracte respectate?):** Aproape toate, verificate pe rând în cod: `createServer`/`startServer`, opțiunile injectabile, originea (host+port), containment-ul static, tabelul de metode, CAS cu contor monoton (`updatedAt`, compatibil cu `app.js` netins), schema — toate corespund §2 din brief. Singura abatere reală e la §2.5 (C1 de mai sus): calea de acumulare a body-ului așteaptă drenajul înainte de a răspunde, deviind de la „nu aștepta să se termine transferul”, fără să fie consemnată explicit ca deviație în secțiunea dedicată a raportului.

**Î4 (suita e sigură?):** Da. Am citit `test/rank.test.mjs` și `test/status.test.mjs` integral — mock-ul de `fs` interceptează `statSync`/`openSync`/`readSync`/`closeSync` doar pentru calea de fixture exactă (verificată prin `p === filePath`), orice altă cale trece prin `fs` real neschimbat, iar metodele originale sunt restaurate necondiționat în `finally`. Nu am găsit nicio scriere în `data/` real sau în `~/.claude`. Niciun test nu lansează un proces (opener injectat peste tot, verificat explicit că nu se apelează `spawn`/`rundll32`). Niciun port fix (peste tot `port: 0`, `srv.port` real folosit). Niciun monkey-patch pe `http.createServer` — a fost eliminat complet, confirmat prin lectura tuturor fișierelor de test.

**Î5 (limitări oneste?):** Da. Limitarea reziduală de la D8 (ECONNRESET posibil peste ~1.1 MiB pe calea Content-Length + trimitere integrală) e documentată atât în cod (`body.js:6-15`) cât și în raport, cu măsurători concrete. Politica symlink/junction e consemnată explicit ca netestată, atât de coder cât și de tester. `readAgents`/`status.js`/`rank.js` rămân corect excluse din lot (doar semnătura injectată). Singura gaură de onestitate e cea de la C1 — nu o afirmație falsă, ci o secțiune de raport rămasă neactualizată.

## CE AM VERIFICAT ȘI CE NU

Am verificat, citind integral: `docs/handoff/RF-01-oracol-baseline.md`, `RF-01-coder.md`, `RF-01-coder-raport.md` (toate secțiunile RF-01→RF-01f), `RF-01-tester.md`, `RF-01-tester-raport.md` (inclusiv completările RF-01b/c); codul de producție integral (`server.js`, `state.js`, `body.js`, `server/http-guards.js`); toate cele 6 fișiere de test vizate de lot (`server.test.mjs`, `state.test.mjs`, `body.test.mjs`, `api-open.test.mjs`, `http-guards.test.mjs`, `state-store.test.mjs`) integral; și, independent, `test/rank.test.mjs` + `test/status.test.mjs` pentru a confirma explicit cerința planner-ului privind mock-ul de `fs`.

Nu am verificat: rularea efectivă a suitei (fără unelte de rulare — planner-ul a raportat 257/257, exit 0, de trei ori; nu am cum să confirm independent, doar am citit codul static). Nu am verificat `test/app.test.mjs`, `test/merge-state.test.mjs`, `test/zones.test.mjs` (module neatinse de RF-01, brief-ul tester-ului le exclude explicit din migrare, iar reviewer-ul RF-01 nu are mandat să deschidă module din alte loturi). Nu am reprodus manual comportamentul de rețea (ECONNRESET vs 413) descris la §3.3/C1 — mă bazez pe analiza de cod și pe testul cu `t.skip`, exact ce a fost posibil fără unelte de execuție.

---

## DECIZIA PLANNER-ULUI

**Accept verdictul. C1 e corect ca observație, dar atribuit greșit — și corectarea atribuirii e responsabilitatea mea, nu a coder-ului.**

### C1 — acceptat ca fapt, respins ca vină a coder-ului

Reviewer-ul a găsit o inconsecvență reală: §2.5 din brief-ul inițial cerea „răspunde 413, oprește acumularea și distruge cererea, **nu aștepta să se termine transferul**", iar codul face invers pe calea de acumulare. Iar secțiunea „Contradicții găsite în brief" a raportului coder-ului spune încă „Niciuna".

Dar concluzia că „o decizie de proiectare care contrazice un contract de planner a fost luată tacit" e greșită, și trebuie corectată aici, unde rămâne scrisă.

**Nu a fost tacită. Am cerut-o eu, explicit, în scris.**

- `docs/handoff/RF-01c-coder.md` §2: i-am spus că `destroy()` trimite RST și pierde răspunsul, `end()` trimite FIN, și i-am cerut să exploreze închiderea după flush.
- `docs/handoff/RF-01d-coder.md` §3: i-am dat structura pe două căi, cu „drenează întâi, răspunde după" pentru calea de acumulare, ca cerință.
- `docs/handoff/RF-01e-coder.md` §3: i-am dat designul unificat, care abandona și mai mult litera lui §2.5.

Coder-ul a raportat „Niciuna" la contradicții în raportul **RF-01 inițial**, când implementase §2.5 la literă — corect la acel moment. Contractul a fost schimbat ulterior, de mine, prin briefuri succesive. Un raport scris înainte de o schimbare nu poate consemna acea schimbare.

**Deviația reală, consemnată aici ca înregistrare formală:**

> §2.5 din `RF-01-coder.md` cerea distrugerea imediată a cererii la depășirea plafonului, fără să se aștepte finalul transferului. Cerința s-a dovedit greșită: măsurată pe baseline, producea `ECONNRESET` la client în locul lui `413`, pentru că răspunsul nu apuca să plece pe fir. Am înlocuit-o, prin briefurile RF-01b–RF-01f, cu „drenează întâi, răspunde după" pe calea de acumulare, păstrând răspunsul imediat pe calea `Content-Length`. Abaterea e conștientă, măsurată și decisă de planner, nu o scăpare a coder-ului.

Nu retrimit la coder. Reviewer-ul spune el însuși că nu e nevoie de schimbare de cod, iar corectarea unui contract al planner-ului se face în evidența planner-ului.

**Lecția de proces, pentru loturile viitoare:** când schimb un contract prin brief de corecție, trebuie să consemnez schimbarea în locul unde a fost scris contractul inițial — nu doar în brief-ul nou. Altfel rămâne un document vechi care spune altceva, iar următorul cititor trebuie să reconstituie ordinea din timestamps. Exact problema pe care RF-00 a reparat-o la nivel documentar și pe care am reintrodus-o eu la nivel de lot.

### C2 — acceptat, consemnat ca risc cunoscut

Dependența de ordine din `test/state.test.mjs` e reală. Reviewer-ul are dreptate și în evaluarea gravității: `node:test` rulează secvențial în interiorul unui fișier, deci nu se rupe nimic azi. Devine periculoasă doar dacă cineva activează concurența, iar atunci ar eșua tăcut, nu zgomotos.

Nu o repar acum — ar însemna o rundă de tester pentru un risc care nu se manifestă. O consemnez în `GATES.md` ca datorie cunoscută, de rezolvat dacă se activează vreodată concurența pe fișier.

### C3 — confirmare utilă

Reviewer-ul a verificat, la cererea mea, dacă reconstrucția lui `body.js` din RF-01f a lăsat inconsecvențe între cod și comentarii. Nu a găsit; a confirmat inclusiv că nu mai există urme din designul RF-01e abandonat. Coroborat cu suita (257/257 de trei ori) și cu oracolul invers (12 din 13), reconstrucția e validată din trei direcții independente.

Asta închide și riscul semnalat de coder în raportul RF-01f.

### C4 — reținut

Modulele `body.js` și `server/http-guards.js` își justifică existența; fiecare funcție exportată are apelant real; niciun cod mort după șase iterații. Era întrebarea mea explicită la Î2, și răspunsul e favorabil.

### Ce NU declar

- **Nu declar RF-01 drept „aplicația e sigură".** Lotul acoperă suprafața HTTP, statice, input și salvare. XSS-ul din frontend, selecția pe canvas, animațiile și proiecția activității rămân nereparate, în loturile lor.
- **Nu declar limitarea D8 drept reparată.** Rămâne consemnată în `body.js`, în rapoarte și în `GATES.md`.
- **Nu bifez gate-uri pe baza afirmațiilor agenților.** Toate probele din `GATES.md` sunt rulări proprii, cu rezultate reale.

### Status

**RF-01: APROBAT CU OBSERVAȚII, observațiile acceptate și consemnate. Lotul se închide.**

Rulările de verificare finale, pe codul restaurat:
- suita completă: **257/257, exit 0**, de 3 ori din 3
- `test/body.test.mjs`: **12/12**
- oracol invers: **12 din 13 sonde** confirmă reparația; a 13-a e limitarea D8 acceptată
- serverul utilizatorului de pe 5311 (PID 54236): verificat activ înainte și după fiecare rulare, **neatins**
- `data/state.json` real: neatins, ultima modificare rămasă 13-09-2026
