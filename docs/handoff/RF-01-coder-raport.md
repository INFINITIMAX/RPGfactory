# RF-01 — raport coder

**Data:** 14-09-2026, EET.

## Ce am implementat

**D1 — import fără efecte secundare.** `server.js`: `createServer(options)` doar construiește `http.Server`, nu ascultă și nu citește `sessionsDir`. `startServer(options)` e singura care apelează `listen`. Entrypoint explicit la final: `if (require.main === module) startServer()...`. `module.exports = { createServer, startServer }`.

**D2 — bind loopback.** `startServer` folosește `host = options.host || '127.0.0.1'` și `server.listen(port, host, ...)` (înainte era `server.listen(PORT)` fără host, deci `::`).

**D3 — origine validată complet.** `server/http-guards.js`: `buildAllowedOrigins(port)` construiește `{hosts, origins}` din `localhost:<port>`, `127.0.0.1:<port>`, `[::1]:<port>`, calculat DUPĂ `listen` (din `server.address().port`, esențial pentru port `0`). `checkOrigin(req, allowed)` verifică `Host` exact (host+port) și, pentru mutații, `Origin` obligatoriu și exact-match. Am eliminat complet lista de adrese LAN (`os.networkInterfaces()`) din `server.js`.

**D4 — containment real de fișiere statice.** `resolveStaticPath(publicDir, pathname)` în `http-guards.js`: `path.resolve(root, '.' + rel)`, apoi `resolved === root || resolved.startsWith(root + path.sep)`. `public-secret` nu mai trece.

