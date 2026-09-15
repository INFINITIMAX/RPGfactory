# RF-04 — brief coder: primul ecran vizibil (tabele, inspector, acțiuni)

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Lot:** RF-04 — primul ecran care arată date reale din RF-02/RF-03.
**Decizie confirmată de Lucian:** noul ecran înlocuiește pagina principală (`index.html`) acum. Jocul vechi (canvas, hexagoane) rămâne în cod, mutat la alt nume, nu se șterge — RF-05 îi va lua locul mai târziu cu harta nouă.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Sarcina, cu limitele ei reale

**De ce ecranul e mai simplu decât `spec.md` §7 în întregime**: `spec.md` descrie un HUD complet (ierarhie, consum de tokeni, task-uri/criterii, alerte). Din toate astea, **doar profilurile (RF-02b) și sesiunile observate (RF-02c/RF-03a) au date reale acum**. Nu există încă: ierarhie (Pi amânat, RF-03b), consum (RF-06), task-uri/criterii/dovezi (nicio migrație pentru ele), alerte (idem). **Nu construi ecrane pentru date care nu există** — un tabel gol permanent sau o secțiune „consum: —" fără sens ar fi exact genul de „decor cu date greșite" interzis de `instructiuni.md` §2.

Ce arată efectiv acest ecran:

1. **Tabel de profiluri** (`GET /api/profiles`) — nume, specializare, stare aprobare, eligibil, ultim proiect.
2. **Tabel de sesiuni observate** (`GET /api/runs`) — harness, proiect, stare (lifecycle), profil asociat (numele, dacă e asociat) sau „neasociat".
3. **Inspector** (panou fix, în dreapta — I01) — la selectarea unui rând din oricare tabel, arată detaliile complete + acțiunile disponibile (mai jos).
4. **Formular minim de creare profil** (nume + specializare) — I26: planner-ul propune.
5. **Indicator de conexiune** (conectat / reîncercăm) — spec.md §7: „stare connected/stale/disconnected vizibilă".

**Ierarhia**: un singur grup, etichetat explicit „ierarhie necunoscută" — nu inventa relații părinte/copil din `project`/`cwd` sau orice altceva. Asta rămâne așa până la RF-03b (Pi).

## 2. Lecția din audit — obligatorie, nu opțională

`docs/AUDIT-13-09-2026.md` a găsit deja XSS prin `innerHTML` cu metadate interpolate (nume/cwd venite din date reale, puse direct în șablon de string). **Nu repeta asta.**

**Regulă dură**: orice text care vine din date (nume de profil, specializare, `project`, `native_id`, orice câmp din `runs`/`agent_profiles`) se pune în DOM prin `textContent` sau `document.createElement(...)` + atribuire de proprietăți — **NICIODATĂ prin `innerHTML` cu un șablon de string care include acea valoare**. Poți folosi `innerHTML` doar pentru structură STATICĂ, fără nicio valoare interpolată din date.

Exemplu GREȘIT (nu face asta):
```js
el.innerHTML = `<td>${profile.name}</td>`; // XSS dacă name conține markup
```

Exemplu CORECT:
```js
const td = document.createElement('td');
td.textContent = profile.name;
tr.appendChild(td);
```

## 3. Polling — disciplinat, nu naiv

`spec.md` §7: „Nu se recreează orbește DOM-ul la fiecare poll: focus, scroll și selecție stabile" și „Polling single-flight... fără răspunsuri vechi care suprascriu noul snapshot".

- **Single-flight**: dacă un ciclu de sondare (fetch la `/api/profiles` + `/api/runs`) e încă în curs, NU porni altul peste el — așteaptă să termine, apoi programează următorul.
- **Răspunsuri vechi nu suprascriu unele noi**: dacă pornești o cerere, apoi (dintr-un motiv oarecare — reconectare, etc.) pornești alta înainte ca prima să răspundă, iar prima răspunde MAI TÂRZIU decât a doua, rezultatul ei NU trebuie aplicat peste rezultatul mai proaspăt. Folosește un contor/token de cerere (incrementezi la fiecare pornire, verifici la răspuns că ești tot cel mai recent).
- **Selecția supraviețuiește unui refresh**: dacă ai un rând selectat (ex. profilul X) și vine un refresh, rândul rămâne selectat (după `id`, nu după poziție în listă) și inspectorul rămâne deschis pe același element — dacă elementul a dispărut între timp (ex. run-ul a fost șters, ipotetic), inspectorul se golește explicit, nu rămâne cu date vechi „agățate".
- **Nu recrea tabelul întreg din `innerHTML=''` + reconstrucție completă la fiecare poll** dacă poți evita — o strategie simplă acceptabilă: compară rândurile noi cu cele vechi (după `id`), actualizează doar celulele schimbate, adaugă/șterge rânduri after diff. Nu trebuie să fie sofisticat (nu construi un framework de reconciliere) — doar suficient cât să nu piardă selecția și să nu „clipească" vizibil la fiecare 3 secunde.
- **Interval de sondare**: 3000ms, injectabil printr-o constantă ușor de găsit în cod (ca `POLL_INTERVAL_MS` din vechiul `app.js`).
- **Indicator de conexiune**: dacă un ciclu de sondare eșuează (fetch aruncă, sau răspuns non-OK), arată vizibil „reîncercăm" (sau echivalent), NU lăsa tabelul să pară „la zi" cu date vechi fără avertisment.

## 4. Acțiuni disponibile din inspector

Toate folosesc API-ul deja existent (RF-02b/RF-02c) — nu adăuga rute noi.

