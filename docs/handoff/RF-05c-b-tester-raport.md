# RF-05c-b — raport tester: corecție 6 teste care picau

## Ce am reparat în slot-store.test.mjs

Am adăugat `makeSharedStores(dir, now)` (linia ~39), model identic cu cel din
`test/runs.test.mjs`: `profilesStore` și `slotStore` deschise pe ACELAȘI
fișier de pe disc (`path.join(dir, 'shared.db')`), nu `':memory:'` — pentru ca
FK-ul `profile_slots.profile_id -> agent_profiles(id)` să găsească efectiv
profilul creat de `profilesStore`.

Am rescris cele 5 teste care foloseau id-uri sintetice (`'profil-a'`,
`'profil-b'`, `'ramas'`, `'dispare'`, `'x'`, `'y'`, `'z'`, `'a'`, `'b'`, `'p'`):

- **(14) round-trip saveSlots/getSlots** — creez `profilA`/`profilB` reali cu
  `profiles.createProfile({ name: ... })`, folosesc `.id`-ul întors (UUID
  generat de `crypto.randomUUID()` în `profiles.js`, nu pot forța un id
  literal) ca cheie în `assignment`, verific cu `[profilA]: 0` etc.
- **(15) profil dispărut din assignment -> rândul e șters** — `ramas` și
  `dispare` create real, restul logicii neschimbată.
- **(16) scrierea pe proiectul A nu modifică proiectul B** — `x`, `y`, `z`
  create real (trei profiluri distincte, unul refolosit la a doua scriere pe
  proiectul A).
- **(17) assignment complet gol -> șterge tot** — `a`, `b` create real.
- **(revision crește la a doua scriere)** — testul folosea deja fișier real
  (nu `:memory:`), dar cu profilul sintetic `'p'`; am adăugat
  `createProfilesStore` pe același `dbPath` și creez profilul real înainte de
  `saveSlots`, apoi verific rândul SQL după `profilId`-ul real întors.

Testele care NU scriu (getSlots pe bază goală, createSlotStore lazy, close()
idempotent) au rămas neatinse — nu au nevoie de profiluri reale, exact cum
spunea brief-ul.

Nu am slăbit nicio asertare: logica verificată (chei/valori exacte, ștergerea
rândurilor dispărute, izolarea între proiecte, revizia care crește) e identică
cu înainte — s-a schimbat doar SETUP-ul (cum se creează id-urile de profil
folosite), nu ce se verifică.

## Ce am reparat în server-world.test.mjs

Linia 102-105: testul vechi (RF-05b) verifica `assert.deepEqual(json, { zones: [] })`
pentru `GET /api/world` fără profiluri în bază. După RF-05c, endpoint-ul
întoarce și `pawns: []`. Am corectat asertarea și titlul testului la
`{ zones: [], pawns: [] }`. Am verificat prin `Grep` că nu mai există alt
`assert.deepEqual(json, ...)` în fișier care să omită `pawns` — e singurul loc
afectat.

## Am verificat că toate cele 47 de teste trec acum?

Nu pot rula comenzi. Ce am verificat manual, prin citire:

- `profiles.js`, funcția `createProfile({ name, primarySpecialization })`:
  validează doar `name` (obligatoriu, nevid) — apelurile mele
  `profiles.createProfile({ name: 'X' })` etc. respectă semnătura exact, fără
  parametri în plus care ar declanșa `VALIDATION`.
- `createProfile` întoarce `getProfile(id)`, deci `.id` există pe rezultat —
  am confirmat că `id` e coloana PK din `agent_profiles`, exact ce cere
  `profile_slots.profile_id` ca țintă de FK.
- `slot-store.js`, `saveSlots`: nu validează formatul lui `profileId` (îl ia
  ca atare din cheile `assignment`) — un UUID generat de `crypto.randomUUID()`
  e un string valid, nimic din cod nu presupune un format anume (spre
  deosebire de vreo restricție de lungime/regex, care nu există).
- `db.js` are `PRAGMA foreign_keys = ON` (confirmat direct în brief și în
  cauza eșecurilor) — modelul `makeSharedStores` cu `dbPath` fișier comun e
  singura cale ca FK-ul să găsească rândul, exact tiparul deja validat în
  `runs.test.mjs` (44 de teste care deja trec cu acest model).
- Am recitit fiecare test modificat linie cu linie: `store.close()` +
  `profiles.close()` + `rmrf(dir)` apar în fiecare `finally`, ca să nu rămână
  fișiere temporare sau handle-uri deschise — evită interferența dintre teste
  și scurgerile de resurse semnalate ca lecție recurentă în `AGENTS.md`.
- Testul `close(): sigur de apelat pe un store neatins` și
  `createSlotStore(...) lazy` rămân neschimbate — le-am recitit ca să confirm
  că nu ating deloc `agent_profiles`, deci nu au nevoie de reparație.
- Nu am atins `test/world.test.mjs` și nu am modificat nimic în afara celor
  două fișiere permise.

Rămâne planner-ul să ruleze efectiv
`node --test test/world.test.mjs test/slot-store.test.mjs test/server-world.test.mjs`
și să confirme cele 47/47.

## Decizii pe care le-am luat singur

- Id-urile de profil din testele (14)-(17) și din testul de revizie nu mai
  sunt string-uri literale fixe (`'profil-a'`, `'p'` etc.), ci id-urile reale
  (UUID) întoarse de `profiles.createProfile(...)`, capturate în variabile
  (`profilA`, `ramas`, `x`, `profilId` etc.) și folosite atât la scriere cât
  și la citire/asertare. Brief-ul nu preciza exact cum se numesc variabilele
  sau dacă id-urile rămân literale — dar cum `createProfile` generează
  întotdeauna un UUID nou (nu acceptă un id impus de apelant), nu exista altă
  cale să păstrez String-urile vechi ca id-uri reale de profil. Am păstrat
  denumirile descriptive din testele originale (`ramas`, `dispare`, `x`, `y`,
  `z`) ca nume de variabile, ca intenția testului să rămână lizibilă.
- Am numit directoarele temporare per test (`rf05c-slots-14`, `-15`, `-16`,
  `-17`, `-revision`) ca să fie ușor de urmărit care test a produs ce fișier,
  dacă un test eșuează și `rmrf` nu ajunge să ruleze.

## Contradicții găsite în brief

Niciuna.
