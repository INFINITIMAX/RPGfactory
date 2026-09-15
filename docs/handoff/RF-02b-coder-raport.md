## Ce am implementat

`profiles.js` (nou) — `createProfilesStore(options)` cu `createProfile`, `getProfile`, `listProfiles`,
`updateProfile`, `getProfileHistory`, `createConfigurationVersion`, `listConfigurationVersions`, `close`.

`server.js` — import `createProfilesStore`, construcția `profilesStore` în `createServer(options)`
(cu `dbPath`/`migrationsDir` opționale trecute din `options`), helper `respondProfileError(res, e)`,
și blocul de rutare pentru `/api/profiles` și sub-căile lui, inserat imediat înainte de fallback-ul
`isApi -> 404` existent.

## Deschiderea lazy a bazei

`createProfilesStore` ține un `dbHandle` local, `null` la construcție. `getDb()` îl deschide
(`openDatabase({ path: dbPath, migrationsDir, now })`) doar la primul apel care are nevoie efectiv de
bază, apoi returnează același `db` memoizat la apelurile următoare. `close()` cheamă `dbHandle.close()`
și resetează la `null` doar dacă a fost vreodată deschis — altfel nu face nimic.

Am verificat că `createServer(...)` tot nu atinge discul la construcție: linia nouă din `server.js` este
`const profilesStore = createProfilesStore({ dbPath: options.dbPath, migrationsDir: options.migrationsDir, now });`
— acest apel doar închide peste `options`/`now` în interiorul modulului (exact structura funcției
`createProfilesStore`, care nu cheamă `getDb()` nicăieri în afara funcțiilor CRUD). Nicio funcție a
store-ului nu e apelată la construcție; prima atingere a discului se întâmplă abia când o cerere HTTP
reală ajunge pe una din rutele `/api/profiles*`.

## updateProfile — deciziile tale

- **Distincția id inexistent vs. revizie greșită**: da, distinse explicit. Fac `SELECT * FROM
  agent_profiles WHERE id = ?` la începutul tranzacției; dacă rândul lipsește -> `fail('NOT_FOUND', ...)`;
  dacă există dar `current.revision !== expectedRevision` -> `fail('CONFLICT', ..., { current })`. Ambele
  cazuri fac `ROLLBACK` explicit înainte de a arunca (tranzacția rămâne deschisă altfel).
- **Semnalul de conflict**: `Error` cu `.code = 'CONFLICT'` și `.current` = rândul complet citit din bază
  la momentul conflictului (nu doar revizia). `server.js` îl traduce în `409` cu body
  `{ ok: false, error, current }`.
- **UPDATE-ul**: o singură instrucțiune `UPDATE ... SET <câmpuri>, revision = revision + 1,
  updated_at = ? WHERE id = ? AND revision = ?`, sub aceeași tranzacție cu `SELECT`-ul de verificare.
  `WHERE revision = ?` e păstrat ca plasă de siguranță redundantă (documentat în cod) — `node:sqlite`
  (`DatabaseSync`) e sincron, deci nimic nu se poate strecura între `SELECT` și `UPDATE` în aceeași
  tranzacție/proces; dacă totuși `result.changes !== 1`, arunc o eroare **fără** `code` (tratată ca 500
  de `server.js`), fiindcă ar însemna o stare neașteptată a bazei, nu conflictul normal de revizie deja
  exclus mai sus.
- **Schimbare fără efect real**: revizia crește oricum (apelul a fost onorat ca atare), dar NU scriu rând
  de istoric pentru câmpurile a căror valoare nouă e identică (`===`) cu cea veche citită din `current`.
  Documentat explicit în comentariu în cod.
- **Un rând de istoric per câmp schimbat efectiv**: da — bucla peste `Object.keys(normalized)`, un
  `INSERT INTO profile_history` per câmp cu valoare diferită, `old_value`/`new_value` convertite la
  `String(...)` (sau `null`) pentru consistență de tip în coloana `TEXT`.
- **Validare în modul, nu doar în rută**: `validateChanges` respinge orice cheie în afara celor șase
  permise, validează tipurile/valorile fiecăreia (`approval_state` doar `'proposed'`/`'approved'`,
  `assignable` normalizat din `true`/`false` la `1`/`0`, `name` nevid după `trim()`,
  `primary_specialization`/`last_project`/`last_post` cu regulile din brief). `expectedRevision` obligatoriu,
  întreg >= 1, validat înainte de `validateChanges`.

## Rutele — coduri de status exacte

