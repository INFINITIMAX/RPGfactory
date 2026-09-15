## Ce am implementat

- `public/game.html`, `public/game.js`, `public/game.css` — conținut identic cu vechile `index.html`/`app.js`/`style.css`, doar redenumite; referințele interne din `game.html` actualizate (`href="game.css"`, `<script src="game.js">`); `zones.js`/`merge-state.js` neatinse, căi (`/merge-state.js`, `/zones.js`) neschimbate.
- `public/index.html` (nou) — pagina principală: bară de sus cu titlu + indicator de conexiune, tabel de profiluri + formular de creare profil, tabel de sesiuni observate, inspector fix în dreapta (`#inspector`).
- `public/hud.js` (nou) — logica: fetch periodic la `/api/profiles` + `/api/runs`, reconciliere DOM, selecție, randare inspector, cele 5 acțiuni din §4 al brief-ului.
- `public/hud.css` (nou) — stiluri proprii, separate de `game.css`.

Text vizibil în UI: română, consecvent cu restul comentariilor din proiect (`agent-map`/`game.js` folosesc tot română pentru mesaje de eroare — am păstrat aceeași alegere).

**Limitare de tool, nu de brief:** nu am acces la o unealtă de ștergere/mutare de fișiere (doar Read/Write/Edit/Glob/Grep). Am *copiat* conținutul vechi în `game.html`/`game.js`/`game.css` (identic) și am suprascris `public/index.html` cu noul HUD, așa cum cerea brief-ul — dar **`public/app.js` și `public/style.css` rămân pe disc cu conținutul lor vechi, nereferențiate de nimic** (nici `game.html`, nici noul `index.html` nu le mai încarcă). O „mutare” reală cere ștergerea explicită a acestor două fișiere, pe care planner-ul trebuie s-o facă (`Remove-Item public\app.js, public\style.css` sau echivalent `git mv`/`git rm`). Până atunci, tehnic, jocul vechi există duplicat (o dată sub `game.*`, o dată — mort, nereferențiat — sub numele vechi).

## Cum ai evitat innerHTML cu date interpolate

`hud.js` nu folosește `innerHTML` nicăieri. Toate valorile care vin din date (nume profil, specializare, `project`, `native_id`, stare, etc.) sunt scrise prin `textContent` sau `document.createTextNode`, iar elementele DOM prin `document.createElement`. Exemple:

```js
function setRowCells(tr, values) {
  while (tr.children.length < values.length) tr.appendChild(document.createElement('td'));
  ...
  values.forEach((value, i) => { if (tr.children[i].textContent !== value) tr.children[i].textContent = value; });
}
```

```js
function addInspectorField(label, value) {
  const row = document.createElement('div');
  const labelEl = document.createElement('span');
  labelEl.textContent = label;
  row.appendChild(labelEl);
  row.appendChild(document.createTextNode(value));
  inspectorEl.appendChild(row);
}
```

Butoanele/select-urile din inspector (`approveBtn`, `toggleBtn`, `select`, `associateBtn`, `dissociateBtn`) sunt create tot prin `createElement`, cu `.textContent` pentru etichetă și `.value`/`.addEventListener` pentru comportament — niciun șablon de string cu date interpolate în markup.

## Polling — single-flight și răspunsuri vechi

`pollOnce()` e chemat recursiv prin `setTimeout(pollOnce, POLL_INTERVAL_MS)` din blocul `finally` — următorul ciclu se programează abia **după** ce cel curent s-a terminat (succes sau eroare), deci nu pot exista două cicluri de sondare suprapuse din interval.

În plus, `requestToken` e incrementat la începutul fiecărui ciclu (`const myToken = ++requestToken`). Înainte de a aplica rezultatul (`profiles = newProfiles; runs = newRuns; ...`), verific `if (myToken !== requestToken) return;` — dacă între timp a pornit alt ciclu mai nou, răspunsul acesta (oricât de întârziat) e ignorat explicit, nu suprascrie starea. Verificarea simetrică există și pe ramura de eroare (`if (myToken === requestToken) setConnectionState(false)`), ca un eșec vechi să nu anuleze un indicator „conectat” stabilit între timp de un ciclu mai nou.

## Selecția supraviețuiește unui refresh — cum ai implementat asta

Selecția se ține ca `{ kind: 'profile'|'run', id }`, nu ca referință la obiect sau index. La fiecare randare, `isProfileSelected(id)`/`isRunSelected(id)` compară după `id`. La fiecare ciclu de poll reușit, chem `pruneSelection()` **înainte** de randare: dacă elementul selectat nu mai există în noul snapshot (`findProfile`/`findRun` întorc `null`), `selection = null` — inspectorul se ascunde explicit (`renderInspector` face `clearInspector()` + `classList.toggle('hidden', true)`), nu rămâne cu date vechi.