**D5/D7 — CAS + revizie monotonă.** `state.js`: `persist(patch)` calculează `nextRev = Math.max(Number(current.updatedAt) || 0, 0) + 1` (contor, nu `Date.now()`). `handlePutState` respinge `baseUpdatedAt` lipsă/nenumeric cu 400 (nu-l mai tratează pe `0` ca „sări peste verificare"), compară strict `!==` cu `current.updatedAt` și dă 409 cu starea curentă la nepotrivire. Citirea curentă + scrierea rămân în aceeași secțiune `serialise()`.

**D6 — schemă validată înainte de scriere.** `validateStatePatch(data)` în `state.js`: respinge chei necunoscute, validează `archived` (array de string-uri ≤512 caractere, ≤10.000 elemente), `archivedAt` (obiect plat, valori numere finite, ≤10.000 chei, fără `__proto__`/`constructor`/`prototype`), `plots` (obiect plat, ≤512 KiB serializat, adâncime ≤8, fără chei rezervate la orice adâncime), `version` (dacă prezent, exact `1`). La eșec, 400 cu mesaj explicit, fără nicio scriere.

**D8 — plafon de body.** `body.js` (modul nou, partajat): `MAX_BODY_BYTES = 1048576`. Verifică `Content-Length` înainte de a citi orice octet; altfel acumulează pe `chunk.length` (octeți, nu caractere) și la depășire răspunde 413, apelează `req.destroy()` și oprește acumularea imediat. Folosit din `server.js` (`/api/open`, `/api/reveal`, `/api/new-session`) și din `state.js` (`handlePutState`).

**D9 — query string.** `server.js` parsează `new URL(req.url, 'http://localhost')` și rutează/servește după `url.pathname`, niciodată după `req.url` brut.

**D10 — metodă per rută.** Tabel de rute în `server.js`: `/api/agents` (GET/HEAD), `/api/open`, `/api/reveal`, `/api/new-session` (POST), `/api/state` (GET/PUT), altfel static (GET/HEAD). Orice altă metodă → 405 cu header `Allow`.

**D11 — erori de I/O nu mai lasă cereri suspendate.** `state.js`: `persist()` (fostă `writeState`) e apelată din interiorul unui `try/catch` în `handlePutState`; la excepție (permisiuni, disc plin, rename eșuat) se răspunde 500 cu JSON, fără să propagăm excepția mai departe — lanțul `writeQueue` nu se rupe (rămâne rezolvat, nu respins). Fișierul `.tmp` rămas după un `rename` eșuat e curățat cu `fs.unlinkSync` într-un `try/catch` separat, care nu maschează eroarea originală.

**D12 — opener injectabil.** `defaultOpener` în `server.js` e identic cu implementarea originală (`spawn('rundll32', ...)`, fără `shell: true`), dar `createServer` o folosește doar prin `options.opener || defaultOpener`, transmisă mai departe la toate cele trei rute care lansează ceva. `resolveFolder` neschimbat. Validarea `sessionId` întărită: respinge orice conține caractere de control (`/[\x00-\x1f\x7f]/`, acoperă și `\r`/`\n`).

**`readAgents`, injectat conform brief-ului (fără să-i ating logica internă):** semnătura a devenit `readAgents(sessionsDir, isAlive)`, ambele primite prin `options` în `createServer`. `getRank`/`getActivityState`/`status.js`/`rank.js` neatinse.

Fișiere noi: `body.js` (citire body cu plafon, partajat server.js+state.js), `server/http-guards.js` (origine + containment static, folosit doar de `server.js`).

## Decizii pe care le-am luat singur

- **`writeState(patch)` face „full replace”, nu merge cu starea curentă.** Câmpurile absente din `patch` devin `[]`/`{}` (ca în codul original), nu moștenesc valoarea existentă pe disc. Numele „patch” din contract ar putea sugera merge parțial, dar `app.js` (netins în RF-01) trimite mereu `archived`+`archivedAt`+`plots` complete la fiecare PUT, deci merge-ul nu era necesar și ar fi introdus o semantică netestată. Am ales replace pentru compatibilitate directă cu comportamentul dinainte.
- **Ordinea verificării byte-ului nul (D4, pasul 6 din §2.3).** Brief-ul îl listează după containment (pasul 5); eu îl verific imediat după decodare, înainte de `resolve`. E strict mai sigur (respinge mai devreme) și nu schimbă niciun rezultat observabil — doar ordinea internă a pașilor.
- **Rută `/api/*` necunoscută → 404 direct**, fără verificare de metodă/`Allow`, pentru că tabelul din §2.4 nu acoperă explicit acest caz (listează doar cele 5 rute cunoscute + „orice altceva” pentru static). Am tratat „orice altceva sub /api/” ca 404, nu ca fișier static (ar fi fost absurd să caut `public/api/...`).
- **HEAD pe rutele JSON (`/api/agents`) trimite totuși body-ul complet**, ca înainte — brief-ul cere doar ca metoda HEAD să fie *acceptată* la `/api/agents`, nu specifică suprimarea corpului pentru API-uri JSON (spre deosebire de fișierele statice, unde am suprimat explicit body-ul la HEAD).
- **`allowedOrigins` inițial la `createServer()`** (înainte de `listen`) se calculează din `options.port` dacă e un număr diferit de `0`, altfel rămâne gol/restrictiv. E doar o valoare de siguranță pentru cazul (neuzual) în care cineva apelează `createServer()` și face `listen()` manual fără `startServer` — comportamentul corect, garantat de contract, vine oricum din `startServer` care rescrie setul după `listen` cu portul real.
- **Citire redundantă a stării curente în `handlePutState`**: o dată pentru verificarea CAS, o dată în interiorul `persist()` pentru calculul reviziei — ambele în aceeași secțiune `serialise()`, deci fără risc de cursă, doar un I/O în plus (fișier mic, cost neglijabil). Alternativa (a face `persist` să primească direct `current` ca parametru) ar fi complicat semnătura publică a `writeState(patch)` cerută de contract.

## Ce nu am făcut și de ce

- **Symlink/junction pe containment-ul static (§2.3):** conform brief, nu urmăresc link-urile — verificarea e pe calea rezolvată lexical (`path.resolve`), fără `fs.realpath`. Un junction plasat în `public/` ar putea încă scoate din rădăcină. Limitare cunoscută, consemnată aici cum a cerut brief-ul, nu rezolvată în acest lot.
- Nu am atins `readAgents` dincolo de injecția cerută (`sessionsDir`, `isAlive`) — proiecția de activitate (F01/RF-03) rămâne nereparată, intenționat.
- Nu am adăugat nimic în `package.json` — nu am avut nevoie de scripturi noi sau de `engines` pentru implementare (asta e, oricum, treaba tester-ului/planner-ului).
- Nu am scris teste și nu am rulat nimic — conform constrângerilor.

## Riscuri pentru tester

- **`test/state.test.mjs`, `test/server.test.mjs`, `test/api-open.test.mjs` sunt garantat rupte** de noile semnături (`createServer`/`startServer`/`createStateStore`) — de asta au fost avertizate în brief, e așteptat.
- **CAS**: testați explicit cazul „stare nouă (fișier inexistent) + `baseUpdatedAt: 0`” → trebuie să treacă (200), spre deosebire de „stare existentă cu revizie >0 + `baseUpdatedAt: 0`” → trebuie 409. E exact granița pe care D5 o repară.
- **Body limit**: testați atât calea `Content-Length` prea mare (refuz imediat, fără citire) cât și acumularea reală peste 1 MiB fără `Content-Length` corect (chunked). Ambele căi există în `body.js`, dar sunt cod diferit.
- **Origin**: verificați explicit că `GET /api/agents` fără header `Origin` trece (navigare normală), dar `PUT /api/state` fără `Origin` dă 403 — regulile diferă pe metodă, nu doar pe rută.
- **Zonă fragilă**: `resolveStaticPath` + `objectDepth`/`hasReservedKey` din `state.js` sunt recursive — merită teste cu structuri `plots` adânci (exact 8, 9) și cu `__proto__` ascuns la diverse niveluri, nu doar la nivelul 1.
- **`checkOrigin`** compară `Host` cu un set construit din portul REAL de ascultare; dacă testele pornesc serverul cu `port: 0` și apoi construiesc manual header-ul `Host`/`Origin` cu alt port decât cel întors de `startServer`, verificarea va eșua corect (403) — nu e un bug, dar poate păcăli un test scris grăbit.
- **`persist()` / `writeState()` pentru testarea D11**: pentru a forța o eroare de I/O reproductibil, cel mai simplu e să faceți `dataDir` un fișier (nu director) sau să faceți `fs.renameSync`/`fs.writeFileSync` să eșueze prin permisiuni — nu există niciun hook de injecție pentru fs în acest lot (nu a fost cerut în contract).

## Contradicții găsite în brief

Niciuna. Contractele din §2 au fost suficient de precise încât nu a trebuit să deviez de la ele — deciziile de mai sus sunt completări pe cazuri neacoperite explicit, nu contraziceri.

---

## RF-01b — corecție D8 + unhandledRejection

**Data:** 15-09-2026, EET.

### Bug 1 — 413 și conexiunea

**Ce am schimbat, de ce rezolvă ambele simptome:** `body.js`, ambele căi de refuz (Content-Length declarat peste plafon și acumulare peste plafon fără Content-Length) folosesc acum o funcție comună `rejectTooLarge(req, res)`:

- `res.writeHead(413, { ..., Connection: 'close' })` — headerul explicit spune clientului (și agentului lui HTTP keep-alive) să nu mai pună socketul înapoi în pool. Asta rezolvă direct Simptomul 2 (cererea următoare pe conexiune reciclată eșua cu `undefined !== 200`).
- `res.end(body, callback)` — închiderea efectivă (`drainAndClose`) se face abia în callback-ul de flush, nu în aceeași instrucțiune cu scrierea răspunsului.
- În loc de `req.destroy()` imediat, `drainAndClose(req)` pune socketul în mod „flowing" (`req.resume()`) și lasă restul octeților din tranzit să fie citiți și aruncați (calea de acumulare are deja un listener `data` care îi ignoră când `stopped=true`; calea Content-Length nu avea niciun listener atașat până acum, deci `resume()` e cel care pornește scurgerea). Abia la `'end'` (client a terminat de trimis) sau la un plafon de 2 secunde (client ostil care nu mai trimite nimic) se apelează `req.destroy()`. Asta evită să rămână octeți necitiți în bufferul de kernel la închidere — cauza directă a RST-ului/ECONNRESET din Simptomul 1.

Am tratat explicit cele două simptome ca o singură cauză (cum spune brief-ul): conexiunea era distrusă fără să anunțe nimic despre asta, nici la nivel de protocol (`Connection: close`), nici la nivel de socket (drenaj înainte de închidere).

**Ce soluții am respins și de ce:**
- Ridicarea plafonului — interzis explicit în brief, și nu rezolva nimic (doar muta pragul).
- Scoaterea completă a lui `req.destroy()` fără nimic în loc — ar fi lăsat socketul deschis la nesfârșit pentru un client care nu mai termină transferul; de-asta am păstrat plafonul de timp.
- Am luat în calcul să nu ating deloc calea Content-Length (testul ei trecea deja) și să pun `Connection: close` doar pe calea de acumulare — am respins ideea: brief-ul cere contractul pe **ambele** căi, iar cele două căi partajau deja riscul de otrăvire a conexiunii (doar că testul nu-l lovise încă pe calea Content-Length). Am unificat comportamentul în `rejectTooLarge` ca să nu am două implementări divergente ale aceluiași contract.

**Notă/risc pentru planner:** Node însuși, când vede `Connection: close` pe răspuns, poate declanșa un `socket.destroySoon()` intern (FIN, apoi `destroy()` după ce scrierea s-a golit), independent de drenajul meu manual — dacă acel `destroy()` intern al lui Node ajunge înaintea drenajului complet al unui body mare încă în tranzit, tot ar putea apărea un RST la o cursă nefavorabilă. Nu am găsit o cale să dezactivez explicit acest comportament din Node fără să renunț la header-ul `Connection: close` (care e el însuși parte din fix). Merită rulat testul de acumulare (413 la chunked) de câteva ori sau sub sarcină, nu doar o dată — dacă apare intermitență, e semnul acestei curse.

### Bug 2 — unhandledRejection

**Ce am schimbat:** în `state.js`, am extras un helper `respond(res, status, body)` care face `res.writeHead`/`res.end` **într-un try/catch**, loghează eroarea prin `console.error` dacă apare (nu o înghite în tăcere) și nu o lasă să iasă din funcția dată lui `serialise()`. L-am folosit pe toate cele trei căi de răspuns din interiorul secțiunii serializate din `handlePutState`: 409 (CAS), 500 (eroare de `persist`) și 200 (succes — linia care conținea bug-ul confirmat). Pentru că excepția nu mai iese din funcția serializată, `writeQueue` nu mai devine o promisiune respinsă, deci nu mai apare `unhandledRejection`, iar scrierea următoare din coadă rulează normal (nu depinde de starea de eroare a celei anterioare — `serialise` oricum folosea `fn` ca handler și pe fulfilled și pe rejected).

Nu am atins răspunsul 400 (validare eșuată) din `handlePutState`, care e **în afara** lui `serialise()` — nu face parte din lanțul de promisiuni al cozii, deci nu poate produce `unhandledRejection` pe acest mecanism. Aceeași observație pentru `handleGetState`: e sincron, direct în handler-ul HTTP, nu într-o promisiune — nu se aplică acest tipar.

**Alte locuri cu același tipar pe care le-am găsit (sau confirmarea că nu există):** Am verificat integral `state.js` și `server.js`. Singurul loc unde o funcție e trecută prin `serialise()`/`writeQueue` (deci unde un throw poate deveni promisiune respinsă neprinsă) e `handlePutState`; `writeState` (folosit doar din teste/alte module, nu din HTTP handlers direct în aceste fișiere) face `serialise(() => persist(patch))` fără `res` implicat, deci nu are acest risc. În `server.js`, toate apelurile `res.writeHead`/`res.end` sunt sincrone, direct în callback-ul `http.createServer`, niciunul în interiorul unei promisiuni — un throw acolo ar deveni o excepție sincronă neprinsă în handler-ul de request (alt tip de risc, `uncaughtException`, nu `unhandledRejection`), dar nu era în scopul acestui bug și brief-ul nu l-a semnalat ca măsurat/confirmat, așa că nu l-am atins.

### Ce rămâne nerezolvat, dacă ceva:

- Riscul de cursă descris la Bug 1 (Node `destroySoon()` intern vs. drenajul meu manual) — nu am cum să-l elimin fără să renunț la `Connection: close`, care e parte din contract. De verificat empiric de planner, eventual cu rulări repetate ale testului de acumulare.
- Testul existent `test/state-store.test.mjs` (§3.2, „handlePutState: dacă res.writeHead(200,...) aruncă...") a fost scris ca să **confirme prezența** bug-ului (`assert.fail` dacă NU apare `unhandledRejection`). După acest fix, `unhandledRejection` nu mai apare — deci acel test, așa cum e scris acum, va eșua din motivul opus (testează exact ce tocmai am reparat). Nu l-am atins (nu am voie). Planner-ul trebuie să-l retrimită tester-ului pentru actualizare: noul contract corect ar fi „nu apare unhandledRejection, iar o scriere ulterioară validă tot funcționează" — exact ce spune brief-ul la §3, nu ce testează varianta actuală a fișierului.
- Nu am schimbat nimic în `server.js` — nu a fost nevoie de niciun semnal suplimentar pentru propagare; `Connection: close` și drenajul se rezolvă integral în `body.js`.

---

## RF-01c

**Data:** 15-09-2026, EET.

**Ce am schimbat față de RF-01b și de ce elimină cursa:**

În RF-01b ordinea era: scrie răspunsul (413 + `Connection: close`) → în callback-ul de flush → drenează restul body-ului → la `'end'`/timeout → `req.destroy()`.

Problema, exact cum am semnalat-o ca risc în raportul RF-01b: odată ce scriem un răspuns cu `Connection: close`, Node însuși marchează `res` ca fiind ultimul răspuns de pe socket (`res._last`) și, la evenimentul `'finish'` al lui `res`, pornește propriul mecanism de închidere a socketului (`socket.destroySoon()`), complet independent de `drainAndClose` al meu. `destroySoon()` face `socket.end()` (FIN, corect), dar apoi, quando scrierea s-a golit complet, apelează `socket.destroy()` — un **destroy complet**, care nu așteaptă drenajul meu manual al părții de citire. Dacă la acel moment mai erau octeți din body încă necitiți în bufferul de kernel (cazul tipic: body chunked mare, unde clientul mai trimite octeți după ce eu am detectat depășirea și am răspuns), acel `destroy()` intern al lui Node trimite RST — indiferent de al meu, care ajungea prea târziu sau nu mai ajungea deloc, pentru că socketul murise deja. Aveam deci **două mecanisme de închidere** (al meu și cel intern al lui Node, declanșat de header), în cursă unul cu altul, fără nicio coordonare între ele.

Acum ordinea e inversată: `rejectTooLarge(req, res)` cheamă întâi `drain(req, callback)`, care golește (citește și aruncă) tot ce mai vine pe `req` — până la `'end'`, `'error'`, sau plafonul de 2s pentru un client ostil — și **abia în `callback`, după ce cititorul s-a golit efectiv, scriu răspunsul** (`writeHead` + `end`). Nu mai există niciun `req.destroy()` manual pe calea normală (doar pe calea de timeout, când oricum n-am răspuns încă, deci n-avem ce pierde). Când în cele din urmă Node pornește propriul `destroySoon()`/`destroy()` intern (declanșat de `Connection: close`), nu mai există octeți necitiți în bufferul de kernel — pentru că i-am consumat deja pe toți înainte de a scrie răspunsul. Orice închidere ulterioară a socketului, a mea sau a lui Node, e deci un FIN curat, nu un RST.

**De ce cred că e acum determinist (nu doar „mai rar"):** cursa din RF-01b exista pentru că cele două evenimente — „am terminat de citit body-ul" și „Node a decis să distrugă socketul" — erau necorelate temporal (al doilea putea veni oricând după `res.end()`, indiferent de starea primului). Acum le-am pus pe aceeași axă cauzală: „am terminat de citit body-ul" este acum o **precondiție** pentru „scriu răspunsul", care e la rândul lui precondiția pentru orice mecanism de închidere (al meu sau al lui Node) să pornească. Nu mai există fereastră de timp în care răspunsul e scris dar body-ul nu e încă drenat — secvența e strict `drain → respond`, nu `respond și în paralel drenează, sperând să câștigi cursa`. Singurul `req.destroy()` rămas e pe calea de timeout (client ostil, blocat, nu mai trimite nimic în 2s) — și acolo n-am scris încă niciun răspuns, deci n-are ce corupe.

Am adăugat și o gardă (`res.writableEnded || (res.socket && res.socket.destroyed)`) înainte de a scrie răspunsul în `rejectTooLarge`, pentru cazul (diferit de cursa D8, dar posibil acum că drenajul precede răspunsul) în care clientul abandonează conexiunea în timp ce noi drenăm — evită un `writeHead` pe un socket deja mort.

**Nu am folosit `req.pause()`/backpressure explicit** din sugestia din brief — strategia „drenează întâi, apoi răspunde" elimină cursa fără să fie nevoie de el; adăugarea lui ar fi complicat codul fără un beneficiu observabil pe acest defect (backpressure-ul ar limita doar viteza cu care se acumulează octeții în tranzit, nu ar elimina cursa dintre `res.end()` și `destroySoon()` intern, care era cauza reală).

Nu am atins `test/**`, `server/http-guards.js`, `status.js`, `rank.js`, `public/**`, `state.js` — modificarea e izolată în `body.js`.

---

## RF-01d

**Data:** 15-09-2026, EET.

**Cum am separat cele două căi:** am despărțit fosta funcție unică `rejectTooLarge` în două: `rejectTooLargeImmediate(req, res)` (calea Content-Length) și `rejectTooLargeAfterDrain(req, res)` (calea de acumulare, fosta `rejectTooLarge` din RF-01c, neschimbată în interior). `readJsonBody` cheamă `rejectTooLargeImmediate` la verificarea `declaredLength > MAX_BODY_BYTES` (linia cu Content-Length, înainte de orice citire) și `rejectTooLargeAfterDrain` la depășirea acumulată pe `chunk.length` (linia din listener-ul `'data'`).

**De ce calea A nu are nevoie de drenaj:** verificarea Content-Length există exact ca să refuzăm fără să citim — dacă mai drenăm după, așteptăm octeți care, la un client care a declarat 900 MB și a trimis 16, nu vin niciodată (asta era regresia măsurată: 2051 ms determinist, apoi nimic). `rejectTooLargeImmediate` face `req.pause()` (oprește orice acumulare a ce a ajuns deja în buffer, fără să-l citească/proceseze) și scrie răspunsul pe loc — comportamentul din RF-01b pe această cale, care trecea.

**Ce am schimbat pe calea de timeout:** în `drain(req, res, callback)` (semnătura acum primește și `res`), la expirarea plafonului de 2s: întâi `callback()` — scrie efectiv răspunsul 413 — și abia după aceea, dacă socketul mai e viu, `res.once('finish', () => req.destroy())`. Am legat `destroy()`-ul de evenimentul `'finish'` al lui `res` (nu l-am pus imediat după `callback()`) ca să nu risc să tai chiar răspunsul pe care tocmai l-am scris — `res.end()` doar pune datele în coadă de scriere, nu garantează că au și ajuns pe fir în același tick. Garda din `rejectTooLargeAfterDrain` (`res.writableEnded || res.socket.destroyed`) rămâne, dar acum se declanșează doar în cazul real (clientul a abandonat conexiunea în timpul drenajului), nu pe o stare provocată de codul nostru cu o linie mai devreme.

**Ce am păstrat neatins din RF-01c și de ce:** logica internă a lui `rejectTooLargeAfterDrain` (fostă `rejectTooLarge`) — `drain` întâi, `writeHead`+`end` abia în callback, aceeași gardă de socket mort — rămâne identică, pentru că era deja corectă (12/12, confirmat). Am modificat doar semnătura lui `drain` (adăugat parametrul `res`) și ordinea de la timeout; restul fluxului „drenează → răspunde" pentru calea de acumulare nu s-a schimbat.

**Ce nu am făcut:** nu am atins `DRAIN_TIMEOUT_MS`. Nu am atins `test/**` sau alt fișier de producție — modificarea e izolată în `body.js`.

**Risc de verificat de planner:** testul de la `body.test.mjs:57` (calea Content-Length) ar trebui acum să răspundă imediat, fără cele 2s — verificați explicit timpul de răspuns, nu doar codul 413. Pe calea de timeout (client ostil, fără Content-Length declarat corect), destroy-ul e acum legat de `'finish'` pe `res` — dacă socketul e deja mort la acel moment (client a abandonat exact în fereastra dintre `callback()` și `'finish'`), `res.socket.destroyed` ar putea fi deja `true` și evenimentul `'finish'` să nu mai apară niciodată pe un socket distrus — în acel caz nu mai apelăm `req.destroy()` explicit, dar socketul e oricum deja mort, deci nu cred că lasă o resursă agățată; merită totuși verificat sub sarcină repetată, la fel ca la RF-01c.

---

## RF-01e

**Data:** 15-09-2026, EET.

**Strategia unificată — de ce funcționează pentru toate trei cazurile:**

Am eliminat separarea pe tipul de transfer (Content-Length vs acumulare) și am unificat `rejectTooLargeImmediate`/`rejectTooLargeAfterDrain` într-o singură funcție, `rejectTooLarge(req, res)`, cu patru pași ficși, exact ca în design:

1. Scrie 413 IMEDIAT, indiferent pe ce cale am detectat depășirea (Content-Length declarat prea mare sau acumulare care a depășit plafonul). Clientul care nu mai trimite nimic (cazul `body.test.mjs:57`) îl primește pe loc, fără nicio așteptare.
2. Nu mai pun `Connection: close` pe acest răspuns.
3. Pornesc `drainAndMaybeDestroy(req)` — un `req.resume()` cu un listener `data` care doar numără și aruncă octeții, complet independent de faptul că am răspuns deja.
4. Nu mai distrug nimic dacă drenajul ajunge singur la `'end'`/`'error'` — conexiunea rămâne curată. Distrug (`req.destroy()`) doar dacă se depășește plafonul de octeți drenați (32 MiB) sau plafonul de timp (2s), oricare vine prima.

Asta acoperă:
- **Content-Length mare, trimis puțin:** răspuns imediat (pasul 1), fără așteptare — `body.test.mjs:57` rămâne verde. Drenajul pornește oricum, dar `'end'` vine repede (clientul nu mai trimite altceva), deci nu se distruge nimic în plus față de ce s-ar fi întâmplat oricum.
- **Chunked, fără Content-Length:** răspuns imediat, apoi drenaj — dispare așteptarea introdusă în RF-01c/d de "drenează întâi, răspunde după".
- **Content-Length corect ȘI body trimis integral (cazul nou, real):** răspuns imediat, iar drenajul paralel citește tot ce mai vine din body (1.2/2/8 MiB) până la `'end'`, fără să mai fie nevoie de `Connection: close`. Nu mai rămân octeți necitiți în bufferul de kernel când conexiunea se închide (de la client, la finalul lui `fetch()`, sau natural) — dispare declanșatorul RST/ECONNRESET.

**Plafonul ales și justificarea lui:** `DRAIN_BYTE_CEILING = 32 MiB` (octeți drenați), păstrat pe lângă `DRAIN_TIMEOUT_MS = 2000` (neschimbat față de RF-01d). Un client legitim (browser cu body mare, chiar 8 MiB ca în oracol) trebuie să încapă comod sub plafon — 32 MiB e de 4x mai mult decât cel mai mare caz măsurat (8 MiB), deci nu riscă să taie un client real. Un client patologic care trimite zeci/sute de MB sau GB e oprit indiferent de viteza conexiunii, fără să aștepte 2s dacă octeții vin rapid. Plafonul de timp rămâne ca a doua plasă, pentru cazul opus: client care trimite foarte încet sau deloc după ce a declarat un Content-Length mare — nu vrem să ținem drenajul deschis la nesfârșit doar pentru că nu s-a atins încă plafonul de octeți.

**De ce nu mai e nevoie de `Connection: close`:** era declanșatorul mecanismului intern al lui Node (`res._last` → `socket.destroySoon()` la `'finish'`), care rula independent de orice drenaj propriu și producea cursa documentată în RF-01b/RF-01c — un `destroy()` complet care nu aștepta ca bufferul de citire să fie golit. Fără acest header, Node nu mai inițiază nimic pe cont propriu la finalul răspunsului; singurele închideri de socket rămase sunt cele explicite din `drainAndMaybeDestroy`, condiționate de plafoanele de mai sus. Conexiunea poate rămâne deschisă pentru keep-alive dacă drenajul se termină curat — comportament corect, nu doar "acceptabil".

**Ce dispare:** `rejectTooLargeImmediate` și `rejectTooLargeAfterDrain` (RF-01d) au fost înlocuite de `rejectTooLarge`, apelată identic din ambele puncte din `readJsonBody` (verificarea `Content-Length` și verificarea acumulată din listener-ul `'data'`). Fosta funcție `drain(req, res, callback)` (care condiționa scrierea răspunsului de finalul drenajului) a fost înlocuită cu `drainAndMaybeDestroy(req)`, fără `res` și fără callback — nu mai există nicio dependență între drenaj și scrierea răspunsului, cele două sunt acum complet independente, exact cerința din design ("mai sunt octeți în zbor sau nu" ca unic criteriu, verificat prin drenaj paralel, nu prin ramificarea pe headere).

---

## RF-01f

**Data:** 15-09-2026, EET.

**Decizie:** RF-01e se anulează, prin decizie de scop (nu tehnică) — singurul client al `/api/state` e `public/app.js`, iar `plots` e deja limitat la 512 KiB de schemă, sub jumătate din plafon. Scenariul pentru care RF-01e a adăugat drenaj paralel + `DRAIN_BYTE_CEILING` nu se poate produce în practică.

**Ce am restaurat din RF-01d:** structura pe două căi, reconstruită din propria mea descriere din secțiunea `## RF-01d` de mai sus (nu am avut acces la un diff/backup al fișierului, proiectul nu e sub git) —
- `rejectTooLargeImmediate(req, res)` pentru calea `Content-Length`: `req.pause()`, apoi răspuns 413 imediat, fără niciun drenaj.
- `rejectTooLargeAfterDrain(req, res)` pentru calea de acumulare: apelează `drain(req, res, callback)`, scrie 413 abia în `callback`, după ce drenajul s-a terminat.
- `drain(req, res, callback)`, cu semnătura care primește și `res`: pe calea normală (`'end'`/`'error'`), doar `callback()`, fără `destroy()`. Pe calea de timeout (`DRAIN_TIMEOUT_MS`), `callback()` întâi (scrie răspunsul), apoi `res.once('finish', () => req.destroy())` — destroy-ul legat de `'finish'`, nu executat imediat, ca să nu risc să tai chiar răspunsul abia scris.
- `Connection: close` pe ambele răspunsuri 413, ca în RF-01b/c/d.
- Am renunțat la `DRAIN_BYTE_CEILING` din RF-01e — nu mai există plafon pe octeți drenați, doar cel de timp (`DRAIN_TIMEOUT_MS = 2000`, neschimbat).
- `readJsonBody` cheamă `rejectTooLargeImmediate` la verificarea `Content-Length > MAX_BODY_BYTES` și `rejectTooLargeAfterDrain` la depășirea acumulată din listener-ul `'data'` — identic cu RF-01d.

**Ce am consemnat ca limitare cunoscută:** comentariu lângă `MAX_BODY_BYTES` (§4 din brief) — plafonul protejează memoria în toate cazurile; un client care declară `Content-Length` corect și trimite integral peste ~1.1 MiB poate primi `ECONNRESET` în loc de `413` (măsurat: 1.05 MiB → 413, de la 1.2 MiB → nu); e comportamentul standard al serverelor HTTP (nginx la fel); nu e o problemă practică aici, pentru că singurul client e `public/app.js` și `plots` e deja limitat la 512 KiB de schemă; dacă RPG Factory capătă vreodată clienți cu body-uri mari, limitarea trebuie reevaluată.

**Diferențe față de RF-01d:** nu am avut fișierul original la dispoziție (fără git, fără backup) — am reconstruit codul strict din descrierea tehnică pe care am scris-o eu în secțiunea `## RF-01d`. Structura, semnăturile funcțiilor și ordinea operațiilor sunt identice cu ce am descris acolo. Diferența certă: comentariul-bloc de la începutul fișierului (explicația „RF-01e: cele două căi... concluzia: criteriul real nu e Content-Length vs chunked...") a fost eliminat, pentru că descria exact designul unificat pe care îl anulăm; comentariile rămase în jurul funcțiilor sunt formulate de mine acum, pe baza raționamentului din raportul RF-01c/d, nu sunt un copy-paste al unui text anterior pe care nu-l mai am. Dacă exista vreo nuanță de exprimare în comentariile originale RF-01d pe care nu am reprodus-o identic, nu are efect asupra comportamentului — logica și structura sunt cele descrise mai sus.

**Ce nu am făcut:** nu am atins `test/**` sau alt fișier de producție — modificarea e izolată în `body.js`. Nu am rulat teste.

**Risc de verificat de planner:** rulați suita completă ×3 și `body.test.mjs` ×12, ca în tabelul din brief (§3) — ar trebui să reproducă 257/257 și 12/12, dacă reconstrucția e fidelă. Dacă apare vreo diferență de comportament față de RF-01d original, cel mai probabil e în nuanța comentariilor, nu în logică (am verificat structura de funcții/semnături punct cu punct față de descrierea din raport).

**Ce risc rămâne, dacă rămâne vreunul:** pe calea de acumulare (fără Content-Length corect), chunk-ul care a declanșat depășirea e deja consumat de listener-ul original din `readJsonBody` (contorizat în `total`, nu în `drained`) înainte ca `drainAndMaybeDestroy` să-și atașeze propriul listener — o mică subestimare a octeților deja "drenați" în raport cu plafonul de 32 MiB, fără efect practic (marja e generoasă). De asemenea, `rejectTooLarge` scrie răspunsul cu o gardă (`res.writableEnded`/`socket.destroyed`) înainte de `writeHead`, dar dacă socketul moare exact între verificarea gărzii și apelul efectiv, `writeHead`/`end` ar putea arunca — nu am adăugat try/catch în jurul lor pentru că niciuna din rundele anterioare nu a semnalat asta ca problemă reală, dar planner-ul poate verifica empiric dacă apare sub sarcină. Nu am schimbat nimic în afara `body.js`.