| Rută | Metodă | Succes | Erori |
|---|---|---|---|
| `/api/profiles` | POST | 201 + profil complet | 400 (name lipsă/gol, primarySpecialization non-string) |
| `/api/profiles` | GET | 200 + array (poate fi gol) | — |
| `/api/profiles` | altă metodă | — | 405, `Allow: GET, POST` |
| `/api/profiles/{id}` | GET | 200 + profil | 404 dacă nu există, 400 dacă `id` are caractere de control |
| `/api/profiles/{id}` | PATCH | 200 + profil actualizat | 400 (`expectedRevision` lipsă/invalid, `changes` gol/invalid/câmp necunoscut/valoare invalidă, body JSON invalid — de la `readJsonBody`), 404 (id inexistent), 409 (conflict de revizie, cu `current` în body) |
| `/api/profiles/{id}` | altă metodă | — | 405, `Allow: GET, PATCH` |
| `/api/profiles/{id}/history` | GET | 200 + array (poate fi gol) | 400 dacă `id` invalid |
| `/api/profiles/{id}/history` | altă metodă | — | 405, `Allow: GET` |
| `/api/profiles/{id}/configurations` | POST | 201 + configurație completă | 400 (`harness`/`provider`/`model` lipsă, refs non-string), 404 (`profileId` inexistent — din `FOREIGN KEY` prins în modul) |
| `/api/profiles/{id}/configurations` | GET | 200 + array (poate fi gol) | 400 dacă `id` invalid |
| `/api/profiles/{id}/configurations` | altă metodă | — | 405, `Allow: GET, POST` |
| orice cale sub `/api/profiles/` cu mai mult de 4 segmente sau `sub` necunoscut | — | — | 404 |

Corp JSON invalid pe POST/PATCH -> 400, tratat integral de `readJsonBody` (nu am dublat logica).
Orice eroare neașteptată din `profilesStore` (fără `.code`) -> 500, prin `respondProfileError`, cu
`console.error` — la fel ca modelul din `state.js` pentru erorile de disc.

## Decizii pe care le-am luat singur

- **Coduri 201 la creare** (`POST /api/profiles`, `POST /api/profiles/{id}/configurations`), spre
  deosebire de rutele existente `/api/open`/`/api/reveal` (care întorc 200 pentru acțiuni, nu creare de
  resurse). Brief-ul nu fixează codul de succes explicit, doar cere să documentez alegerea.
- **Field-urile de istorie folosesc numele coloanei** (`name`, `primary_specialization`,
  `approval_state`, `assignable`, `last_project`, `last_post`), nu numele camelCase din API-ul JS
  (`primarySpecialization` etc.) — consistent cu `field: 'created'` din `createProfile`, care nu e nici
  el o coloană.
- **`respondProfileError` central în `server.js`**, nu duplicat pe fiecare rută — o singură funcție
  traduce `e.code` -> status, apelată din toate cele trei rute care pot arunca din modul.
- **Validare la rută minimă pentru `expectedRevision`/`changes`**: nu am dublat validarea profundă în
  `server.js` — trimit direct la `updateProfile`, care validează integral și aruncă `VALIDATION`
  (mapat la 400). Brief-ul (§2.3) cere ca modulul să fie „sigur folosit și direct", ceea ce face
  duplicarea în rută inutilă și predispusă la divergență.
- **Sortare determinată** (`ORDER BY created_at ASC, id ASC` / `changed_at ASC, id ASC`) pe toate
  citirile de listă, ca rezultatele să fie stabile la rulări repetate (nu era cerut explicit, dar
  fără ordonare `SELECT *` din SQLite nu garantează nicio ordine).

## Ce nu am făcut și de ce

- Nu am creat `approveProfile`/`setAssignable` separate — brief-ul (§2.3) e explicit că sunt cazuri
  particulare ale `updateProfile`.
- Nu am adăugat filtrare/paginare la `listProfiles` — interzis explicit (§2.5, §4).
- Nu am atins `db.js`, `migrations/**`, `state.js`, `body.js`, `server/http-guards.js` — conform §5.
- Nu am scris teste.

## Riscuri pentru tester

- **Concurență reală multi-proces**: `node:sqlite` (`DatabaseSync`) e sincron în cadrul unui singur
  proces Node, deci `updateProfile` e sigur față de concurență *în interiorul acestui proces*. Nu am
  verificat comportamentul cu două procese Node separate care scriu pe același fișier `.db` simultan
  (WAL + `busy_timeout=5000` din `db.js` ar trebui să serializeze, dar n-am testat asta — dincolo de
  scopul acestui lot, cred).
- **`result.changes !== 1` în `updateProfile`**: cod defensiv, teoretic mort în condiții normale
  (`SELECT` + `UPDATE` în aceeași tranzacție sincronă). Ar merita un test care confirmă că nu se
  declanșează niciodată în circumstanțe normale, nu neapărat unul care-l forțează artificial.
  Ar putea fi util de discutat cu planner-ul dacă merită acoperire.
- **Mesajul de eroare FOREIGN KEY**: detectarea profilului inexistent la `createConfigurationVersion`
  se bazează pe `/FOREIGN KEY/i.test(e.message)` din eroarea nativă `node:sqlite`. Dacă mesajul exact
  diferă între versiuni de Node/SQLite, verificarea ar putea rata cazul și lăsa o eroare 500 în loc de
  404 — testerul ar trebui să confirme formatul mesajului pe mediul real.
