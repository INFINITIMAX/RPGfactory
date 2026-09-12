# T-14 — Teste pentru decorațiuni (tufe/stânci) și nori

## Sarcină

Scrie teste pentru `decorationForCell()`, desenarea decorațiunilor din `drawZones()`, și `updateClouds()`/`drawClouds()` (vezi `docs/handoff/T-14-coder.md` și `docs/handoff/T-14-coder-raport.md`).

Planner a verificat deja: toate 141 de teste existente trec neschimbate (decorațiunile/norii nu se activează în testele vechi fiindcă niciunul nu declanșează `onload` pe imaginile noi — `bushImage`/`rock1Image`/`rock2Image`/`cloud1Image`/`cloud2Image` rămân `*Loaded=false`). Vei avea nevoie de helpere noi de tip `triggerBushImageLoad()`/`triggerRockImagesLoad()`/`triggerCloudImagesLoad()` (după modelul `triggerImageLoad()` existent — căutare după `.src`, nu index fix, cf. lecției de la T-13) ca să poți testa comportamentul REAL după încărcare.

## Cazuri de acoperit

1. **`decorationForCell` e determinist**: același `(projectId, cell)` → același rezultat la apeluri repetate.
2. **Distribuția aproximativă 1/3-1/3-1/3**: pentru un set mare de celule diferite (ex. 300 de perechi `(x,y)` distincte), numără câte primesc `bush`, câte `rock`, câte `null` — verifică că fiecare categorie e într-un interval rezonabil (nu exact 1/3, dar nu complet dezechilibrat — ex. fiecare între 20%-45%).
3. **Fără decorații înainte de încărcare**: fără să declanșezi `onload`-urile noi, `drawZones()` nu aruncă și nu produce `drawImage`-uri suplimentare față de comportamentul de dinainte de T-14 (verifică numărul de `drawImage` per celulă — 0, ca la T-10/T-13).
4. **Tufa animată, după încărcare**: declanșează `onload` pe imaginea de tufă, avansează cadrul de animație (`advanceAnimationFrame()`, deja existent) de câteva ori, verifică că argumentele sursă (`sx`) trimise la `drawImage` pentru tufă se schimbă ciclic (0..7 × 128px), la fel cum s-a testat deja pentru sprite-ul agentului.
5. **Stânca statică**: declanșează `onload` pe imaginile de stâncă — verifică că `drawImage` pentru stâncă NU se schimbă între avansări de cadru (rămâne aceeași imagine/sursă, spre deosebire de tufă).
6. **Poziționare decorațiune**: pentru o celulă cunoscută, verifică că decorația se desenează în colțul dreapta-jos (nu suprapusă peste centrul celulei, unde stau agenții) — compară coordonatele `dx/dy` din `drawImage` cu poziția centrului celulei (`zoneCellToPixels`).
7. **Nori — mișcare**: declanșează `onload` pe imaginile de nor, apelează `updateClouds()` de câteva ori (direct, ca funcție expusă pe sandbox), verifică că poziția `x` a fiecărui nor crește cu `speed * MOVEMENT_DT` per apel.
8. **Nori — reciclare**: avansează `updateClouds()` suficient de multe ori încât un nor să iasă din dreapta ecranului — verifică că poziția lui sare înapoi la stânga (`x = -CLOUD_DEST_WIDTH` sau echivalent), nu continuă să crească la infinit.
9. **Ordinea de desenare**: verifică (prin ordinea `drawImageCalls`/`fillRectCalls`, sau prin apeluri separate la `drawClouds()`/`drawZones()`) că norii se desenează ÎNAINTE de zone (deci în spatele lor).
10. **Norii nu se scalează cu zoom**: la `camera.zoom = 2`, dimensiunea desenată a unui nor rămâne `CLOUD_DEST_WIDTH`/`HEIGHT` nescalată (spre deosebire de decorațiunile de pe zonă, care SE scalează — testează diferența explicit).

## Ce NU e un test valid

- Nu testa `Math.random()` sau nedeterminism — totul aici trebuie determinist.
- Nu presupune exact 1/3-1/3-1/3 la o eșantionare mică (sub 50 de celule) — variația statistică pe eșantion mic ar face testul fragil; folosește un eșantion mare (≥300).

## Constrângeri dure

- Nu modifica `public/app.js`.
- Nu rula comenzi — planner rulează.
- `node --test`, fără dependențe noi.

## Predare

Modificări în `test/app.test.mjs` (helpere noi + teste) + `docs/handoff/T-14-tester-raport.md`: ce ai testat, ce NU (motivat), comanda exactă de rulare a întregii suite.