- **Aprobă profilul** (dacă `approval_state === 'proposed'`): `PATCH /api/profiles/{id}` cu `{ expectedRevision, changes: { approval_state: 'approved' } }`. Revizia curentă trebuie citită din profilul afișat (nu presupusă) — dacă a expirat între timp (409 CONFLICT), arată eroarea, nu rescrie orbește.
- **Comută eligibilitatea** (`assignable`): similar, `PATCH` cu `changes: { assignable: ... }`.
- **Asociază un run la un profil** (din inspectorul unui run neasociat): `POST /api/runs/{id}/associate` cu `{ profileId, expectedRevision }` — alegerea profilului dintr-un `<select>` populat din tabelul de profiluri deja încărcat. La conflict I24 (409, `activeRuns`), arată exact ce blochează (nu doar „a eșuat").
- **Dezasociază** (din inspectorul unui run asociat): `POST /api/runs/{id}/dissociate`.
- **Creează profil nou**: formular (nume, specializare opțională) → `POST /api/profiles`. La succes, apare imediat în tabel (fără să aștepți următorul poll — actualizare optimistă locală, apoi confirmată/corectată la următoarea sondare).

Toate erorile (400/404/409/500) se afișează vizibil lângă acțiunea care a eșuat, cu mesajul din `error` al răspunsului — nu ascunde eșecurile în consolă.

## 5. Fișiere — redenumirea jocului vechi

**Mută (nu șterge)**, păstrând conținutul identic, doar redenumite:
- `public/index.html` → `public/game.html`
- `public/app.js` → `public/game.js`
- `public/style.css` → `public/game.css`
- `public/zones.js`, `public/merge-state.js` — rămân la loc (le folosește doar `game.html`, nu trebuie mutate, dar actualizează referințele din `game.html`).

**În `game.html`** (fostul `index.html`), actualizează referințele interne la fișierele redenumite (`href="style.css"` → `href="game.css"`, `<script src="app.js">` → `<script src="game.js">`) — `zones.js`/`merge-state.js` rămân cu aceleași căi. Titlul paginii poate rămâne cum era.

**Creează noi:**
- `public/index.html` — noul HUD, pagina principală.
- `public/hud.js` — logica (fetch, randare, polling, acțiuni).
- `public/hud.css` — stiluri proprii, separate de `game.css` (nu le amesteca).

`server.js` NU trebuie modificat — servirea statică e deja generică pentru orice fișier din `public/`.

## 6. Ce NU face acest lot

- **Nu construiește harta/hexagoanele/personajele** — RF-05.
- **Nu afișează consum de tokeni, task-uri, criterii, alerte** — nu există date, nu inventa UI pentru ele.
- **Nu implementează ierarhie reală** — un singur grup „necunoscută", pregătit pentru RF-03b.
- **Nu șterge jocul vechi** — doar îl mută (§5).
- **Nu adaugă framework nou** (React, etc.) — JS simplu, ca restul proiectului.

## 7. Fișiere

**Poți crea:** `public/hud.js`, `public/hud.css`, `public/index.html` (nou conținut).

**Poți muta/redenumi:** `public/index.html` → `public/game.html`, `public/app.js` → `public/game.js`, `public/style.css` → `public/game.css` (cu actualizarea referințelor interne din `game.html`).

**NU atinge:** `public/zones.js`, `public/merge-state.js` (doar referințele către ele din `game.html`, nu conținutul lor), `server.js`, `db.js`, `profiles.js`, `runs.js`, `migrations/**`, `adapters/**`, `state.js`, `body.js`, `server/http-guards.js`, `status.js`, `rank.js`, `test/**`, `package.json`, `data/`, `.env`, `assets/`, documentele de coordonare.

## 8. Raportul

`docs/handoff/RF-04-coder-raport.md`:

```
## Ce am implementat
Ecranul nou (index.html/hud.js/hud.css) + redenumirea jocului vechi.

## Cum ai evitat innerHTML cu date interpolate
Confirmă, cu exemple din cod, unde ai folosit textContent/createElement.

## Polling — single-flight și răspunsuri vechi
Cum ai implementat contorul/token-ul de cerere, ce se întâmplă la un răspuns întârziat.

## Selecția supraviețuiește unui refresh — cum ai implementat asta

## Acțiunile din inspector — ce coduri de eroare tratezi explicit

## Decizii pe care le-am luat singur

## Ce nu am făcut și de ce

## Riscuri pentru tester

## Contradicții găsite în brief
Dacă niciuna, scrie „niciuna".
```

## 9. Constrângeri

- Nu rulezi comenzi. Nu scrii teste. Nu afirma că ceva „funcționează" — nu poți verifica vizual în browser.
- Nu delega. Română, în cod și raport (textul vizibil în UI poate fi român sau englez, alege unul și fii consecvent — motivează alegerea).

### Citește înainte

1. `public/app.js` (vechiul, înainte să-l redenumești) — tiparul de polling (`POLL_INTERVAL_MS`) deja folosit în proiect, ca stil de referință (nu-l copia mecanic, are alte probleme cunoscute din audit — vezi mai jos)
2. `docs/AUDIT-13-09-2026.md` — găsește explicit rândul despre XSS prin `innerHTML`, citește-l integral
3. `spec.md` §6 (API și securitate — „Datele afișate se construiesc prin DOM/text sigur") și §7 (HUD și lume)
4. `profiles.js`, `runs.js`, rutele din `server.js` — contractul exact al API-ului pe care-l consumi (coduri de eroare, forma răspunsurilor)
