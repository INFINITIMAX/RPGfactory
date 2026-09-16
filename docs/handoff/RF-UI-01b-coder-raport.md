# RF-UI-01b — raport coder

Data: 16-09-2026, EET

## Fișiere schimbate

- `public/index.html`
- `public/hud.css`
- `public/hud.js`
- `public/world.js`
- `docs/handoff/RF-UI-01b-coder-raport.md`

## Cele cinci corecții

### 1. Selecție profil → run coerentă

`selectRun` caută acum run-ul și emite `rpg:profile-selected` cu `run.profile_id` când există. Pentru un run neasociat emite explicit `null`. Astfel, inspectorul poate indica run-ul, iar harta indică numai profilul asociat lui sau nu indică niciun pawn; evidențierea profilului selectat anterior nu mai rămâne agățată.

### 2. Alternativa DOM a Canvas-ului este vizibilă la focus

Lista pawn-ilor păstrează comportamentul screen-reader-only în repaus, dar clasa `canvas-alternative` devine un panou vizibil, poziționat peste hartă, prin `:focus-within`. Panoul are fundal opac, limită, scroll și outline de focus de 3 px. Focusul unui buton evidențiază temporar același pawn pe hartă; blur-ul elimină evidențierea temporară. Controlul focusat nu mai rămâne tăiat într-o zonă de 1×1 px.

### 3. Acțiuni pending fără dublare

Am introdus o blocare per cheie de acțiune, nu un lock global. Aprobare, schimbare eligibilitate, asociere, dezasociere și creare profil:

- refuză o a doua expediere identică cât prima este pending;
- setează `aria-busy="true"` pe inspector sau formular;
- dezactivează butonul declanșator;
- afișează un mesaj scurt de progres;
- reactivează controlul și elimină `aria-busy` în `finally`;
- păstrează mesajul real de eroare dacă cererea eșuează.

Semnăturile funcțiilor rămân compatibile cu apelurile existente din fake DOM: parametrul controlului declanșator este opțional.

### 4. Indicatorul conexiunii păstrează punctul vizual

Span-ul textual are acum ID separat, `connection-label`. `setConnectionState` actualizează numai acel nod în browser, fără să rescrie containerul și fără să elimine `.connection-dot`. Dacă nodul nou lipsește din sandboxul minimal, funcția folosește defensiv vechiul fallback pe container.

### 5. Etichete fără aglomerare permanentă

Numele pawn-ilor nu se mai desenează permanent în funcție de zoom. Ele apar numai pentru pawn-ul selectat, pawn-ul aflat sub pointer sau pawn-ul corespondent unui buton alternativ focalizat. Etichetele proiectelor rămân permanente, iar lumea și sprite-urile nu au fost micșorate. Am adăugat hit-testing reutilizabil pentru hover și am păstrat identitatea completă în lista DOM alternativă.

## Contracte păstrate

- Nicio rută sau formă de request nu a fost schimbată.
- Nu s-au introdus date fictive, dependențe sau `innerHTML`.
- Elementele DOM noi sunt accesate defensiv pentru fake DOM.
- Nu am modificat backend-ul, DB-ul, API-ul, testele, jocul legacy, asset-urile sau documentele de guvernanță.

## Limitări și riscuri

- Stările pending, tranziția run → hartă, hover-ul și overlay-ul focusat trebuie confirmate de planner prin teste și browser real.
- Etichetele contextuale reduc suprapunerea permanentă; cazurile geometrice extreme la zoom/pan necesită verificare vizuală.
- Verificarea pointer pozitiv/negativ și pan-versus-click aparține tester-ului, deoarece brief-ul interzice modificarea testelor.

## Confirmare

Nu am rulat nicio comandă și nu am rulat teste.
