# RF-02b — raport tester

**Data:** 15-09-2026, EET.

## Fișiere create

- `test/profiles.test.mjs` — `createProfilesStore` direct, fără HTTP, tipar ca `test/db.test.mjs`.
- `test/server-profiles.test.mjs` — rutele `/api/profiles*`, server real pe port efemer, tipar ca `test/server.test.mjs`.

N-am extins niciun fișier existent — `test/db.test.mjs` și `test/server.test.mjs` sunt deja mari și acoperă alte loturi (RF-02a/RF-01); fișiere noi, dedicate lotului, sunt mai ușor de citit izolat și de retrimis dacă acest lot se reia.

## Comanda exactă de rulare

```powershell
npm test
```

sau, doar lotul RF-02b:

```powershell
node --test test/profiles.test.mjs test/server-profiles.test.mjs
```

## `test/profiles.test.mjs` — ce verifică fiecare grup

Toate folosesc `dbPath: ':memory:'` cu `migrationsDir` implicit (schema reală din `migrations/001-profiluri.sql`), `now` injectat.

- **createProfile**: id UUID plauzibil + implicituri (`proposed`/`0`/`1`) — ar cădea dacă coder-ul ar seta altă valoare implicită sau ar accepta `id` de la apelant. Name lipsă/gol/spații → `VALIDATION`, câte un test per caz — ar cădea dacă validarea `trim()` ar fi eliminată. Rând `profile_history` la creație, citit direct din bază — ar cădea dacă acel `INSERT` ar fi omis sau ar avea `field`/`old_value` greșite. Două profiluri → id-uri diferite — ar cădea dacă cineva ar înlocui `crypto.randomUUID()` cu un contor.
- **updateProfile** (grupul cel mai mare, cum cerea brief-ul):
  - update valid → revision +1, câmp schimbat, `updated_at` = `now()` injectat — ar cădea la orice regresie a incrementului sau a ceasului.
  - `expectedRevision` lipsă/non-număr/non-întreg/0/negativ (5 cazuri, buclă) → `VALIDATION`, **și** verificare explicită că baza n-a fost atinsă (`revision` neschimbat, zero rânduri noi de istoric) — ar cădea dacă validarea ar lăsa să treacă un caz sau dacă modulul ar scrie ceva înainte de a valida complet.
  - conflict de revizie → `CONFLICT` cu `e.current` = profilul real (verificat pe `revision` și `name`), nimic schimbat — ar cădea dacă `e.current` ar fi stale sau dacă conflictul ar lăsa o scriere parțială.
  - id inexistent → `NOT_FOUND`, nu `CONFLICT` — ar cădea dacă distincția SELECT separat ar fi eliminată și totul ar cădea pe un singur cod.
  - `changes` gol → `VALIDATION`.
  - `changes` cu cheie necunoscută (3 cazuri: `id`, `revision`, `created_at`) → `VALIDATION` **și** confirmare că baza n-a fost atinsă.
  - `approval_state` invalid → `VALIDATION`.
  - `assignable` true/false → normalizat la `1`/`0`, cu `typeof === 'number'` verificat explicit (nu doar valoarea) — ar cădea dacă normalizarea ar stoca boolean/text.
  - `assignable` invalid (`2`, `'da'`) → `VALIDATION`.
  - mai multe câmpuri deodată → revision +1 exact (nu +2), exact 2 rânduri noi de istoric, cu `old_value`/`new_value` verificate per câmp — ar cădea dacă bucla de istoric ar scrie de două ori pe câmp sau dacă revizia ar crește per câmp în loc de per apel.
  - valoare identică cu cea curentă → revision tot crește, dar **zero** rânduri noi de istoric — testez exact decizia documentată de coder în raport (nu ce presupuneam eu inițial).
  - `last_project`/`last_post` = `null` explicit → acceptat.
- **createConfigurationVersion**:
  - date valide → configurație completă, `created_at` = `now()`.
  - `profileId` inexistent → `code: 'NOT_FOUND'`, nu eroare SQLite brută — testul confirmă explicit traducerea prin regex pe mesajul `FOREIGN KEY constraint failed` (planner a verificat manual mesajul exact pe Node 24.19.0).
  - `harness`/`provider`/`model` lipsă sau goale (6 cazuri, buclă) → `VALIDATION`.
  - refs lipsă → acceptate, `null` în bază.
  - nu scrie în `profile_history` — comparație explicită înainte/după.
  - modulul nu expune `updateConfigurationVersion`.
- **Citirile**: `getProfile` inexistent → `null`; `listProfiles` ordine stabilă (`created_at ASC, id ASC`) cu profiluri de stări diferite incluse; `getProfileHistory`/`listConfigurationVersions` pe id fără date/inexistent → array gol, fără excepție.
- **Deschiderea lazy** (modul, nu server): `createProfilesStore(...)` cu `dbPath` într-un director inexistent — fișierul și directorul părinte nu există înainte de primul apel real; apar abia după `createProfile()`.

