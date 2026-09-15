# RF-04 — brief tester: primul ecran vizibil

**Data:** 15-09-2026, EET.
**Rol:** tester. **Nu rulezi comenzi. Nu afirmi că testele trec.**
**Lot:** RF-04 — `public/hud.js` (+ `index.html`/`hud.css` doar structural, nu au logică de testat separat).

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Context — verificat deja de planner

Planner a verificat **vizual, în browser real** (instanță de test izolată, pe alt port, fără să atingă serverul activ al utilizatorului): tabelele, selecția, inspectorul, crearea de profil, aprobare, asociere/dezasociere — toate funcționează. A găsit și a trimis la reparat un bug real (inspectorul se reconstruia la fiecare 3 secunde, distrugând orice interacțiune în curs — ex. un dropdown deschis) — reparat la RF-04-b, reconfirmat vizual după reparație (dropdown-ul supraviețuiește peste 5 secunde de sondare, acțiunea de asociere funcționează capăt la capăt).

**Ce NU poți verifica tu** (nu ai browser): comportamentul vizual real, randarea CSS. **Ce poți și trebuie să verifici**: logica din `hud.js` — funcțiile pure de reconciliere, gestionarea stării, apelurile către API (mockuite, ca la testele de server existente sau cu un DOM minim simulat — verifică ce framework de testare DOM e deja folosit în proiect, dacă e vreunul, altfel testează funcțiile care nu depind de `document` direct, izolat).

## 2. Ce ai de testat

Dat fiind că `hud.js` e scris ca script clasic care rulează direct în browser (fără `module.exports`), verifică întâi cum a rezolvat proiectul o problemă similară pentru `public/app.js`/`public/zones.js`/`public/merge-state.js` (fișiere de test există deja pentru codul vechi — `test/` conține teste care încarcă scripturi de tip browser prin `node:vm`, cu un DOM minim mockuit manual). **Folosește exact același tipar** pentru `hud.js` — nu inventa altă abordare.

### 2.1 `reconcileTable` — funcția de reconciliere generică
- Listă nouă goală → toate rândurile vechi sunt șterse din `tbody`.
- Adăugare de elemente noi → rânduri noi create, adăugate în ordinea corectă.
- Element existent, date schimbate → celulele lui se actualizează (`textContent`), fără să se recreeze elementul `<tr>` (verifică identitatea obiectului DOM, nu doar conținutul).
- Element existent, date NESCHIMBATE → celulele nu se ating deloc (poți verifica indirect, ex. că `textContent` nu e resetat la o valoare care ar diferi temporar).
- Ordine schimbată în lista nouă → rândurile se reordonează în DOM să reflecte noua ordine.
- Element dispărut din lista nouă → rândul lui e șters din `tbody` ȘI din harta internă (`rowMap`) — verifică că nu rămâne „agățat" (testează adăugând din nou un element cu același `id` mai târziu, ar trebui tratat ca nou, nu ca o resurecție a celui vechi).

### 2.2 `setRowCells`
- Actualizează corect celulele existente când numărul de valori e neschimbat.
- Adaugă celule noi dacă numărul de valori crește; elimină celule în plus dacă scade.
- Nu rescrie `textContent` al unei celule dacă valoarea e deja identică (verifică, dacă poți, că nu se declanșează o scriere inutilă — nu e critic, dar brief-ul original o menționează ca optimizare).

### 2.3 `renderInspector` / cache-ul `lastRenderedInspector` (RF-04-b)
**Cel mai important de testat — exact bug-ul găsit de planner.**
- Selecție neschimbată, date neschimbate (`kind`+`id`+`revision` identice cu ultima randare) → `renderProfileInspector`/`renderRunInspector` NU sunt chemate din nou (verifică, ex. printr-un spy/contor pe aceste funcții, sau verificând că un element DOM creat manual în interiorul inspectorului supraviețuiește apelului).
- Selecție schimbată (alt `id`, aceeași revizie ca proiect posibil) → inspectorul SE reconstruiește (verifică explicit — asta era capcana semnalată în brief-ul RF-04-b).
- Aceeași selecție, `revision` schimbată → inspectorul SE reconstruiește.
- Selecție devine `null` (`pruneSelection` a golit-o) → `clearInspector()` chemat, `lastRenderedInspector` resetat la `null` (verifică că o revenire ulterioară la același element reconstruiește corect, nu rămâne blocată crezând că nu s-a schimbat nimic).

### 2.4 `pollOnce` — single-flight și token de cerere
- Un ciclu de sondare pornește abia după ce cel anterior s-a terminat (verifică structura `setTimeout` din `finally`, nu `setInterval` — dacă cineva ar schimba asta înapoi la `setInterval`, ar bloca `pollOnce()`-uri suprapuse; nu poți testa direct absența unui bug ipotetic, dar poți verifica comportamentul actual: două „tick"-uri succesive nu se suprapun temporal).
- Un răspuns care sosește după ce alt ciclu a pornit deja (`myToken !== requestToken`) NU se aplică peste starea curentă — testabil dacă poți controla ordinea de rezolvare a promisiunilor mockuite (`fetch` fals cu `Promise` controlate manual, rezolvate în ordine inversă).
- Eșec de rețea (`fetch` aruncă, sau `res.ok === false`) → `setConnectionState(false)` chemat, dar NU dacă între timp un ciclu mai nou a preluat deja controlul.

### 2.5 Acțiunile (`approveProfile`, `toggleAssignable`, `associateRun`, `dissociateRun`, formularul de creare)
- Succes (`res.ok`) → `applyUpdatedProfile`/`applyUpdatedRun` chemat cu body-ul răspunsului, eroarea locală golită.
- Eșec (400/404/409/500) → mesajul de eroare afișat (`errorEl.textContent`), NU se aplică nicio actualizare de stare.
- 409 cu `activeRuns` (conflict I24) → mesajul include lista, nu doar „a eșuat".
- Excepție de rețea (`fetch` aruncă) → mesaj „cererea a eșuat", nu o eroare nescăpată/necontrolată.
- Formular creare profil: nume gol → eroare locală, fără cerere trimisă către server.

## 3. Verificare XSS — obligatorie

Testează explicit: un profil/run cu `name`/`project`/`native_id` conținând markup (ex. `<img src=x onerror=alert(1)>` sau pur și simplu `<b>test</b>`) trebuie să apară ÎN TEXT, ca literă, în celule/inspector — NU interpretat ca HTML. Verifică prin `textContent` al elementului rezultat (nu `innerHTML`), sau prin absența unui element `<img>`/`<b>` real creat în DOM.

## 4. Ce NU e un test valid

- Nu testa randarea CSS/aspectul vizual — nu ai unelte pentru asta, planner a verificat vizual deja.
- Nu presupune un anumit tipar de mock DOM fără să verifici întâi ce există deja în `test/` pentru `app.js`/`zones.js` — reutilizează, nu reinventa.

## 5. Fișiere

**Poți crea:** un fișier de test nou pentru `hud.js` (alege numele consecvent cu convenția din `test/`, ex. `test/hud.test.mjs`).

**NU atinge:** `public/hud.js`, `public/hud.css`, `public/index.html`, `public/game.*`, `server.js`, `profiles.js`, `runs.js`, documentele de coordonare.

## 6. Raportul

`docs/handoff/RF-04-tester-raport.md`: ce ai testat, ce NU (motivat — inclusiv dacă unele cazuri nu sunt testabile fără un DOM/browser real, spune exact de ce), comanda exactă de rulare.

## 7. Constrângeri

- Nu rulezi comenzi. Nu afirma că „acum trece". Română.
