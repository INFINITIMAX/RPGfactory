# RF-04-c — brief coder: `pruneSelection()` aruncă eroare când golește selecția, blocând tot ciclul de sondare

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Context:** bug real, reprodus determinist de planner cu un script `node -e` + `vm` (nu din citire de cod, nu din suita de teste care rula deja — testul nou al tester-ului l-a scos la iveală, dar cauza exactă am diagnosticat-o eu, separat).

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Reproducerea exactă

```
node -e "... încarcă hud.js prin vm, selectează un profil, apoi îl elimină din listă, cheamă pruneSelection() ..."

hud.js:77
  if (selection.kind === 'run' && !findRun(selection.id)) selection = null;
                ^
TypeError: Cannot read properties of null (reading 'kind')
    at Object.pruneSelection (hud.js:77:17)
```

## 2. Cauza

```js
function pruneSelection() {
  if (!selection) return;
  if (selection.kind === 'profile' && !findProfile(selection.id)) selection = null;
  if (selection.kind === 'run' && !findRun(selection.id)) selection = null;
}
```

Dacă elementul selectat e un `profile` care tocmai a dispărut din date, PRIMA linie `if` face `selection = null`. A DOUA linie `if` citește imediat `selection.kind` — dar `selection` e deja `null`. Aruncă.

**Efectul în producție**: `pruneSelection()` e chemat din `pollOnce()`, ÎNAINTE de `setConnectionState(true)`, `renderProfilesTable()`, `renderRunsTable()`, `renderInspector()` — toate în același bloc `try`. Excepția din `pruneSelection()` sare direct la `catch`, care doar cheamă `setConnectionState(false)`. **Niciuna din cele patru funcții de randare nu mai rulează în acel ciclu** — tabelele nu se actualizează, inspectorul rămâne cu date vechi, agățat, exact opusul comportamentului cerut de brief (RF-04-coder.md §3: „inspectorul se golește explicit, nu rămâne cu date vechi agățate" — golirea nu se întâmplă deloc, din cauza asta).

Bug-ul se declanșează de fiecare dată când elementul selectat e un `profile` (nu un `run`) care dispare din date — pentru un `run` selectat, a doua linie nu se atinge de `selection` decât dacă prima a lăsat-o intactă (deci nu crapă în acel sens, dar logica tot e fragilă/greșit structurată).

## 3. Ce trebuie

Cele două verificări sunt exclusive reciproc (o selecție e ORI `profile`, ORI `run`, niciodată ambele) — structurează-le ca atare, nu ca două `if`-uri independente care presupun greșit că `selection` rămâne neschimbat între ele:

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

(sau echivalent — orice structură care garantează că a doua verificare nu citește `selection` după ce prima l-a golit deja).

## 4. Verificare cerută înainte de predare

Confirmă, prin descriere (nu poți rula), că după reparație:
- Selectezi un profil, profilul dispare din date, `pollOnce()` (sau apelul direct al lui `pruneSelection()`) NU mai aruncă.
- Inspectorul se ascunde și se golește corect în acest caz (verifică vizual în cod că restul lui `pollOnce()` — `renderProfilesTable`, `renderRunsTable`, `renderInspector` — chiar rulează după `pruneSelection()`, fără nicio altă cale de eroare pe care ai introdus-o).

## 5. Fișiere

**Poți modifica:** `public/hud.js` (doar funcția `pruneSelection`).

**NU atinge:** restul din `hud.js`, `hud.css`, `index.html`, `game.*`, `server.js`, `profiles.js`, `runs.js`, `test/**`, documentele de coordonare.

## 6. Raportul

Adaugă `## RF-04-c` la finalul `docs/handoff/RF-04-coder-raport.md`:

```
### Ce am schimbat
### Confirmare: restul lui pollOnce() rulează acum după pruneSelection()
### Contradicții găsite în brief
```

## 7. Constrângeri

- Nu rulezi comenzi. Nu scrii teste. Română.
