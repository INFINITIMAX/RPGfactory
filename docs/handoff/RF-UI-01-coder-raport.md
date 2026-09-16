# RF-UI-01 — raport coder

Data: 16-09-2026, EET

## Fișiere schimbate

- `public/index.html`
- `public/hud.css`
- `public/hud.js`
- `public/world.js`
- `docs/handoff/RF-UI-01-coder-raport.md`

## Decizii de layout și interacțiune

- Am înlocuit coloana de conținut și inspectorul fix cu o masă de comandă: bara superioară, hartă pe tot spațiul rămas și rail operațional de `320–380px` în dreapta.
- La viewport îngust, harta ocupă `55dvh`, iar rail-ul curge dedesubt; lățimile sunt limitate la viewport.
- Rail-ul arată numai rezumate derivabile din datele existente: profiluri, sesiuni, sesiuni `running`, sesiuni neasociate și proiecte distincte din `last_project`.
- Inspectorul înlocuiește conținutul rail-ului și are control explicit de închidere.
- Am mărit geometria hărții și sprite-urile, am eliminat terenul circular, am făcut canvas-ul să ocupe containerul și am adăugat potrivire automată, zoom, reset și pan cu pointerul.
- Selecția profilului circulă HUD → hartă prin `rpg:profile-selected`, iar pawn → HUD prin `rpg:world-profile-select`; ambele folosesc același inspector de profil.
- Rândurile au activare Enter/Space și focus vizibil. Canvas-ul are rol, nume, descriere și o listă DOM alternativă actualizată din pawn-ii reali.
- Harta expune stări distincte loading, empty, ready și eroare/stale, fără a elimina ultimul instantaneu valid la o eroare de polling.

## Contracte și siguranță DOM

- Am păstrat rutele și formele cererilor pentru creare, aprobare, eligibilitate, asociere, dezasociere și polling.
- Am păstrat funcțiile și structura de bază folosite de sandboxul existent; toate elementele UI suplimentare din `hud.js` sunt obținute opțional, astfel încât lipsa lor din fake DOM să nu arunce.
- Datele externe sunt scrise numai prin `textContent`, `createTextNode`, `fillText` sau `strokeText`; nu am folosit `innerHTML`.
- Polling-ul rămâne single-flight și păstrează protecția cu request token.
- `public/world.js` rămâne într-un IIFE și nu modifică exporturile modulului Node `world.js` din rădăcină.
- Nu am modificat backend-ul, jocul legacy, testele, documentele de guvernanță sau asset-urile.

## Riscuri și limitări

- Layout-ul, hit-testing-ul pawn-ilor și comportamentul exact la `1440×1000` / `390×844` necesită verificare în browser real de către planner.
- Compatibilitatea cu testele existente a fost păstrată intenționat, dar nu este confirmată prin execuție.
- Randarea completă depinde în continuare de sprite-urile Tiny Swords locale; fallback-ul procedural acoperă pawn-ii înainte de încărcare, nu și clădirea.
- Starea de eroare a hărții indică explicit un instantaneu posibil stale, însă API-ul actual nu furnizează timestamp de prospețime pentru o vârstă exactă.

## Confirmare

Nu am rulat nicio comandă și nu am rulat teste. Conform rolului de coder, verificarea executabilă și probele în browser rămân la planner.
