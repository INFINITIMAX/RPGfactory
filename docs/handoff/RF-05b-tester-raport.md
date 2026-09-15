## Ce am testat

Trei fișiere noi, fără atingere la codul de producție:

- `test/layout.test.mjs` — §2.1, punctele 1–6:
  1. `getLayout()` pe bază proaspătă → `Map` goală, nu aruncă.
  2. `saveLayout()`→`getLayout()` round-trip exact, inclusiv ordinea celulelor în array (index 0 = rădăcina).
  3. `saveLayout()` fără un proiect prezent anterior → rândul e șters (verificat prin `getLayout()`, nu mai apare deloc).
  4. Două `saveLayout()` succesive pe același proiect → `revision` crește la 2 — verificat cu interogare SQL directă, pe **fișier real** (nu `:memory:`, care e izolat per conexiune și nu ar fi permis o a doua deschidere prin `openDatabase` separat).
  5. `createLayoutStore(...)` fără niciun apel → nu creează fișierul/directorul pe disc (lazy); prima operație reală (`getLayout()`) chiar îl creează — același tipar ca testul de lazy din `profiles.test.mjs`.
  6. `close()` apelat fără nicio metodă anterioară → nu aruncă; și un al doilea `close()` (idempotent) → nu aruncă.

- `test/world.test.mjs` — §2.2, punctele 7–12:
  7. `last_project: null` → exclus.
  8. `last_project: ''` (string gol) → exclus separat, testat distinct de `null` (riscul semnalat explicit de coder).
  9. Egalitate de mărime → ordine alfabetică după `id`.
  10. Mărime diferită → proiectul mai mare apare primul.
  11. `pickAccent` — același `project`, 20 de apeluri repetate → aceeași culoare de fiecare dată.
  12. `pickAccent` — formatul `^#[0-9a-f]{6}$` pe 50 de proiecte sintetice (nu presupun paleta exactă), plus un test suplimentar că apar mai multe culori distincte pe un eșantion mare (nu întoarce mereu aceeași constantă — altfel testul de format ar trece și pentru o implementare degenerată `return '#000000'`).
  - Am adăugat și un test pentru `groupProjects([])` → array gol, nu aruncă (margine evidentă, nu era numerotat explicit dar e ieftin de acoperit).

- `test/server-world.test.mjs` — §2.3, punctele 13–18, prin `startServer` real, port efemer, ca `test/server-profiles.test.mjs`:
  13. Server fără profiluri → `200`, `{ zones: [] }`.
  14. Profiluri cu `last_project` populat (creare prin `POST /api/profiles` + `PATCH .../{id}` cu `changes: { last_project }`, exact fluxul public existent) → fiecare proiect distinct o singură dată, fiecare zonă cu `project`/`cells` (nevid)/`accent`.
  15. Două cereri succesive fără schimbări → celule identice per proiect (dovadă de persistență reală, nu recalculare).
  16. Profil nou cu proiect nou între cereri → celulele proiectelor deja existente rămân neschimbate.
  17. `POST`/`DELETE /api/world` → `405`, și verificare explicită că lista de proiecte din `zones` nu s-a schimbat după `POST`-ul respins (fără mutație).
  18. Origin: `GET` fără header `Origin` → `200` (navigare normală, simetric cu `GET /api/agents` din `test/server.test.mjs`); `GET` cu `Origin` prezent dar greșit (alt port) → `403` (simetric cu testul unitar `checkOrigin` din `test/http-guards.test.mjs` și cu tiparul `D3` din `test/server.test.mjs`).

## Ce NU am testat și de ce

- **Randarea din `public/world.js`** (Canvas, poziții de pixeli, desen) — nu pot rula un browser real din acest rol; un test DOM/canvas mockuit n-ar dovedi nimic despre randarea vizuală reală (ar fi teatru, conform §3 din brief). Las verificarea vizuală planner-ului, într-un browser real, pe o instanță izolată.
- **`hex-layout.js`/`allocateCells`** — deja acoperit complet la RF-05a, nu l-am retestat (conform §3).
- Nu am testat geometria exactă a hexagoanelor pe ecran — nu e logică server.

## Defecte reale găsite (dacă vreunul)

Niciunul. Codul (`layout.js`, `world.js`, ruta `/api/world` din `server.js`) se comportă conform brief-ului pe toate cele 18 puncte obligatorii, inclusiv cazul `last_project: ''` semnalat de coder (exclus corect de `if (!project) continue`).

## Decizii pe care le-am luat singur

- Pentru punctul 4 (`revision` crește), am folosit un fișier temporar real în loc de `:memory:`, pentru că verificarea SQL directă separată de `layout.js` are nevoie de un al doilea handle către aceleași date; `:memory:` e izolat per conexiune SQLite și nu ar fi permis asta.
- Am adăugat un test suplimentar pentru `groupProjects([])` (nu era numerotat explicit în brief) — margine evidentă și ieftină de acoperit.
- Pentru punctul 12 (`pickAccent`), am ales să verific formatul hex (`^#[0-9a-f]{6}$`) în loc să extrag paleta exactă, așa cum brief-ul permitea explicit ambele variante; am adăugat un test separat că apar mai multe culori distincte pe un eșantion de 30 de proiecte, ca testul de format să nu treacă și pentru o implementare degenerată care întoarce mereu aceeași culoare.
- Pentru punctul 18, am ales exact perechea de teste simetrică deja prezentă în suită pentru rute `GET`: `GET /api/agents fără Origin -> 200` (din `test/server.test.mjs`) și testul unitar `checkOrigin: GET cu Origin prezent dar greșit, Host corect -> respins` (din `test/http-guards.test.mjs`), adaptate ca test HTTP de integrare pentru `/api/world`. Nu am dus mai departe cazul Host greșit (D3 complet), fiindcă e deja acoperit exhaustiv de `test/server.test.mjs` pentru mecanismul general `checkOrigin`, iar brief-ul cerea doar un test simetric, nu re-acoperirea completă a mecanismului.

## Contradicții găsite în brief

Niciuna.

## Comanda pe care planner-ul trebuie să o ruleze

Conform notei de siguranță din `AGENTS.md` (baseline-ul actual are teste nesigure pentru datele active până la RF-01), rulați suita nouă izolat, nu direct în checkout-ul activ dacă acesta e cel folosit de o instanță reală a serverului. Presupunând copie izolată/sigură de test, ca restul suitei:

```
node --test test/layout.test.mjs test/world.test.mjs test/server-world.test.mjs
```

sau, alături de restul suitei existente:

```
node --test test/
```