## `test/server-profiles.test.mjs` — ce verifică fiecare grup

Un server pornit o singură dată (`before`/`after`), `dbPath` într-un fișier temporar propriu.

- Toate rutele din tabelul brief-ului, coduri de succes și eroare (201/200/400/404/409), inclusiv `current` în body-ul lui 409.
- 405 cu `Allow` corect pe fiecare cale existentă (`/api/profiles`, `/api/profiles/{id}`, `.../history`, `.../configurations`).
- Cale necunoscută sub `/api/profiles/` (`/altceva`, `/history/extra`) → 404.
- Body JSON invalid pe `POST /api/profiles` → 400 (un singur test, nu retestez `body.js`).
- Origine lipsă/greșită pe mutații → 403 (două teste minime, nu retestez `checkOrigin` exhaustiv — deja acoperit în `http-guards.test.mjs`/`server.test.mjs`).
- **Deschiderea lazy, capăt-la-capăt prin server**: `createServer(...)` cu `dbPath` inexistent → fișierul nu apare nici la construcție, nici la o cerere pe altă rută (`/api/agents`), ci abia la prima cerere reală pe `/api/profiles`.

Fiecare test ar cădea la exact schimbarea de comportament pe care o descrie — nu am scris nicio asertare care ar trece indiferent de cod (ex. nu verific doar `res.ok`, ci status exact + conținut relevant din body).

## Ce NU am acoperit, motivat

