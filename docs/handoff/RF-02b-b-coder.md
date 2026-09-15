# RF-02b-b — brief coder: `close()` al serverului nu închide baza de profiluri

**Data:** 15-09-2026, EET.
**Rol:** coder. **Nu rulezi comenzi. Nu scrii teste.**
**Context:** corecție în cadrul lotului RF-02b, găsită de testele tester-ului.

> **Precedență:** `instructiuni.md` are prioritate peste tot din proiect.

---

## 1. Ce s-a întâmplat

Un test al tester-ului (verificare de deschidere lazy, cu server real) a eșuat la curățenie, nu la aserțiune:

```
Error: EPERM, Permission denied: ...\Temp\rf02b-db-mcCKGx
    at Object.rmSync (node:fs:1283:18)
    ... after() ...
```

Cauza: `after()` face `await srv.close()`, apoi încearcă să șteargă directorul temporar care conține fișierul bazei de date. Pe Windows, un fișier cu handle deschis nu poate fi șters — exact lecția de la RF-02a (defectul 1, unde baza rămânea deschisă la o pornire eșuată). Aici problema e la un nivel mai sus: **`profilesStore` deschide un handle SQLite memoizat (persistent între cereri), dar nimic din `server.js` nu-l închide vreodată când serverul se oprește.**

Verificat de planner, direct în `server.js`:

```js
// startServer(...)
return {
  server,
  address,
  port: address.port,
  close: () => new Promise((res) => server.close(() => res())),   // <-- închide DOAR HTTP-ul
};
```

`server.close()` oprește doar ascultarea pe port. `profilesStore` (cu handle-ul lui SQLite lazy-deschis) e o variabilă locală în closure-ul lui `createServer(...)` — nu există nicio cale să-l închizi din afară.

## 2. Ce trebuie

`profilesStore.close()` trebuie apelat când serverul se oprește. Alege o cale curată — două variante posibile, alege una și motiveaz-o:

- Atașează `profilesStore.close` pe obiectul `server` întors de `createServer(...)`, la fel cum se face deja cu `server.setAllowedOrigins` (linia ~267 din fișierul actual) — ex. `server.closeProfilesStore = profilesStore.close;` — și fă ca `close()` din `startServer(...)` să cheme și el, înainte sau după `server.close()`.
- Sau: extinde `close()` din `startServer(...)` să facă ambele, într-un singur loc.

**Nu schimba comportamentul dacă `profilesStore` nu a deschis niciodată baza** (lazy — dacă nicio cerere n-a atins `/api/profiles*`, `close()` intern al lui `profilesStore` nu trebuie să deschidă baza doar ca s-o închidă la loc; verifică în `profiles.js` — funcția `close()` de acolo deja face `if (dbHandle) { dbHandle.close(); dbHandle = null; }`, deci apelarea ei necondiționată e sigură oricum, nu are nevoie de altă protecție).

**Ordinea contează puțin, dar documenteaz-o**: închide baza înainte sau după oprirea HTTP-ului — dacă o cerere e în curs când se cere `close()`, decide (sau lasă comportamentul implicit al `http.Server#close()`, care oricum așteaptă cererile active înainte să cheme callback-ul) și spune în raport ce ai ales.

## 3. Fișiere

**Poți modifica:** `server.js`.

**NU atinge:** `profiles.js`, `db.js`, `migrations/**`, `state.js`, `body.js`, `server/http-guards.js`, `status.js`, `rank.js`, `public/**`, `test/**`, `package.json`, documentele de coordonare.

## 4. Raportul

Adaugă `## RF-02b-b` la finalul `docs/handoff/RF-02b-coder-raport.md`:

```
### Ce am schimbat
### De ce am ales ordinea asta (înainte/după oprirea HTTP)
### Confirmare: close() e sigur de apelat chiar dacă profilesStore n-a deschis niciodată baza
```

## 5. Constrângeri

- Nu rulezi comenzi. Nu scrii teste. Română.