Randarea tabelelor (`reconcileTable`) nu recreează `<tr>`-urile din `innerHTML = ''`: ține câte o `Map(id -> <tr>)` per tabel (`profileRowsById`, `runRowsById`), reutilizează rândul existent (actualizează doar celulele care s-au schimbat, via `setRowCells`), adaugă rânduri noi și șterge doar cele dispărute. Focus/scroll pe pagină nu sunt afectate de un poll fără schimbări reale, pentru că DOM-ul rândurilor neschimbate nu e atins.

## Acțiunile din inspector — ce coduri de eroare tratezi explicit

Toate cele 5 acțiuni (`approveProfile`, `toggleAssignable`, `associateRun`, `dissociateRun`, formularul de creare profil) urmează același tipar: `try/catch` în jurul `fetch`, apoi `if (!res.ok)` citește `body.error` din răspunsul JSON și îl scrie în `textContent`-ul unui `<span class="action-error">` dedicat lângă acțiune — niciodată doar în consolă.

- 400 (VALIDATION) și 404 (NOT_FOUND) — `body.error` afișat direct.
- 409 (CONFLICT) — la profiluri (`current` atașat de server, nefolosit explicit în text, dar `body.error` din `profiles.js` include deja mesajul cu revizia curentă); la asociere run (I24), `body.activeRuns` (dacă există) e concatenat explicit în mesaj: `' — blocat de: ' + body.activeRuns.map(r => r.id).join(', ')`, ca operatorul să vadă exact ce run-uri active blochează, nu doar „a eșuat”.
- 500 — `body.error` (`'eroare internă'` din server.js) afișat la fel ca restul; dacă `res.json()` însuși eșuează sau `fetch` aruncă (rețea căzută), catch-ul general pune `'cererea a eșuat'`.

## Decizii pe care le-am luat singur

1. **Limba UI**: română, consecventă cu restul textelor din `game.js`/comentarii.
2. **Etichetarea ierarhiei**: titlu literal „Profiluri (ierarhie necunoscută)” deasupra tabelului de profiluri, ca să satisfacă cerința explicită din brief (§1) fără să construiesc vreo structură de arbore.
3. **Reconciliere tabele**: am scris o funcție generică `reconcileTable` (folosită și pentru profiluri, și pentru runs) în loc de două implementări paralele — brief-ul cerea „nu trebuie să fie sofisticat”, am ținut-o la un singur diff simplu bazat pe `Map`.
4. **`select` de asociere**: populat cu TOATE profilurile încărcate (nu filtrez după `approval_state`/`assignable`), fiindcă brief-ul (§4) spune doar „populat din tabelul de profiluri deja încărcat”, fără condiție suplimentară.
5. **URL-uri către `/api/runs/{id}/...`**: nu am făcut `encodeURIComponent` pe id (care conține `:` din `sourceHarness:nativeId`) — `server.js` rutează pe `pathname.split('/')` fără decodare, deci `%3A` nu s-ar potrivi cu id-ul stocat. Am interpolat direct id-ul brut în path, consecvent cu felul în care server.js citește segmentele.
6. **Toggle eligibilitate**: un singur buton, text schimbat după starea curentă (`Activează`/`Dezactivează eligibilitatea`), nu două butoane separate — brief-ul cere doar „comută”.

## Ce nu am făcut și de ce

- Nu am șters `public/app.js`/`public/style.css` — nu am unealtă de ștergere (vezi secțiunea „Ce am implementat”). Planner-ul trebuie să le elimine.
- Nu am construit nimic pentru consum de tokeni, task-uri/criterii, alerte, ierarhie reală — explicit exclus de brief (§6), nu există date.
- Nu am adăugat rute noi în `server.js` — toate acțiunile folosesc exact contractul existent din `profiles.js`/`runs.js`.
- Nu am scris teste (nu e rolul meu în acest flux).
- Nu am putut verifica vizual în browser (nu rulez comenzi) — vezi „Riscuri pentru tester”.

## Riscuri pentru tester

