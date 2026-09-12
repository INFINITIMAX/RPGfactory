# T-03 — Raport tester

## Fișier creat

`test/api-open.test.mjs`

## Abordare aleasă (varianta 1 din brief)

`server.js` nu exportă nimic testabil izolat — pornește direct `http.createServer(...).listen(PORT)` la `require`. Am pornit serverul REAL pe portul `5391` (diferit de `5311`, ca să nu intre în conflict cu instanța lui Lucian), setând `process.env.PORT = '5391'` înainte de `require('../server.js')`.

Ca să pot închide serverul la final (`after`), am interceptat temporar `http.createServer` DOAR cât a durat `require`-ul, ca să captez instanța reală întoarsă (server.js o apelează o singură dată). Am restaurat imediat originalul după require — nu am înlocuit nicio logică, doar am ținut o referință la rezultat, în același spirit cu monkey-patch-ul de `fs` din `test/rank.test.mjs`.

Cererile către server se fac cu `fetch` nativ, fără mock-uri de rutare.

## Ce testează fiecare test

1. **`sessionId` valid → 200 `{ok:true}`** — ar cădea dacă endpoint-ul ar întoarce alt status/body, sau dacă ar arunca pentru un sessionId valid.
2. **body JSON invalid → 400 `{ok:false,error:'invalid JSON'}`** — verifică mesajul EXACT din cod (nu presupun). Ar cădea dacă parsarea ar arunca necaptat (regresia ERR_HTTP_HEADERS_SENT) sau dacă mesajul de eroare s-ar schimba.
3. **`{}` fără `sessionId` → 400 `{ok:false,error:'missing sessionId'}`** — ar cădea dacă validarea ar lipsi sau ar accepta `undefined`.
4. **`sessionId: ''` → 400** — confirmă că string gol e tratat explicit ca invalid (nu doar `undefined`/lipsă). Ar cădea dacă codul ar verifica doar `data.sessionId === undefined` fără `!data.sessionId`.
5. **`sessionId: 123` (număr) → 400** — confirmă `typeof data.sessionId !== 'string'`. Ar cădea dacă validarea ar accepta orice valoare truthy, indiferent de tip.
6. **server rămâne funcțional după body stricat** — trimite un POST cu JSON invalid, apoi face `GET /api/agents` și verifică `200` + array JSON. Ar cădea dacă handler-ul de `/api/open` ar crăpa procesul sau ar corupe starea serverului (exact regresia de la T-01).
7. Comentariu, nu test: documentez explicit că NU verific dacă `rundll32`/`claude://` chiar rulează — nedeterminist, depinde de instalarea locală, brief-ul interzice mock fals pentru asta.

## Ce NU am acoperit și de ce

- Nu verific efectul real al `rundll32 url.dll,FileProtocolHandler` (pornirea Claude Code) — vezi punctul 7, motivat în brief.
- Nu testez concurența (două POST-uri simultane) — nu era cerut, și `req.on('data'/'end')` per-cerere e izolat per socket, risc scăzut.
- Nu testez `Content-Type` lipsă sau alt content-type la request — server.js nu verifică header-ul, doar citește body-ul brut; testarea separată n-ar adăuga acoperire reală.
- Nu am testat cazul „body complet gol” (`''`) ca test separat — e echivalent cu cazul 2 (JSON.parse('') aruncă), acoperit conceptual de comentariul din test 6 unde trimit un body stricat oricum.

## Suspiciuni de bug

Niciuna găsită — comportamentul din `server.js` (liniile 74-100) corespunde exact cu ce descrie raportul coder-ului și cu ce cere brief-ul.

## Comanda exactă pentru planner

```powershell
node --test test/api-open.test.mjs
```

sau, pentru toată suita de teste a proiectului:

```powershell
node --test
```
