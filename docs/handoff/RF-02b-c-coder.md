# RF-02b-c — brief coder: `close()` trebuie să închidă baza pentru ORICE apelant, nu doar prin `startServer()`

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Context:** a doua corecție în lotul RF-02b, pe același subiect ca RF-02b-b.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Ce s-a întâmplat

Fix-ul de la RF-02b-b a rezolvat problema **doar pe calea `startServer(...)`** — acolo, `close()` întors face acum și `server.closeProfilesStore()`.

Dar există un test legitim (verificarea deschiderii lazy — trebuie să inspecteze starea INAINTE de `listen()`, deci nu poate folosi `startServer()`, care combină construcția cu pornirea) care folosește `createServer(...)` direct, cu `.listen()`/`.close()` apelate manual pe obiectul brut `http.Server`. Pe acea cale, `server.closeProfilesStore` există ca proprietate atașată, dar **nimeni nu-l cheamă** — `.close()` e metoda nativă Node, care nu știe nimic despre ea.

Rulare completă a suitei (planner, `npm test`): **370 teste, 369 trec, 1 pică**, exact acolo:

```
test\server-profiles.test.mjs:367
Error: EPERM, Permission denied: ...\rf02b-lazy-db-zoxTZ1
    at Object.rmSync ... at server-profiles.test.mjs:400 (finally, după s.close(resolve))
```

**Concluzia planner-ului**: reparația de la RF-02b-b e corectă, dar incompletă ca design — cere ca FIECARE apelant care oprește serverul să-și amintească să cheme și `closeProfilesStore()` separat. E o convenție ușor de uitat (exact ce s-a și întâmplat, la o zi distanță). Un test viitor, sau cod real care pornește serverul altfel decât prin `startServer()`, ar reintroduce aceeași scurgere.

## 2. Ce trebuie

Fă închiderea automată, indiferent cine cheamă `.close()`. Nu conta pe convenție.

**Abordare recomandată**: în `createServer(...)`, imediat după ce `server` există (lângă `server.setAllowedOrigins = ...` și `server.closeProfilesStore = ...`), înfășoară metoda nativă `close`:

```js
const nativeClose = server.close.bind(server);
server.close = (callback) => {
  nativeClose(() => {
    profilesStore.close();
    if (callback) callback();
  });
};
```

Acum ORICE apelant al lui `server.close(...)` — direct, sau prin wrapper-ul din `startServer(...)` — închide și baza de profiluri, automat. Verifică dacă `startServer(...)` mai are nevoie de `.then(() => server.closeProfilesStore())` explicit (RF-02b-b) — probabil NU mai are, ar deveni redundant (dublă închidere; verifică dacă `profiles.js`'s `close()` tolerează apelare dublă — citește `if (dbHandle) { dbHandle.close(); dbHandle = null; }`, e deja idempotent, deci dublarea nu ar strica nimic, dar elimină codul redundant dacă poți, ca să nu fie două locuri care fac același lucru).

Păstrează `server.closeProfilesStore` atașat (nu-l șterge) — poate fi util pentru un apelant care vrea explicit doar baza, fără să oprească HTTP-ul.

**Verifică `http.Server#close(callback)` cu atenție**: metoda nativă poate primi `callback` opțional și se comportă diferit dacă serverul nu ascultă încă (aruncă sincron `ERR_SERVER_NOT_RUNNING` dacă nu a fost pornit niciodată) — asigură-te că wrapper-ul tău nu schimbă acest comportament pentru cazul în care cineva cheamă `close()` fără să fi apelat vreodată `listen()`.

## 3. Fișiere

**Poți modifica:** `server.js`.

**NU atinge:** `profiles.js`, `db.js`, `migrations/**`, `state.js`, `body.js`, `server/http-guards.js`, `status.js`, `rank.js`, `public/**`, `test/**`, `package.json`, documentele de coordonare.

## 4. Raportul

Adaugă `## RF-02b-c` la finalul `docs/handoff/RF-02b-coder-raport.md`:

```
### Ce am schimbat
### Ce am făcut cu duplicarea din startServer (păstrat/eliminat, de ce)
### Comportamentul lui close() dacă serverul n-a ascultat niciodată
```

## 5. Constrângeri

- Nu rulezi comenzi. Nu scrii teste. Română.