- Verificarea reală a single-flight/token de cerere are nevoie de un fetch mockuit cu răspunsuri întârziate/reordonate (nu se poate testa determinist doar cu `setTimeout` real).
- Reconcilierea tabelelor (`reconcileTable`/`setRowCells`) ar merita teste directe pe DOM (jsdom sau echivalent): adăugare/ștergere/reordonare de rânduri, păstrarea selecției (clasa `.selected`), și golirea explicită a inspectorului când elementul selectat dispare.
- Testarea XSS: un nume/specializare/`project` cu markup ostil (`<img onerror=...>`) trebuie verificat că apare ca text literal în celule și în inspector, nu executat.
- Fluxul de eroare 409 la `associateRun` — verifică explicit că `body.activeRuns` (când există) apare în mesajul afișat, nu doar `body.error` generic.
- Formularul de creare profil: verifică golirea corectă a inputurilor la succes și că profilul apare imediat în tabel fără să aștepte 3000ms.
- Nu există teste (sau nu le-am văzut) care să acopere `public/index.html`/`hud.js`/`hud.css` — e cod complet nou, fără acoperire anterioară.
- Fișierele `public/app.js`/`public/style.css` vechi trebuie șterse înainte ca testerul să scrie teste care presupun că `game.js`/`game.css` sunt singura sursă de adevăr pentru joc — altfel un test care încarcă din greșeală calea veche ar trece „din greșeală” pe cod duplicat.

## Contradicții găsite în brief

Niciuna.

## RF-04-b

### Ce am schimbat

`public/hud.js`, funcția `renderInspector()`: am adăugat variabila de modul `lastRenderedInspector` (`{ kind, id, revision }` sau `null`) care ține minte ultima combinație reconstruită efectiv în inspector. La fiecare apel al lui `renderInspector()`, înainte de a chema `renderProfileInspector`/`renderRunInspector`, compar `kind`+`id`+`revision` curente cu `lastRenderedInspector`; dacă sunt identice, funcția face `return` fără să atingă DOM-ul (dropdown deschis, opțiune aleasă rămân intacte). Dacă `selection` e `null`, comportamentul vechi rămâne neschimbat (`clearInspector()` imediat), doar că resetez și `lastRenderedInspector = null`, ca o reselecție ulterioară a aceluiași element să reconstruiască din nou inspectorul (nu se poate „ascunde” apoi „reveni” fără reconstrucție). Când chiar reconstruiesc (`id` diferit sau `revision` diferită), actualizez `lastRenderedInspector` cu noua pereche.

### Cum ai verificat că schimbarea selecției tot reconstruiește inspectorul (nu doar schimbarea reviziei)

Nu am rulat cod (nu am unealtă de comenzi) — am verificat prin citire atentă a fluxului: comparația din `renderInspector()` cere ca ATÂT `id`-ul CÂT ȘI `revision` să fie identice cu `lastRenderedInspector` pentru a sări reconstrucția (`&&` pe toate cele trei condiții: `kind`, `id`, `revision`). Dacă utilizatorul selectează alt element cu aceeași revizie întâmplător (ex. două profiluri, ambele la `revision: 1`), `selectProfile(id)`/`selectRun(id)` schimbă `selection.id`, deci `lastRenderedInspector.id !== profile.id` — condiția eșuează, se intră pe ramura de reconstrucție normală. Am recitit explicit `selectProfile`/`selectRun` din brief-ul original și confirmat că ele apelează `renderInspector()` direct după ce modifică `selection`, deci noua verificare din `renderInspector()` prinde corect schimbarea de `id` înainte de a compara reviziile.

### Contradicții găsite în brief

Niciuna.

## RF-04-c

### Ce am schimbat

`public/hud.js`, funcția `pruneSelection()`: al doilea `if` a devenit `else if`, ca cele două verificări (`kind === 'profile'`, `kind === 'run'`) să nu mai citească `selection.kind` după ce prima ramură a golit deja `selection` (`selection = null`), fiindcă sunt exclusive reciproc — o selecție e ori `profile`, ori `run`, niciodată ambele.

```js
function pruneSelection() {
  if (!selection) return;
  if (selection.kind === 'profile' && !findProfile(selection.id)) {
    selection = null;
  } else if (selection.kind === 'run' && !findRun(selection.id)) {
    selection = null;
  }
}
```

N-am atins nimic altceva din `hud.js`.

### Confirmare: restul lui pollOnce() rulează acum după pruneSelection()

Am recitit `pollOnce()` (linia 468 și următoarele): `pruneSelection()` e chemat imediat după `profiles = newProfiles; runs = newRuns;`, urmat, în același bloc `try`, de `setConnectionState(true)`, `renderProfilesTable()`, `renderRunsTable()`, `renderInspector()`. Cu fix-ul aplicat, când elementul selectat e un `profile` care a dispărut, prima ramură setează `selection = null` și execuția sare direct peste `else if` (nu mai evaluează `selection.kind` pe un `null`) — nu se aruncă nicio excepție, deci fluxul nu mai sare la `catch`, iar cele patru apeluri de mai jos rulează normal, în aceeași iterație de poll. Nu am introdus nicio altă cale de eroare: restul funcției rămâne neschimbat.

### Contradicții găsite în brief

Niciuna.
