## Ce am implementat
`migrations/004-sloturi.sql`, `world.js` (adăugate `profilesByProject`/`assignSlots`, exportate alături de `groupProjects`/`pickAccent`), `slot-store.js` (nou), `server.js` (extindere `GET /api/world` cu `pawns`, `slotStore` injectat ca `layoutStore`, wrapper `close()` extins), `public/world.js` (desen pawn-uri + animație de pulsație pentru cei care lucrează, `prefers-reduced-motion`).

## Convenția slot_index = cellIndex*7 + localSlotIndex
Aplicată identic în ambele capete:
- backend (`server.js`): `capacity = zone.cells.length * 7`, calculat DUPĂ ce zonele existau deja (așa cum cerea brief-ul), trimis ca atare la `assignSlots`.
- frontend (`public/world.js`, `drawPawns`): `cellIndex = Math.floor(pawn.slotIndex / 7)`, `localSlotIndex = pawn.slotIndex % 7`, folosind `zone.cells[cellIndex]` din zona identificată prin `pawn.project`, apoi `slotsForCell(cx, cy)[localSlotIndex]` cu aceeași geometrie din RF-05b (`hexToWorld`, `slotsForCell`), fără nicio duplicare a formulelor.

## assignSlots — memorie și determinism
`assignSlots(profileIds, previous, capacity)` în doi pași, fără hash/random:
1. Parcurge `profileIds` în ordine și păstrează postul din `previous` dacă e valid (`slotIndex < capacity`) ȘI slotul nu a fost deja luat în acest apel (gardă defensivă împotriva unei corupții ipotetice de date cu două intrări `previous` pe același slot — nu ar trebui să se întâmple datorită `UNIQUE(project, slot_index)`, dar rezultatul rămâne fără coliziuni chiar și așa).
2. Restul (`needsSlot`, în ordinea din `profileIds`) primesc cel mai mic `slot_index` liber, căutat crescător de la 0 — determinist, aceeași intrare produce mereu aceeași alocare pentru cine caută sloturi noi în aceeași ordine.

Cei care nu mai apar în `profileIds` nu ajung deloc în rezultat (postul li se „eliberează" implicit, pentru că `saveSlots` șterge orice rând din acel proiect care nu mai apare în `assignment`). Cei care depășesc `capacity` nu primesc slot (overflow acceptat, documentat în cod și în brief, fără reprezentare vizuală în acest lot).

## De ce NU există CAS pe slot-store.js
Motivat identic cu `layout.js`: singurul scriitor e serverul, dintr-un singur loc (`GET /api/world`), niciun endpoint de mutație expus către clienți externi. Riscul rămas — două cereri HTTP simultane recalculând aproape simultan din același `previous` — e benign, ambele rezultate fiind la fel de valide (nu există o „intenție" de utilizator care ar putea fi lovită de o scriere concurentă pe bază de stare veche). Comentariul din `slot-store.js` reia explicit acest raționament.

## working: true — sursa exactă
`server.js`, în `/api/world`: `runsStore.listRuns()`, filtrat strict la `lifecycle === 'running'` (nu `queued`, nu `paused`) și transformat într-un `Set` de `profile_id`. Un pawn e `working: true` doar dacă `profileId` e în acel `Set`.

## sizeFactor — de ce e fix 1 în acest lot, unde ar intra RF-06
Fix la `1` în obiectul `pawn` construit în `server.js`, cu comentariu explicit la locul respectiv. Frontend-ul (`drawPawns`) îl folosește deja ca multiplicator de rază (`baseRadius = 6 * (pawn.sizeFactor || 1)`), deci RF-06 nu va cere nicio rescriere a randării — doar o schimbare a valorii trimise de server (probabil în același loc din `server.js` unde azi e scris `sizeFactor: 1`).

## Animația — prefers-reduced-motion, pornire/oprire requestAnimationFrame
`updateAnimationLoop()` e apelată doar la fiecare `pollOnce()` (nu la fiecare cadru), și decide: bucla pornește (`requestAnimationFrame`) doar dacă există cel puțin un pawn `working: true` ȘI `prefers-reduced-motion` e fals; se oprește (`cancelAnimationFrame`, `rafId = null`) imediat ce condiția nu mai e adevărată la un poll ulterior. Pulsația în sine (`Math.sin(nowMs / 300)`, cu `nowMs = performance.now()`) e bazată pe timp real, nu pe numărul de cadre — desenul arată identic indiferent de rata de refresh. Când `reduced` e adevărat, pawn-ii `working` primesc un marcaj static (contur mai gros, altă culoare), fără nicio buclă pornită pentru ei.

## Extinderea wrapper-ului de close()
`server.closeSlotStore = slotStore.close` adăugat lângă `closeLayoutStore`; `slotStore.close()` adăugat în ACELAȘI wrapper `server.close = (callback) => nativeClose(...)`, imediat după `layoutStore.close()` — nu am creat alt wrapper paralel.

## Decizii pe care le-am luat singur
- Inițiala numelui (`pawn.name.charAt(0).toUpperCase()`) desenată peste token — brief-ul lăsa opțional acest detaliu („decide tu, documentează"). Am ales inițiala (nu numele complet) ca să nu aglomereze vizual un token de 6px.
- Culoarea tokenului (`#f4f2ee`, aceeași cu textul etichetelor de zonă) și conturul distinct pentru `working` static (`#c96442`, prima culoare din `PALETTE`) — alese să contrasteze cu accentul zonei de dedesubt, fără să introducă o paletă nouă.
- În `server.js` am apelat `slotStore.getSlots()` o dată per zonă (în interiorul buclei), exact cum descrie pasul 3 din brief — nu am optimizat să citească o singură dată pentru toate proiectele, ca să respect literal secvența cerută (fiecare zonă își recalculează sloturile independent).

## Ce nu am făcut și de ce
- Nicio mărime reală din usage, niciun sprite/sheet, nicio mișcare/pathfinding, niciun click/hover — toate explicit excluse de brief (§3.3, §4).
- Nu am scris teste (nu e rolul meu) și nu am rulat nimic.

## Riscuri pentru tester
- `assignSlots`: cazuri de graniță utile — `profileIds.length === capacity` exact, `capacity === 0` (zonă fără celule, deși nu ar trebui să apară în practică), profil cu post anterior peste noua `capacity` (trebuie realocat, nu păstrat), ordine care schimbă cine primește sloturile noi.
- `profilesByProject`: profiluri fără `last_project`, ordinea păstrată identică cu `profiles` de intrare (nu se resortează).
- `slot-store.js`: `saveSlots` pentru un proiect gol (`assignment` fără intrări) trebuie să șteargă toate rândurile acelui proiect, fără să atingă alte proiecte.
- `server.js`: verificat că `pawns` conține doar profiluri cu `last_project` setat (excluse cele fără proiect) și că `working` reflectă strict `running`, nu `queued`/`paused`.
- `public/world.js`: greu de testat automat animația vizuală (canvas) — testabil mai degrabă `updateAnimationLoop`/`prefersReducedMotion` ca funcții izolate dacă tester-ul le poate extrage, sau prin mock-uri pe `requestAnimationFrame`/`matchMedia`. Nu am extras aceste funcții din IIFE (rămân închise în modul, ca restul stilului existent din RF-05b) — dacă tester-ul are nevoie de acces direct, e o limitare de arhitectură moștenită de la RF-05b, nu una introdusă de mine.

## Contradicții găsite în brief
Niciuna.