- Concurență reală multi-proces (WAL + `busy_timeout`) — brief-ul (RF-02b-coder-raport, „Riscuri pentru tester") o marchează explicit ca dincolo de scop.
- `result.changes !== 1` defensiv din `updateProfile` — cod teoretic mort în condiții normale (SELECT+UPDATE în aceeași tranzacție sincronă); nu l-am forțat artificial, cum sugera și coder-ul.
- Format UUID strict (versiune/variantă) — regexul meu verifică forma generală (`8-4-4-4-12` hex), nu biții de versiune/variantă RFC 4122; suficient pentru „UUID plauzibil", nu am vrut să pinuiesc un detaliu pe care brief-ul nu-l cere.
- Retestarea exhaustivă a `readJsonBody`/`checkOrigin`/containment static — deja acoperite în `body.test.mjs`/`http-guards.test.mjs`/`server.test.mjs`; am pus câte un test minim de integrare pe rutele noi, cum cerea brief-ul (§5).
- `rundll32`/opener real — nu implicat în acest lot.

## Suspiciune de bug găsită (de verificat prin rulare)

**Testul `GET /api/profiles/%00 -> 400`** din `test/server-profiles.test.mjs` s-ar putea să pice, și cred că merită verificat explicit de planner/reviewer, nu doar acceptat orbește:

În `server.js`, `id` vine din `pathname.split('/').filter(Boolean)` — **niciodată decodat** (`decodeURIComponent`) înainte de `CONTROL_CHARS.test(id)`. Comparați cu `resolveStaticPath` din `server/http-guards.js`, care decodează explicit înainte de verificarea de bytes nule. Cererea `GET /api/profiles/%00` ajunge la `new URL(req.url, 'http://localhost')`, iar conform comportamentului documentat deja în `server.test.mjs` (D4, testul cu `%2F`/`%5C`), `.pathname` **păstrează** secvențele procent-codate ca text, nu le decodează. Deci `id` primit de rută ar fi literal șirul de 3 caractere `"%00"` (`%`, `0`, `0` — toate în afara intervalului `\x00-\x1f`/`\x7f`), nu byte-ul de control real. `CONTROL_CHARS.test('%00')` ar fi `false`, iar cererea ar continua spre `getProfile('%00')` → `null` → **404**, nu 400.

N-am rulat codul (nu am voie), deci nu afirm cu certitudine rezultatul — doar am urmărit codul până la capăt. Dacă planner confirmă 404 în loc de 400 la rulare, e o discrepanță reală față de brief-ul coder-ului (§3: „`id`... cel puțin să nu conțină caractere de control" — pentru control chars *reale*, trimise brut, verificarea ar funcționa; pentru cele *procent-codate*, cum sugerează exemplul explicit al brief-ului tester-ului, `%00`, nu). Nu am slăbit asertarea ca să treacă „oricum" — am lăsat testul să ceară exact ce cere brief-ul tester-ului (400), ca să scoată la iveală diferența dacă există.

Testele cu `\r`/`\n` brute din brief nu le-am putut scrie separat prin `fetch`/`http.request`: Node validează client-side caracterele din `path` (`ERR_UNESCAPED_CHARACTERS`) și le respinge înainte de a trimite cererea pentru orice octet sub `\x21` — deci un control char literal, netrimis procent-codat, nu poate fi produs cu clientul HTTP standard folosit în restul suitei (ar necesita scriere brută pe socket, dincolo de tiparul celorlalte teste din `server.test.mjs`). Testul cu `%00` e singurul realizabil cu tiparul existent și acoperă totuși exact exemplul dat explicit în brief.

## Observația despre `errcode` vs. regex (pentru reviewer)

Notă transmisă mai departe din brief, nu descoperire proprie: `node:sqlite` expune și `e.errcode` (`787` = `SQLITE_CONSTRAINT_FOREIGNKEY`), un cod numeric stabil, mai robust decât potrivirea `/FOREIGN KEY/i.test(e.message)` folosită azi în `profiles.js`. Regexul funcționează azi (verificat manual de planner pe Node 24.19.0: mesajul e exact `"FOREIGN KEY constraint failed"`), iar dacă vreodată nu s-ar mai potrivi, `respondProfileError` cade sigur pe 500 (nu pe un răspuns greșit sau o scurgere de date) — am scris testul `createConfigurationVersion: profileId inexistent -> code NOT_FOUND` ca să fixeze comportamentul actual, dar decizia „acceptăm azi, revizităm dacă se schimbă" rămâne a planner-ului/reviewer-ului, nu ceva ce am corectat eu.

## Constrângeri respectate

Nu am rulat nicio comandă. Nu am atins `profiles.js`, `server.js`, `db.js`, `migrations/**`, sau orice alt fișier interzis de brief.

## RF-02b-b

### Testul %00 — ce am schimbat și de ce

Am scos testul `GET /api/profiles/%00 -> 400`, care cerea exact comportamentul greșit (confirmat acum de planner: `id` din `pathname.split('/')` nu e niciodată decodat, deci `%00` ajunge la `CONTROL_CHARS` ca 3 caractere printabile, nu ca byte-ul de control real — 404 e răspunsul corect, nu 400).

L-am înlocuit cu:

- un grup parametrizat de 5 teste, `GET /api/profiles/{id-suspect} -> 404`, peste `['%00', '%0d%0a', '..%2f..%2fetc%2fpasswd', '%2e%2e', 'a%00b']` — verifică ce chiar contează: niciun id "suspect" nu produce 500 sau alt comportament neașteptat, doar 404 ca orice id inexistent. Fiecare ar cădea dacă ruta ar arunca o excepție necapturată pe vreunul din aceste id-uri (ex. dacă cineva ar adăuga `decodeURIComponent(id)` fără să trateze eroarea de decodare, sau dacă `getProfile` ar arunca în loc să întoarcă `null`).
- un test explicit, separat, `GET /api/profiles/%00 -> 404, nu 400`, care fixează comportamentul de azi ca să scoată la iveală orice schimbare viitoare a sursei lui `id` — dacă cineva adaugă `decodeURIComponent` înainte de `CONTROL_CHARS.test(id)`, acest test ar începe să pice (404 devenind 400), semnalând schimbarea. Ăsta e testul care păstrează explicit verificarea `CONTROL_CHARS` pe `id`, conform §3 din brief.

Nu am putut scrie un test care să demonstreze un `400` real din `CONTROL_CHARS` cu un byte de control autentic: am verificat că `new URL(req.url, 'http://localhost')` (folosit de `server.js` înainte de a citi `pathname`) percent-encodează orice byte C0 de control (`\x00`-`\x1f`) în forma lui `%XX` — face parte din „path percent-encode set" al standardului URL — indiferent ce ajunge efectiv pe fir (am luat în calcul și un socket brut, nu doar `fetch`/`http.request`, care oricum validează și aruncă `ERR_UNESCAPED_CHARACTERS` înaintea trimiterii, cum nota deja raportul RF-02b inițial). Concluzia: `CONTROL_CHARS.test(id)` de la `server.js:265` e, cu arhitectura actuală (`id` extras din `pathname`), cod mort — inaccesibil prin orice cerere HTTP reală. E o suspiciune de bug/cod neatins pe care o semnalez, nu am corectat-o (nu am voie să ating `server.js`).

### Testul de deschidere lazy — ce am schimbat

Am importat `buildAllowedOrigins` din `../server/http-guards.js` și am înlocuit `s.setAllowedOrigins(new Set([...]))` cu `s.setAllowedOrigins(buildAllowedOrigins(port))`, exact forma `{ hosts: Set, origins: Set }` pe care o cere `checkOrigin`, la fel ca în `startServer(...)`. N-am schimbat nimic din scopul testului (fișierul bazei nu apare până la prima cerere reală pe `/api/profiles`).

### Comanda exactă de rulare

```powershell
node --test test/server-profiles.test.mjs
```

sau tot lotul:

```powershell
node --test test/profiles.test.mjs test/server-profiles.test.mjs
```