- **`assignable` cu `true`/`false`**: normalizat la `1`/`0` în modul. Testerul ar trebui să acopere și
  cazul `assignable: 2` sau alte valori invalide (trebuie 400).
- **`id` cu caractere de control**: verificat cu `CONTROL_CHARS` (regex existent), dar NU verific
  formatul UUID propriu-zis — un `id` de forma `"abc"` trece de validarea de rută și ajunge la
  `getProfile`/`updateProfile`, care pur și simplu nu-l găsesc (404), nu e o eroare de validare.
  Brief-ul (§3) permitea explicit „cel puțin să nu conțină caractere de control", deci decizia e
  conformă, dar testerul să nu se aștepte la 400 pentru un id sintactic invalid dar fără caractere de
  control.

## Contradicții găsite în brief

Niciuna.

## RF-02b-b

### Ce am schimbat

`server.js`, două modificări în `server.js`:

- În `createServer(...)`: `server.closeProfilesStore = profilesStore.close;`, lângă
  `server.setAllowedOrigins`, ca wiring intern echivalent.
- În `startServer(...)`: `close()` din obiectul întors face acum
  `server.close(...).then(() => server.closeProfilesStore())` în loc să oprească doar HTTP-ul.

### De ce am ales ordinea asta (înainte/după oprirea HTTP-ului)

Am oprit întâi HTTP-ul (`server.close()`, care așteaptă cererile active înainte de a chema callback-ul —
comportamentul implicit al `http.Server#close()`), și abia după aceea am închis baza de profiluri. Astfel
nicio cerere aflată deja în curs pe `/api/profiles*` nu poate fi tăiată la mijloc de un handle SQLite
închis sub ea; iar din momentul în care `server.close()` s-a rezolvat, nu mai poate ajunge nicio cerere
nouă care să aibă nevoie de bază.

### Confirmare: close() e sigur de apelat chiar dacă profilesStore n-a deschis niciodată baza

Confirmat din citirea `profiles.js` (nu l-am modificat, doar verificat): `close()` din modul face
`if (dbHandle) { dbHandle.close(); dbHandle = null; }` — dacă nicio cerere n-a atins vreodată
`/api/profiles*`, `dbHandle` e încă `null`, deci apelul nu face nimic (nu deschide baza doar ca s-o
închidă la loc). Apelarea necondiționată din `startServer(...).close()` e deci sigură indiferent dacă
serverul a servit vreodată o cerere de profiluri.

## RF-02b-c

### Ce am schimbat

`server.js`, în `createServer(...)`: după `server.closeProfilesStore = profilesStore.close;`, am
înfășurat metoda nativă `server.close`:

```js
const nativeClose = server.close.bind(server);
server.close = (callback) => nativeClose((err) => {
  profilesStore.close();
  if (callback) callback(err);
});
```

Acum orice apelant al `server.close(...)` — direct pe obiectul `http.Server` brut, sau prin
`startServer(...)` — închide și baza de profiluri, automat, fără să depindă de o convenție uitată.
`server.closeProfilesStore` a rămas atașat, neschimbat, pentru un apelant care vrea explicit doar
baza, fără să oprească HTTP-ul.

### Ce am făcut cu duplicarea din startServer (păstrat/eliminat, de ce)

Eliminat. `close()` din obiectul întors de `startServer(...)` era
`server.close(...).then(() => server.closeProfilesStore())` (RF-02b-b) — devenise redundant, fiindcă
wrapper-ul de mai sus închide deja baza la fiecare `server.close()`, inclusiv cel apelat din
`startServer`. Am simplificat la `close: () => new Promise((res) => server.close(() => res()))`.
Am verificat că dubla închidere n-ar fi stricat nimic (`profiles.js`'s `close()` e idempotent —
`if (dbHandle) { dbHandle.close(); dbHandle = null; }`), dar am preferat să nu las două locuri care
fac același lucru, ca să nu diverge în viitor.

### Comportamentul lui close() dacă serverul n-a ascultat niciodată

Neschimbat față de comportamentul nativ. `http.Server#close(callback)` nu aruncă sincron — dacă
serverul n-a fost pornit niciodată (`listen()` nu s-a apelat), Node cheamă callback-ul cu
`ERR_SERVER_NOT_RUNNING` ca prim argument, la următorul tick. Wrapper-ul meu trece prin exact același
`err` din `nativeClose` către callback-ul apelantului (`if (callback) callback(err);`) — nu-l
înghite și nu-l transformă. Singura diferență observabilă e că `profilesStore.close()` se cheamă și
în acest caz, dar asta e sigur (idempotent, `dbHandle` e `null` dacă baza n-a fost atinsă niciodată).
