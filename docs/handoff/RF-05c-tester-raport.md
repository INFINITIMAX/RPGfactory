## Ce am testat

- **`test/world.test.mjs`** (extins, nu duplicat — fișierul exista deja de la RF-05b cu `groupProjects`/`pickAccent`):
  - `profilesByProject`: §2.1.1 (null/gol excluse), §2.1.2 (ordine păstrată, nu resortată), §2.1.3 (grupuri separate), plus listă goală.
  - `assignSlots`: §4 (slot 0 pentru profil nou), §5 (sloturi consecutive în ordinea din `profileIds`), §6 (memorie — post anterior valid păstrat exact), §7 (profil dispărut eliberează slotul), §8 (post vechi peste capacitate — realocat sub capacity, și exclus dacă nu mai încape nimeni), §9 (capacitate exactă), §10 (overflow, fără excepție), §11 (capacitate 0, fără excepție), §12 (fără coliziuni, caz mixt memorie+noi+overflow), plus listă goală.
- **`test/slot-store.test.mjs`** (fișier nou, tipar identic cu `test/layout.test.mjs`):
  - §13 (`getSlots()` pe bază proaspătă), §14 (round-trip `saveSlots`/`getSlots`), §15 (profil dispărut din assignment → șters), §16 (izolare între proiecte — scriere pe A nu atinge B), §17 (`saveSlots(project, new Map())` golește proiectul fără eroare), §18 (fără efecte secundare la construcție — fișierul nu apare pe disc până la primul apel real).
  - Am adăugat și un test de `revision` (crește la a doua scriere pe același profil, verificat SQL direct pe fișier real, nu `:memory:`) — nu era numerotat explicit în brief, dar e simetric cu testul echivalent din `layout.test.mjs` și acoperă un rând din comentariul codului (`revision` monoton).
- **`test/server-world.test.mjs`** (extins, nu am creat fișier paralel):
  - §19 (pawn fără run → `working: false`), §20 (run `running` → `working: true`), §21 (run `queued` și, separat, `paused` → ambele `working: false`, testate distinct cum cerea brief-ul), §22 (toate câmpurile pawn-ului, inclusiv `sizeFactor === 1` exact), §23 (persistență `slotIndex` între două cereri succesive), §24 (profil fără `last_project` → absent din `pawns`), §25 (`POST`/`DELETE` → 405, fără mutație pe `pawns` — am verificat suplimentar că pawn-ul existent rămâne `deepEqual` înainte/după POST respins; testul `DELETE` deja exista în fișier de la RF-05b și nu l-am duplicat).

## Ce NU am testat și de ce

- Desenul/animația din `public/world.js` (canvas, `requestAnimationFrame`, `prefers-reduced-motion`, pulsația `Math.sin`) — nu pot rula un browser real din acest rol; un test cu mock-uri DOM pe `requestAnimationFrame`/`matchMedia` ar fi teatru, nu dovadă (brief §3, explicit). Coder-ul a semnalat că funcțiile respective rămân închise în IIFE, deci nu sunt nici măcar extrase separat pentru testare unitară — confirm limitarea, nu am cerut extragerea (nu e rolul meu să modific `public/world.js`).
- Geometria de desen (`hexToWorld`, `slotsForCell`, conversia `slotIndex` în pixeli) — deja acoperită la RF-05b, neschimbată aici, doar consumată de pawn-uri.

## Defecte reale găsite

Niciunul. Am citit atent `assignSlots` (pasul 1 cu garda `!takenSlots.has(prevSlot)`, pasul 2 cu căutare crescătoare `nextFree`) și `saveSlots` (DELETE pe `profile_id` — corect, pentru că schema are `profile_id TEXT PRIMARY KEY`, deci un profil nu poate fi simultan pe două proiecte, coerent cu `ON CONFLICT(profile_id)`). Nu am găsit un caz de graniță din brief care să producă un rezultat greșit în cod. Testele scrise ar pica toate dacă implementarea ar fi modificată corespunzător (verificat mental linie cu linie pentru fiecare, nu doar sintactic).

## Decizii pe care le-am luat singur

- Am adăugat un test de `revision` pentru `slot-store.js` (nenumerotat explicit în §2.3, dar simetric cu `layout.test.mjs` §4) — motivat de comentariul din cod despre contorul monoton, util pentru audit.
- La §2.4.19, am ales să verific `pawn.working === false` fără să presupun altă proprietate implicită (ex. nu am verificat `slotIndex` specific acolo, pentru că nu era determinist fără alte profiluri în același proiect în acel test izolat).
- La §2.4.25 am extins testul POST 405 existent din RF-05b cu o verificare suplimentară pe `pawns` (deepEqual înainte/după), în loc să scriu un test complet separat — evită duplicarea structurii de request deja acoperite.
- Nu am creat un fișier `test/server-world.test.mjs` paralel — am extins cel existent, cum cerea explicit brief-ul (§5).

## Contradicții găsite în brief

Niciuna.

## Comanda pe care planner-ul trebuie să o ruleze

Conform `AGENTS.md` — până la RF-01, `node --test` rulează DOAR în copie izolată, cu opener substituit (fișierele de test deja fac asta prin `opener: () => {}` injectat în `startServer`). Comanda sugerată, din rădăcina proiectului (sau a copiei izolate):

```powershell
node --test test/world.test.mjs test/slot-store.test.mjs test/server-world.test.mjs
```

Sau, pentru toată suita (recomandat, ca să nu rămână o regresie ascunsă în altă parte):

```powershell
node --test
```
