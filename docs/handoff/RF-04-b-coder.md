# RF-04-b — brief coder: inspectorul se reconstruiește la fiecare sondare (3s), stricând interacțiunea

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Context:** corecție în cadrul lotului RF-04, găsită de planner prin verificare vizuală reală în browser (regulă globală: interfața se verifică în browser înainte de a fi declarată gata, nu doar citită în cod).

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Ce am verificat, efectiv, în browser

Am pornit o instanță de test izolată (`localhost:5799`, fără să ating serverul tău de pe 5311), am creat un profil și o sesiune reale prin API, am deschis pagina, am selectat sesiunea (inspectorul apare corect, cu dropdown-ul de asociere). Am citit elementele interactive ale paginii de două ori, la câteva secunde distanță, fără să fac nimic altceva între timp: **referința dropdown-ului s-a schimbat** (`ref_4` → `ref_6`) — elementul fusese distrus și recreat, deși nimic din datele afișate nu se schimbase.

## 2. Cauza, verificată direct în `hud.js`

`pollOnce()` cheamă necondiționat `renderInspector()` la FIECARE ciclu de sondare reușit (la 3 secunde), indiferent dacă datele elementului selectat s-au schimbat sau nu:

```js
profiles = newProfiles;
runs = newRuns;
pruneSelection();
setConnectionState(true);
renderProfilesTable();
renderRunsTable();
renderInspector();   // <-- necondiționat
```

`renderInspector()` → `renderRunInspector()`/`renderProfileInspector()` încep cu `clearInspector()` (șterge TOT conținutul panoului) și reconstruiesc totul de la zero — inclusiv `<select>`-ul de asociere, opțiunile lui, butoanele.

Spre deosebire de `reconcileTable()` (folosit corect pentru cele două tabele — păstrează rândurile existente, actualizează doar celulele schimbate), inspectorul nu are nicio reconciliere. Rezultat: **orice interacțiune în curs cu inspectorul (dropdown deschis, opțiune aleasă dar butonul încă neapăsat) e distrusă la fiecare 3 secunde**, exact genul de problemă pe care brief-ul original (RF-04-coder.md §3) o cerea explicit evitată: „Nu se recreează orbește DOM-ul la fiecare poll: focus, scroll și selecție stabile" — regula acoperă corect tabelele, dar NU și inspectorul.

## 3. Ce trebuie

**Nu reconstrui inspectorul dacă elementul afișat nu s-a schimbat efectiv.** Compară, înainte de a apela `renderProfileInspector`/`renderRunInspector`:

- Dacă selecția curentă (`id`) e ACEEAȘI ca la ultima randare a inspectorului, ȘI
- Datele elementului respectiv (compară `revision` — deja există pe fiecare profil/run, e exact contorul potrivit pentru asta) sunt IDENTICE cu ce era afișat ultima dată,

atunci **nu face nimic** — lasă inspectorul exact cum e (dropdown deschis, opțiune aleasă, orice stare de interacțiune rămâne intactă).

Dacă selecția s-a schimbat (alt element selectat) SAU datele elementului selectat chiar s-au schimbat (revizie diferită — o acțiune a avut loc, ex. profilul tocmai a fost aprobat), ATUNCI reconstruiește inspectorul normal, ca acum.

Implementare sugerată (poți alege altă formă, motiveaz-o): ține minte ultima pereche `(kind, id, revision)` randată efectiv în inspector; la fiecare apel al lui `renderInspector()`, compară cu selecția+datele curente înainte de a decide dacă reconstruiește sau nu.

**Atenție la o capcană**: dacă utilizatorul SCHIMBĂ selecția (click pe alt rând), inspectorul TREBUIE să se reconstruiască, chiar dacă din întâmplare revizia noului element e identică cu a celui anterior — verifică `id`-ul, nu doar revizia.

**Golirea inspectorului** (când `selection` devine `null`, ex. prin `pruneSelection()`) rămâne neschimbată — asta chiar trebuie să se întâmple imediat, nu e problema de aici.

## 4. Ce NU face această corecție

- Nu schimbă `reconcileTable()`/tabelele — alea deja funcționează corect, confirmat vizual.
- Nu adaugă reconciliere fină ÎN INTERIORUL inspectorului (nu trebuie să actualizezi câmp cu câmp dacă chiar s-a schimbat ceva — poți tot reconstrui complet în acel caz, e rar, nu la fiecare 3 secunde).
- Nu schimbă contractul API sau alte fișiere.

## 5. Fișiere

**Poți modifica:** `public/hud.js`.

**NU atinge:** `public/hud.css`, `public/index.html`, `public/game.*`, `server.js`, `profiles.js`, `runs.js`, `db.js`, `migrations/**`, `adapters/**`, `test/**`, documentele de coordonare.

## 6. Raportul

Adaugă `## RF-04-b` la finalul `docs/handoff/RF-04-coder-raport.md`:

```
### Ce am schimbat
### Cum ai verificat că schimbarea selecției tot reconstruiește inspectorul (nu doar schimbarea reviziei)
### Contradicții găsite în brief
```

## 7. Constrângeri

- Nu rulezi comenzi. Nu scrii teste. Română.
