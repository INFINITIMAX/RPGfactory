# T-01 — Randare Canvas 2D pentru agenți (placeholder, fără sprite-uri încă)

## Sarcină

Înlocuiește `public/index.html` (acum doar un `<pre>` cu JSON brut) cu o pagină care desenează fiecare agent din `/api/agents` ca un cerc colorat pe un `<canvas>`, poziționat pe o grilă fixă, plus un panou de detalii la click.

## Context

`server.js` expune deja `GET /api/agents`, care întoarce un array de obiecte:
```json
[{ "pid": 55740, "sessionId": "a8f17...", "name": "lucian-pc-83", "cwd": "C:\\...", "status": "busy", "kind": "interactive", "updatedAt": 1789135380623, "alive": true }]
```
Nu modifica acest contract — `server.js` nu se atinge.

Navele/sprite-urile finale nu sunt alese încă (proiectul a trecut recent de la temă medievală la temă spațială — pachete CC0 "Void" de la Foozle, în `assets/raw/`, neintegrate încă). Deocamdată desenăm **placeholder-e simple** (cercuri colorate), nu sprite-uri.

## Rezultat așteptat

Trei fișiere noi/înlocuite în `public/`:
- `public/index.html` — doar structura (canvas + container pentru panoul de detalii), fără CSS/JS inline
- `public/style.css` — stiluri
- `public/app.js` — toată logica

### Comportament exact

1. **Poll**: `fetch('/api/agents')` la fiecare 3 secunde (păstrează intervalul actual din codul vechi).
2. **Poziționare stabilă pe grilă** — regula cea mai importantă: poziția unui agent pe grilă trebuie derivată dintr-un **hash al `sessionId`-ului lui**, nu din poziția lui în array-ul primit de la server. Motivul: dacă ordinea agenților se schimbă între două poll-uri (un agent nou apare, altul dispare), un agent existent nu trebuie să sară în alt loc pe ecran — asta a fost o lecție explicită luată din bot-crossing (layout stabil > layout recalculat pur din date curente).
   - Grilă fixă: ex. 8 coloane, celule de 80×80px, offset de 40px față de margine.
   - Hash simplu pe string (ex. sumă de coduri de caractere mod număr_total_celule) e suficient — nu trebuie ceva criptografic.
3. **Desen**: pentru fiecare agent viu (`alive: true`), un cerc de rază ~28px, culoare după `status`:
   - `busy` → accent (ex. `#2A5FAE`)
   - orice alt status (necunoscut încă — logează ce vezi în consolă, nu presupune un enum fix) → gri neutru (`#888`)
   - Numele agentului (`name`) scris sub cerc, font mic.
4. **Click** pe un cerc îl selectează (contur mai gros) și afișează sub canvas un panou cu: `name`, `status`, `pid`, `cwd`, `updatedAt` (formatat ca oră locală, nu epoch brut).
5. **Fără `requestAnimationFrame`** — nu există nimic de animat încă. Redesenează canvas-ul doar când vin date noi de la poll sau când se schimbă selecția. Nu adăuga o buclă de randare continuă doar „ca să fie gata pentru animații" — o adăugăm când chiar avem ceva de animat.

## Constrângeri dure

- Nu adăuga npm dependencies — Canvas 2D e API nativ din browser.
- Nu atinge `server.js`, `package.json`, `.env*`, `.gitignore`, `assets/`.
- Nu integra sprite-uri sau culori/forme legate de temă (navă, rang) — asta vine într-un task separat, după ce alegem sprite-urile.
- Cod simplu, comentat unde logica nu e evidentă (ex. de ce hash-ul, nu index-ul) — proprietarul proiectului citește tot codul linie cu linie și vrea să înțeleagă fiecare decizie.

## Ce NU are voie să atingă

`server.js`, `package.json`, `.env`, `.env.example`, `.gitignore`, `README.md`, `assets/`.

## Predare

Scrie rezultatul în `docs/handoff/T-01-coder-raport.md`: ce fișiere ai schimbat, orice decizie mică pe care ai luat-o fără să fie specificată explicit aici (ex. formatul exact al hash-ului), și cum se testează manual (ce comandă, ce ar trebui să vadă cineva în browser).
