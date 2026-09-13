// Teste pentru logica din public/app.js (T-01, extins la T-04/T-07).
//
// app.js este un script clasic (nu modul), fără `export`-uri, care la
// încărcare face imediat `document.getElementById(...)`, înregistrează un
// listener de click și pornește un poll (`fetch` + `setInterval`). Nu poate
// fi `require`/`import`-at direct în Node fără `document`/`fetch` globale.
//
// Ca să testăm codul REAL (nu o reimplementare a lui), îl încărcăm cu
// `node:vm` într-un context sandbox unde `document`, `fetch`, `setInterval`,
// `setTimeout` sunt simulate minimal (doar cât să nu arunce la încărcare /
// click). Funcțiile declarate cu `function` la nivel de script
// (hashToCellIndex, cellIndexToPosition, colorForActivity, draw,
// renderDetails, tick, hideAgent, unhideAgent, queueSave, saveState,
// initState) devin proprietăți ale obiectului global din sandbox și pot fi
// apelate direct. Variabilele `let`/`const` (agents, selectedSessionId,
// state, baseUpdatedAt, baseSnapshot, GRID_COLS, ...) NU devin proprietăți
// globale — de-asta starea internă e controlată exclusiv prin `tick()` /
// `hideAgent()` / `unhideAgent()` + mock de `fetch`, iar efectele lor sunt
// verificate INDIRECT: prin ce desenează `draw()` (spy-uri pe canvas), prin
// ce randează `renderDetails()`/`renderHiddenList()` (innerHTML) și prin
// corpul cererilor `PUT /api/state` capturate de mock-ul de `fetch`.
//
// T-07: app.js are acum nevoie de `mergeState` (global, încărcat separat din
// public/merge-state.js printr-un <script> distinct în index.html — nu prin
// require/import). Îl încărcăm cu vm.runInContext în ACELAȘI context, ÎNAINTE
// de app.js, la fel cum s-ar întâmpla prin ordinea reală a <script>-urilor.
//
// T-07: bootstrap-ul de la coada fișierului e acum
// `initState().then(() => { tick(); setInterval(tick, ...); })` — adică
// primul `tick()` rulează abia după ce `/api/state` a fost încărcat, asincron.
// `loadApp()` a devenit deci o funcție ASYNC: după `vm.runInContext`, așteaptă
// un flush de microtask-uri (`await new Promise(r => setImmediate(r))`)
// înainte să întoarcă handle-ul de test, ca acel lanț inițial să se fi
// terminat. Toate testele (inclusiv cele vechi, sincrone înainte) fac acum
// `await loadApp()`.
//
// T-10: app.js folosește acum `allocateCells` din public/zones.js (global,
// încărcat separat printr-un <script> distinct în index.html, la fel ca
// merge-state.js). Îl încărcăm cu vm.runInContext în ACELAȘI context, ÎNAINTE
// de app.js — altfel orice tick() (deci orice test care apelează
// setAgents()/tick()) ar arunca `ReferenceError: allocateCells is not
// defined`. Fiindcă `allocateCells`, `cellForAgent`, `zoneCellToPixels`,
// `computeAgentPositions`, `colorForProject`, `drawZones` sunt toate
// declarate cu `function` la nivel de script, devin proprietăți ale
// obiectului global din sandbox, exact ca hashToCellIndex/draw/tick — pot fi
// apelate direct din teste ca oracol independent pentru poziții așteptate.
//
// T-12: app.js are acum o cameră 2D (`camera = {x,y,zoom}`, `const` la nivel
// de script — NU devine proprietate globală în sandbox, la fel ca
// `agents`/`state`). `worldToScreen`/`screenToWorld` SUNT accesibile direct
// (declarate cu `function`) și sunt folosite ca sondă indirectă: citesc
// `camera` intern, deci putem deduce zoom/translație din diferența dintre
// două puncte transformate, fără să atingem `camera` direct (vezi
// `getZoom()` mai jos). De asemenea:
//   - canvas.width/height NU mai sunt fixe (720 hardcodat în index.html) —
//     vin din `resizeCanvas()`, care citește `window.innerWidth/innerHeight`.
//     Sandbox-ul nu avea deloc `window` — a trebuit adăugat (vezi fakeWindow
//     mai jos), altfel orice `loadApp()` arunca ReferenceError la încărcare.
//   - hit-test-ul de click NU mai e pe un listener 'click' de pe canvas —
//     s-a mutat în 'mouseup' de pe `window` (pan-ul trebuie să continue chiar
//     dacă mouse-ul e eliberat în afara canvas-ului). Helper-ul `click()`
//     de mai jos simulează acum mousedown+mouseup fără mișcare, nu mai
//     invocă direct un handler 'click' inexistent.
//   - dimensiunea mock-ului de canvas a fost fixată la 720x720 (păstrată
//     identică cu valoarea folosită deja în acest fișier pentru
//     GRID_OFFSET/TEST_SPAWN_POINT etc., ca să minimizăm schimbările în
//     testele T-04/T-07/T-10/T-11 care nu au legătură cu camera).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS_PATH = path.join(__dirname, '..', 'public', 'app.js');
const APP_SOURCE = fs.readFileSync(APP_JS_PATH, 'utf8');
const MERGE_STATE_JS_PATH = path.join(__dirname, '..', 'public', 'merge-state.js');
const MERGE_STATE_SOURCE = fs.readFileSync(MERGE_STATE_JS_PATH, 'utf8');
const ZONES_JS_PATH = path.join(__dirname, '..', 'public', 'zones.js');
const ZONES_SOURCE = fs.readFileSync(ZONES_JS_PATH, 'utf8');

function defaultDiskState() {
  return { version: 1, archived: [], archivedAt: {}, plots: {}, updatedAt: 0 };
}

// T-10: `computeAgentPositions()` din app.js citește poziția unui agent din
// `state.plots[agent.cwd]` (populat REAL de tick()-ul declanșat de
// `setAgents()`, prin allocateCells din zones.js), nu mai dintr-o grilă
// globală. Pentru un singur agent, jitter-ul nu se aplică (grup de 1), deci
// apelând chiar funcția de producție pe care draw()/click-ul o folosesc
// obținem poziția exactă așteptată, fără să reimplementăm algoritmul de
// alocare a zonelor în teste.
// T-12: `computeAgentPositions()` întoarce acum coordonate de LUME (nu mai
// coincid cu pixelii de ecran, de când există `camera`). Poziția de ecran
// pe care o citesc draw()/hit-test-ul de click e `worldToScreen(worldPos)`.
// Convertim aici o singură dată, ca toate testele care foloseau deja acest
// helper (comparând cu drawImage/arc, sau apelând app.click(pos.x,pos.y))
// să primească direct coordonate de ECRAN, consistente cu ce desenează/
// citește app.js — fără să atingă fiecare test individual.
function agentPixelPosition(app, agent) {
  const worldPos = app.sandbox.computeAgentPositions([agent]).get(agent.sessionId);
  assert.ok(
    worldPos,
    `nu am putut calcula poziția așteptată pentru ${agent.sessionId} (state.plots gol pentru cwd-ul lui?)`
  );
  return app.sandbox.worldToScreen(worldPos.x, worldPos.y);
}

async function loadApp(options = {}) {
  const fillTextCalls = [];
  const consoleLogCalls = [];

  // T-04: spy-uri pentru sprite-ul animat — drawImage/arc/strokeRect/fill
  // trebuie observate ca să verificăm CE anume desenează draw(), nu doar
  // că nu aruncă.
  const drawImageCalls = [];
  const arcCalls = [];
  const strokeRectCalls = [];
  const strokeRectStyles = []; // T-13: strokeStyle activ la momentul fiecărui strokeRect (index-corespondent)
  const fillCalls = [];
  // T-10: `drawZones()` cheamă `ctx.fillRect(...)` necondiționat pentru
  // fundalul fiecărei celule de zonă — lipsea din mock (doar strokeRect
  // exista), ceea ce ar fi aruncat `ctx.fillRect is not a function` la orice
  // draw() cu cel puțin un proiect în `state.plots`.
  const fillRectCalls = [];
  const fillRectStyles = []; // T-13: fillStyle activ la momentul fiecărui fillRect (index-corespondent)
  // T-14: jurnal UNIFICAT de apeluri fillRect/drawImage, în ordinea EXACTĂ în
  // care au fost făcute — necesar ca să verificăm ORDINEA de desenare (norii
  // înaintea zonelor), lucru pe care fillRectCalls/drawImageCalls separate
  // (fiecare cu propriul index intern) nu îl pot reda.
  const callOrder = [];

  const fakeCtx = {
    fillStyle: undefined,
    clearRect() {},
    beginPath() {},
    arc(...args) {
      arcCalls.push(args);
    },
    fillRect(...args) {
      fillRectCalls.push(args);
      // T-13: reținem și fillStyle-ul activ în momentul fiecărui fillRect
      // (indice corespunzător în fillRectStyles), ca să putem verifica dacă
      // umplerea a folosit pattern-ul de apă/iarbă sau culoarea plată.
      fillRectStyles.push(fakeCtx.fillStyle);
      callOrder.push({ type: 'fillRect', args });
    },
    fill() {
      // Reținem fillStyle-ul activ în momentul chemării lui fill(), ca să
      // putem verifica ulterior ce culoare a fost folosită la desenarea
      // indicatorului de status (draw() setează fillStyle chiar înainte de
      // fill(), apoi îl schimbă din nou pentru text — dar fillText nu
      // trece prin fill()).
      fillCalls.push({ fillStyle: fakeCtx.fillStyle });
    },
    stroke() {},
    strokeRect(...args) {
      strokeRectCalls.push(args);
      // T-13: reținem strokeStyle-ul activ la fiecare strokeRect (index-
      // corespondent), ca să verificăm că apariția pattern-ului de umplere
      // (fillStyle) nu afectează conturul (strokeStyle rămâne culoarea de
      // proiect din ZONE_PALETTE, ca la T-10).
      strokeRectStyles.push(fakeCtx.strokeStyle);
      // T-15: strokeRect intră și el în jurnalul unificat de ordine — de când
      // drawZones() nu mai desenează niciun fillRect propriu, conturul de
      // zonă e singurul semnal observabil rămas pentru verificarea ordinii
      // turn-vs-zone.
      callOrder.push({ type: 'strokeRect', args });
    },
    drawImage(...args) {
      drawImageCalls.push(args);
      callOrder.push({ type: 'drawImage', args });
    },
    fillText(text, x, y) {
      fillTextCalls.push({ text, x, y });
    },
    // T-13/T-15: fundal de iarbă (apa a fost eliminată la T-15), creat o
    // singură dată la onload ca CanvasPattern. Nu ne interesează randarea
    // reală (nu avem canvas real), doar că apelul nu aruncă — întoarcem un
    // marker simplu.
    createPattern() {
      return { __fakePattern: true };
    },
  };

  // T-12: canvas nu mai are un listener 'click' — vezi comentariul din capul
  // fișierului. Înregistrează 'mousedown' (start pan) și 'wheel' (zoom).
  // Aruncă explicit pe orice tip de eveniment neprevăzut.
  let canvasMouseDownHandler = null;
  let canvasWheelHandler = null;
  const fakeCanvas = {
    width: 720,
    height: 720,
    getContext: () => fakeCtx,
    addEventListener: (type, handler) => {
      if (type === 'mousedown') {
        canvasMouseDownHandler = handler;
        return;
      }
      if (type === 'wheel') {
        canvasWheelHandler = handler;
        return;
      }
      throw new Error(`canvas.addEventListener: eveniment neprevăzut "${type}"`);
    },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };

  // T-12: `window` — folosit de resizeCanvas() (innerWidth/innerHeight), de
  // 'resize', și de 'mousemove'/'mouseup' (înregistrate pe window, nu pe
  // canvas, ca pan-ul să continue chiar dacă mouse-ul iese din canvas).
  // Dimensiune fixată la 720x720, identică cu fakeCanvas de mai sus.
  let windowResizeHandler = null;
  let windowMouseMoveHandler = null;
  let windowMouseUpHandler = null;
  const fakeWindow = {
    innerWidth: 720,
    innerHeight: 720,
    addEventListener: (type, handler) => {
      if (type === 'resize') {
        windowResizeHandler = handler;
        return;
      }
      if (type === 'mousemove') {
        windowMouseMoveHandler = handler;
        return;
      }
      if (type === 'mouseup') {
        windowMouseUpHandler = handler;
        return;
      }
      throw new Error(`window.addEventListener: eveniment neprevăzut "${type}"`);
    },
  };

  const fakeDetails = {
    _classes: new Set(['details', 'hidden']),
    classList: {
      add(c) {
        fakeDetails._classes.add(c);
      },
      remove(c) {
        fakeDetails._classes.delete(c);
      },
    },
    textContent: '',
    innerHTML: '',
  };

  // T-03 adaugă un buton "Open" + un span de eroare în interiorul HTML-ului
  // generat de renderDetails() (ca string, prin innerHTML). Mock-ul nu are
  // un parser DOM real, deci nu "vede" acele elemente apărând singure din
  // innerHTML — le înregistrăm explicit aici, ca app.js să le poată găsi
  // prin document.getElementById(), exact cum ar face-o într-un browser real.
  let openBtnClickHandler = null;
  const fakeOpenBtn = {
    addEventListener: (type, handler) => {
      if (type === 'click') openBtnClickHandler = handler;
    },
  };
  const fakeOpenError = {
    textContent: '',
  };

  // T-07: butonul "Hide" din renderDetails(), la fel de "invizibil" pentru
  // un mock fără parser DOM ca open-btn/open-error mai sus.
  let hideBtnClickHandler = null;
  const fakeHideBtn = {
    addEventListener: (type, handler) => {
      if (type === 'click') hideBtnClickHandler = handler;
    },
  };

  // T-18: butoanele noi "New session"/"Reveal in folder" din renderDetails(),
  // la fel de "invizibile" pentru un mock fără parser DOM ca open-btn/hide-btn
  // de mai sus.
  let newSessionBtnClickHandler = null;
  const fakeNewSessionBtn = {
    addEventListener: (type, handler) => {
      if (type === 'click') newSessionBtnClickHandler = handler;
    },
  };
  let revealBtnClickHandler = null;
  const fakeRevealBtn = {
    addEventListener: (type, handler) => {
      if (type === 'click') revealBtnClickHandler = handler;
    },
  };

  // T-07: butoanele de toggle din renderHiddenList() ("Arată ascunși (N)" /
  // "Ascunde lista (N)"). Id-ul lor există doar în una din cele două ramuri
  // (în funcție de `showHidden`), dar app.js face document.getElementById
  // imediat după ce a setat innerHTML pe hiddenPanelEl — trebuie să existe
  // mock pentru amândouă, indiferent care e activă la un moment dat.
  let showHiddenBtnClickHandler = null;
  const fakeShowHiddenBtn = {
    addEventListener: (type, handler) => {
      if (type === 'click') showHiddenBtnClickHandler = handler;
    },
  };
  let hideHiddenBtnClickHandler = null;
  const fakeHideHiddenBtn = {
    addEventListener: (type, handler) => {
      if (type === 'click') hideHiddenBtnClickHandler = handler;
    },
  };

  // T-07: `#hidden-panel` — app.js îi face doar `.innerHTML = ...` și, când
  // lista e extinsă, `.querySelectorAll('.unhide-btn').forEach(...)`. Fără
  // parser DOM real, simulăm querySelectorAll extrăgând `data-session-id`
  // direct din stringul de innerHTML pe care app.js tocmai l-a scris.
  const unhideClickHandlers = new Map(); // sessionId -> handler
  const fakeHiddenPanel = {
    innerHTML: '',
    querySelectorAll(selector) {
      if (selector !== '.unhide-btn') return [];
      const ids = [...fakeHiddenPanel.innerHTML.matchAll(/data-session-id="([^"]*)"/g)].map((m) => m[1]);
      return ids.map((sessionId) => ({
        dataset: { sessionId },
        addEventListener: (type, handler) => {
          if (type === 'click') unhideClickHandlers.set(sessionId, handler);
        },
      }));
    },
  };

  // T-04: `new Image()` trebuie să întoarcă un obiect a cărui referință o
  // putem prinde din exterior, ca să putem apela manual `onload` (imitând
  // încărcarea reală a sprite-ului) — la fel cum am prins `clickHandler`
  // mai sus. `pawnImage` din app.js e exact obiectul push-uit aici, pentru
  // că app.js face `new Image()` o singură dată, la nivel de script.
  const imageInstances = [];
  function FakeImage() {
    imageInstances.push(this);
  }

  // T-04: app.js pornește DOUĂ setInterval-uri distincte — unul pentru
  // poll (`tick`, la POLL_INTERVAL_MS = 3000ms) și unul pentru animația
  // sprite-ului (la SPRITE_ANIMATION_INTERVAL_MS = 125ms). Le distingem
  // după valoarea `ms` (animația e sub 1 secundă, poll-ul nu), nu după
  // ordinea apelurilor, ca testul să nu depindă de ordinea liniilor din
  // app.js.
  const intervalCallbacks = [];
  function fakeSetInterval(fn, ms) {
    intervalCallbacks.push({ fn, ms });
    return intervalCallbacks.length;
  }

  // T-07: `queueSave()` foloseşte `setTimeout`/`clearTimeout` pentru debounce
  // (500ms). Simulăm timer-ele manual, ca testele să controleze exact când
  // "trece" timpul, în loc să aștepte 500ms reale.
  let nextTimerId = 1;
  const pendingTimers = new Map(); // id -> { fn, ms }
  function fakeSetTimeout(fn, ms) {
    const id = nextTimerId++;
    pendingTimers.set(id, { fn, ms });
    return id;
  }
  function fakeClearTimeout(id) {
    pendingTimers.delete(id);
  }

  // T-07: fetch trebuie să distingă /api/state (GET la pornire, PUT la
  // salvare) de /api/agents (GET la fiecare tick). Stare mutabilă a
  // mock-ului, controlabilă din teste prin helper-ele întoarse mai jos.
  let stateOnDisk = options.initialState || defaultDiskState();
  let agentsOnServer = [];
  let putStateImpl = null; // (body) => ({ ok, status, json }) — dacă null, comportament implicit de succes
  const putCalls = [];

  // T-18: /api/new-session și /api/reveal — implicit succes (200 {ok:true}),
  // configurabile din teste via setNewSessionImpl/setRevealImpl (analog cu
  // setPutStateImpl de mai sus), ca să simulăm eșecul de rețea/răspuns non-ok.
  const newSessionCalls = [];
  const revealCalls = [];
  let newSessionImpl = null; // (body) => ({ ok, status, json }) | arunca pentru eroare de rețea
  let revealImpl = null;

  async function mockFetch(url, options) {
    const method = (options && options.method) || 'GET';
    if (url === '/api/agents' && method === 'GET') {
      return { ok: true, status: 200, json: async () => agentsOnServer };
    }
    if (url === '/api/state' && method === 'GET') {
      return { ok: true, status: 200, json: async () => stateOnDisk };
    }
    if (url === '/api/state' && method === 'PUT') {
      const body = JSON.parse(options.body);
      putCalls.push(body);
      if (putStateImpl) return putStateImpl(body);
      const saved = { version: 1, archived: body.archived, archivedAt: body.archivedAt, updatedAt: Date.now() };
      stateOnDisk = saved;
      return { ok: true, status: 200, json: async () => saved };
    }
    if (url === '/api/new-session' && method === 'POST') {
      const body = JSON.parse(options.body);
      newSessionCalls.push(body);
      if (newSessionImpl) return newSessionImpl(body);
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    if (url === '/api/reveal' && method === 'POST') {
      const body = JSON.parse(options.body);
      revealCalls.push(body);
      if (revealImpl) return revealImpl(body);
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    throw new Error(`fetch mock: cerere neașteptată ${method} ${url}`);
  }

  // T-13: vezi comentariul de la document.createElement mai jos.
  const offscreenCreateCalls = [];
  const offscreenDrawImageCalls = [];

  const sandbox = {
    window: fakeWindow,
    document: {
      getElementById: (id) => {
        if (id === 'canvas') return fakeCanvas;
        if (id === 'details') return fakeDetails;
        if (id === 'hidden-panel') return fakeHiddenPanel;
        if (id === 'open-btn') return fakeOpenBtn;
        if (id === 'open-error') return fakeOpenError;
        if (id === 'hide-btn') return fakeHideBtn;
        if (id === 'new-session-btn') return fakeNewSessionBtn;
        if (id === 'reveal-btn') return fakeRevealBtn;
        if (id === 'show-hidden-btn') return fakeShowHiddenBtn;
        if (id === 'hide-hidden-btn') return fakeHideHiddenBtn;
        throw new Error(`element necunoscut: ${id}`);
      },
      // T-13: canvas-ul offscreen folosit ca să decupăm o singură dată
      // peticul de iarbă din tilemap. Context minimal, separat de fakeCtx
      // (nu vrem ca drawImage-ul de decupare să polueze drawImageCalls,
      // care urmărește doar ce se desenează pe canvas-ul PRINCIPAL).
      // Ținem evidența de câte ori s-a creat un canvas offscreen și cu ce
      // argumente s-a apelat drawImage() pe contextul lui, ca să verificăm
      // din teste decuparea peticului de iarbă (o singură dată, coordonate
      // exacte) fără să atingem randarea vizuală reală.
      createElement: (tag) => {
        if (tag !== 'canvas') throw new Error(`createElement necunoscut: ${tag}`);
        offscreenCreateCalls.push(tag);
        const offscreenCanvas = {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage(...args) {
              offscreenDrawImageCalls.push(args);
            },
          }),
        };
        return offscreenCanvas;
      },
    },
    fetch: (url, options) => mockFetch(url, options),
    setInterval: fakeSetInterval,
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    Image: FakeImage,
    console: { log: (...args) => consoleLogCalls.push(args) },
    Math,
    Date,
    structuredClone,
  };

  vm.createContext(sandbox);
  vm.runInContext(MERGE_STATE_SOURCE, sandbox, { filename: 'merge-state.js' });
  vm.runInContext(ZONES_SOURCE, sandbox, { filename: 'zones.js' });
  vm.runInContext(APP_SOURCE, sandbox, { filename: 'app.js' });

  // T-07: la finalul lui runInContext, `initState().then(() => { tick(); ... })`
  // a fost DECLANȘAT, dar nu neapărat TERMINAT (fetch-ul mock e async).
  // Niciun timer real nu intervine în acel lanț (fetch mock rezolvă direct
  // prin microtask-uri), deci un singur flush către coada de macrotask-uri
  // (setImmediate) e suficient ca Node să golească toate microtask-urile
  // înlănțuite (fetch -> json -> then -> tick -> fetch -> json -> draw).
  await new Promise((resolve) => setImmediate(resolve));

  return {
    sandbox,
    fillTextCalls,
    consoleLogCalls,
    fakeDetails,
    fakeHiddenPanel,
    drawImageCalls,
    arcCalls,
    strokeRectCalls,
    strokeRectStyles,
    fillCalls,
    fillRectCalls,
    fillRectStyles,
    callOrder,
    // T-12: `click(x,y)` simulează un click simplu (mousedown + mouseup fără
    // mișcare, deci sub pragul de 4px de drag) — NU mai există un listener
    // 'click' separat, dar comportamentul echivalent (selecție prin hit-test)
    // se obține exact prin acest flux, la fel ca într-un browser real.
    mouseDown(x, y) {
      assert.ok(canvasMouseDownHandler, 'mousedown handler nu a fost înregistrat de app.js pe canvas');
      canvasMouseDownHandler({ clientX: x, clientY: y });
    },
    mouseMove(x, y) {
      assert.ok(windowMouseMoveHandler, 'mousemove handler nu a fost înregistrat de app.js pe window');
      windowMouseMoveHandler({ clientX: x, clientY: y });
    },
    mouseUp(x, y) {
      assert.ok(windowMouseUpHandler, 'mouseup handler nu a fost înregistrat de app.js pe window');
      windowMouseUpHandler({ clientX: x, clientY: y });
    },
    click(x, y) {
      this.mouseDown(x, y);
      this.mouseUp(x, y);
    },
    wheel(x, y, deltaY) {
      assert.ok(canvasWheelHandler, 'wheel handler nu a fost înregistrat de app.js pe canvas');
      canvasWheelHandler({ clientX: x, clientY: y, deltaY, preventDefault: () => {} });
    },
    // Simulează evenimentul `resize` al ferestrei: schimbă window.innerWidth/
    // innerHeight ÎNAINTE de a chema handler-ul capturat (exact ordinea reală:
    // fereastra se redimensionează, ABIA APOI se declanșează evenimentul).
    resize(width, height) {
      fakeWindow.innerWidth = width;
      fakeWindow.innerHeight = height;
      assert.ok(windowResizeHandler, 'resize handler nu a fost înregistrat de app.js pe window');
      windowResizeHandler();
    },
    async setAgents(agentList) {
      // T-07: NU mai înlocuim `sandbox.fetch` global (asta ar strica
      // /api/state) — doar schimbăm ce întoarce mock-ul pentru /api/agents.
      agentsOnServer = agentList;
      await sandbox.tick();
    },
    // Simulează evenimentul `onload` al imaginii sprite-ului (pawn-idle).
    // Corecție planner (T-13): găsim instanța după `.src`, nu după index fix
    // — T-13 a adăugat două `new Image()` NOI (apă, teren) ÎNAINTEA lui
    // `pawnImage` în script, deci `imageInstances[0]` nu mai e pawn-idle.
    // Căutarea după `.src` rămâne corectă indiferent de câte imagini noi se
    // mai adaugă în viitor, în orice ordine.
    triggerImageLoad() {
      const img = imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('pawn-idle'));
      assert.ok(img, 'app.js n-a instanțiat nicio Image() cu src conținând "pawn-idle"');
      assert.equal(typeof img.onload, 'function', 'app.js n-a atașat un handler onload pe imaginea pawn-idle');
      img.onload();
    },
    // T-13: simulează evenimentul `onload` al imaginii de teren (tilemap din
    // care se decupează peticul de iarbă).
    triggerTerrainImageLoad() {
      const img = imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('terrain-tilemap'));
      assert.ok(img, 'app.js n-a instanțiat nicio Image() cu src conținând "terrain-tilemap"');
      assert.equal(typeof img.onload, 'function', 'app.js n-a atașat un handler onload pe imaginea terrain-tilemap');
      img.onload();
    },
    // T-15: simulează evenimentul `onload` al imaginii turnului static din
    // centrul hărții (analog cu triggerTerrainImageLoad de mai sus).
    triggerTowerImageLoad() {
      const img = imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('tower'));
      assert.ok(img, 'app.js n-a instanțiat nicio Image() cu src conținând "tower"');
      assert.equal(typeof img.onload, 'function', 'app.js n-a atașat un handler onload pe imaginea tower');
      img.onload();
    },
    // T-14: analog cu triggerImageLoad/triggerRunImageLoad de mai sus, dar
    // pentru imaginea de tufă (decorațiune animată).
    triggerBushImageLoad() {
      const img = imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('bush'));
      assert.ok(img, 'app.js n-a instanțiat nicio Image() cu src conținând "bush"');
      assert.equal(typeof img.onload, 'function', 'app.js n-a atașat un handler onload pe imaginea bush');
      img.onload();
    },
    // T-14: cele DOUĂ variante de stâncă (rock1/rock2) — decorația statică
    // alege între ele după `decoration.variant`, deci testele au nevoie de
    // ambele "încărcate" ca să acopere oricare variantă a fost aleasă de hash.
    triggerRockImagesLoad() {
      const img1 = imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('rock1'));
      const img2 = imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('rock2'));
      assert.ok(img1, 'app.js n-a instanțiat nicio Image() cu src conținând "rock1"');
      assert.ok(img2, 'app.js n-a instanțiat nicio Image() cu src conținând "rock2"');
      assert.equal(typeof img1.onload, 'function', 'app.js n-a atașat un handler onload pe imaginea rock1');
      assert.equal(typeof img2.onload, 'function', 'app.js n-a atașat un handler onload pe imaginea rock2');
      img1.onload();
      img2.onload();
    },
    // T-17: cele DOUĂ sprite-uri de topor (run + interact) — căutate după
    // substring distinct ("pawn-run-axe"/"pawn-interact-axe"), nu index fix,
    // la fel ca restul helper-elor trigger* din acest fișier.
    triggerAxeImagesLoad() {
      const runImg = imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('pawn-run-axe'));
      const interactImg = imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('pawn-interact-axe'));
      assert.ok(runImg, 'app.js n-a instanțiat nicio Image() cu src conținând "pawn-run-axe"');
      assert.ok(interactImg, 'app.js n-a instanțiat nicio Image() cu src conținând "pawn-interact-axe"');
      assert.equal(typeof runImg.onload, 'function', 'app.js n-a atașat un handler onload pe imaginea pawn-run-axe');
      assert.equal(typeof interactImg.onload, 'function', 'app.js n-a atașat un handler onload pe imaginea pawn-interact-axe');
      runImg.onload();
      interactImg.onload();
    },
    // T-17: analog cu triggerAxeImagesLoad, pentru sprite-urile de târnăcop.
    triggerPickaxeImagesLoad() {
      const runImg = imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('pawn-run-pickaxe'));
      const interactImg = imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('pawn-interact-pickaxe'));
      assert.ok(runImg, 'app.js n-a instanțiat nicio Image() cu src conținând "pawn-run-pickaxe"');
      assert.ok(interactImg, 'app.js n-a instanțiat nicio Image() cu src conținând "pawn-interact-pickaxe"');
      assert.equal(typeof runImg.onload, 'function', 'app.js n-a atașat un handler onload pe imaginea pawn-run-pickaxe');
      assert.equal(typeof interactImg.onload, 'function', 'app.js n-a atașat un handler onload pe imaginea pawn-interact-pickaxe');
      runImg.onload();
      interactImg.onload();
    },
    // T-17: imaginea copacului (landmark animat de cadran pădure).
    triggerTreeImageLoad() {
      const img = imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('tree.png'));
      assert.ok(img, 'app.js n-a instanțiat nicio Image() cu src conținând "tree.png"');
      assert.equal(typeof img.onload, 'function', 'app.js n-a atașat un handler onload pe imaginea tree.png');
      img.onload();
    },
    // T-17: imaginea bolovanului de aur (landmark static de cadran aur).
    triggerGoldStoneImageLoad() {
      const img = imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('gold-stone'));
      assert.ok(img, 'app.js n-a instanțiat nicio Image() cu src conținând "gold-stone"');
      assert.equal(typeof img.onload, 'function', 'app.js n-a atașat un handler onload pe imaginea gold-stone');
      img.onload();
    },
    // T-17: referințe directe la instanțele Image() ale sprite-urilor/
    // landmark-urilor noi, utile pentru verificarea prin IDENTITATE a ce
    // imagine a fost pasată la ctx.drawImage(...) (args[0]), la fel ca
    // pawnIdleImage/pawnRunImage de mai jos.
    get pawnRunAxeImage() {
      return imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('pawn-run-axe'));
    },
    get pawnInteractAxeImage() {
      return imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('pawn-interact-axe'));
    },
    get pawnRunPickaxeImage() {
      return imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('pawn-run-pickaxe'));
    },
    get pawnInteractPickaxeImage() {
      return imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('pawn-interact-pickaxe'));
    },
    get treeImage() {
      return imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('tree.png'));
    },
    get goldStoneImage() {
      return imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('gold-stone'));
    },
    // T-13: expuse pentru verificarea decupării peticului de iarbă pe
    // canvas-ul offscreen (vezi document.createElement mai sus).
    offscreenCreateCalls,
    offscreenDrawImageCalls,
    // Apelează manual callback-ul buclei de animație a sprite-ului
    // (setInterval-ul cu ms mic), simulând trecerea timpului.
    advanceAnimationFrame() {
      const animation = intervalCallbacks.find((c) => c.ms < 1000);
      assert.ok(
        animation,
        'nu am găsit setInterval-ul de animație (ms < 1000) printre cele înregistrate de app.js'
      );
      animation.fn();
    },
    // T-11: avansează mișcarea reală cu exact un pas (MOVEMENT_TICK_MS =
    // 50ms), apelând direct funcția de producție `updateAgentMovement()`
    // (proprietate a sandbox-ului, fiindcă e declarată cu `function` la
    // nivel de script — la fel ca `draw`/`tick`). Nu cheamă `draw()`: testele
    // decid explicit când să redeseneze, ca să poată inspecta
    // drawImageCalls/arcCalls între avansări succesive.
    advanceMovementTick() {
      sandbox.updateAgentMovement();
    },
    // T-11: simulează evenimentul `onload` al SPRITE-ULUI DE ALERGARE
    // (pawn-run), a doua imagine instanțiată de app.js — analog cu
    // triggerImageLoad() de mai sus, care acoperă doar prima imagine
    // (pawn-idle).
    triggerRunImageLoad() {
      const img = imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('pawn-run'));
      assert.ok(img, 'app.js n-a instanțiat nicio Image() cu src conținând "pawn-run"');
      assert.equal(typeof img.onload, 'function', 'app.js n-a atașat un handler onload pe imaginea pawn-run');
      img.onload();
    },
    // T-11: referință directă la instanțele Image() create de app.js. Utilă
    // ca să verificăm prin IDENTITATE ce imagine a fost pasată la
    // ctx.drawImage(...) (args[0]) — adică ce sprite a ales draw() pentru
    // starea curentă a agentului.
    imageInstances,
    // Corecție planner (T-13): expuse după `.src`, nu index fix — T-13 a
    // adăugat două `new Image()` noi (apă, teren) ÎNAINTEA lui `pawnImage`,
    // deci `imageInstances[0]`/`[1]` nu mai sunt garantat idle/run.
    get pawnIdleImage() {
      return imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('pawn-idle'));
    },
    get pawnRunImage() {
      return imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('pawn-run'));
    },
    // --- helpere T-07 (arhivare) ---
    clickHide() {
      assert.ok(hideBtnClickHandler, 'butonul Hide nu a fost randat/înregistrat (renderDetails trebuie apelat cu un agent selectat înainte)');
      hideBtnClickHandler();
    },
    clickShowHidden() {
      assert.ok(showHiddenBtnClickHandler, 'butonul "Arată ascunși" nu a fost înregistrat');
      showHiddenBtnClickHandler();
    },
    clickHideHidden() {
      assert.ok(hideHiddenBtnClickHandler, 'butonul "Ascunde lista" nu a fost înregistrat');
      hideHiddenBtnClickHandler();
    },
    clickUnhide(sessionId) {
      const handler = unhideClickHandlers.get(sessionId);
      assert.ok(handler, `nu există buton Unhide înregistrat pentru ${sessionId} (ai apelat clickShowHidden() înainte?)`);
      handler();
    },
    pendingTimerCount() {
      return pendingTimers.size;
    },
    // Rulează TOATE timer-ele încă în așteptare (simulează trecerea celor
    // 500ms de debounce) și așteaptă terminarea callback-urilor lor async.
    async runDebounce() {
      const entries = [...pendingTimers.entries()];
      pendingTimers.clear();
      await Promise.all(entries.map(([, t]) => t.fn()));
    },
    setPutStateImpl(fn) {
      putStateImpl = fn;
    },
    getPutCalls() {
      return putCalls;
    },
    // --- helpere T-18 (New session / Reveal in folder) ---
    // newSessionForAgent/revealAgentFolder sunt async, dar listener-ul din
    // renderDetails() nu întoarce/așteaptă promisiunea lor (`() => {
    // newSessionForAgent(agent.cwd); }`) — la fel ca restul handler-elor de
    // click din app.js. Așteptăm explicit un flush de microtask-uri după
    // apelul sincron al handler-ului, ca fetch-ul mock (rezolvat prin
    // microtask-uri, fără timere reale) să se fi terminat înainte ca testul
    // să verifice efectele (getNewSessionCalls()/openErrorText).
    async clickNewSession() {
      assert.ok(newSessionBtnClickHandler, 'butonul New session nu a fost randat/înregistrat (renderDetails trebuie apelat cu un agent selectat înainte)');
      newSessionBtnClickHandler();
      await new Promise((resolve) => setImmediate(resolve));
    },
    async clickReveal() {
      assert.ok(revealBtnClickHandler, 'butonul Reveal in folder nu a fost randat/înregistrat (renderDetails trebuie apelat cu un agent selectat înainte)');
      revealBtnClickHandler();
      await new Promise((resolve) => setImmediate(resolve));
    },
    getNewSessionCalls() {
      return newSessionCalls;
    },
    getRevealCalls() {
      return revealCalls;
    },
    setNewSessionImpl(fn) {
      newSessionImpl = fn;
    },
    setRevealImpl(fn) {
      revealImpl = fn;
    },
    get openErrorText() {
      return fakeOpenError.textContent;
    },
  };
}

// --- 1. Stabilitatea hash-ului -------------------------------------------

test('hashToCellIndex e determinist și dă valoarea exactă așteptată', async () => {
  const { sandbox } = await loadApp();

  const cases = [
    { id: 'session-a', expected: sumCharCodes('session-a') % 64 },
    { id: 'agent-42', expected: sumCharCodes('agent-42') % 64 },
    { id: 'x', expected: sumCharCodes('x') % 64 },
  ];

  for (const { id, expected } of cases) {
    const first = sandbox.hashToCellIndex(id);
    const second = sandbox.hashToCellIndex(id);
    assert.equal(first, expected, `hash greșit pentru "${id}"`);
    assert.equal(second, expected, `hash-ul pentru "${id}" nu e stabil la a doua chemare`);
  }
});

function sumCharCodes(str) {
  let sum = 0;
  for (let i = 0; i < str.length; i++) sum += str.charCodeAt(i);
  return sum;
}

// --- 2. Independența de ordine --------------------------------------------

test('poziția unui agent pe grilă nu depinde de ordinea din array-ul de agenți', async () => {
  const app = await loadApp();

  const agentA = { sessionId: 'session-a', alive: true, status: 'busy', name: 'alice' };
  const agentB = { sessionId: 'session-b', alive: true, status: 'busy', name: 'bob' };

  await app.setAgents([agentA, agentB]);
  // T-11: draw() desenează acum din agentMovement, populat/avansat doar de
  // updateAgentMovement() — fără avansare, agenții sunt încă la SPAWN_POINT.
  // Așteptăm sosirea (at-site) ca poziția desenată să reflecte de fapt
  // celula calculată din hash, nu doar punctul comun de apariție.
  settleMovement(app);
  app.sandbox.draw();
  const firstRunCalls = app.fillTextCalls.splice(0, app.fillTextCalls.length);
  const posAliceFirst = firstRunCalls.find((c) => c.text === 'alice');
  const posBobFirst = firstRunCalls.find((c) => c.text === 'bob');

  await app.setAgents([agentB, agentA]); // ordine inversată
  settleMovement(app);
  app.sandbox.draw();
  const secondRunCalls = app.fillTextCalls.splice(0, app.fillTextCalls.length);
  const posAliceSecond = secondRunCalls.find((c) => c.text === 'alice');
  const posBobSecond = secondRunCalls.find((c) => c.text === 'bob');

  assert.ok(posAliceFirst && posAliceSecond, 'alice ar fi trebuit desenată în ambele randări');
  assert.ok(posBobFirst && posBobSecond, 'bob ar fi trebuit desenat în ambele randări');

  assert.deepEqual(
    { x: posAliceFirst.x, y: posAliceFirst.y },
    { x: posAliceSecond.x, y: posAliceSecond.y },
    'poziția lui alice s-a schimbat doar pentru că ordinea din array s-a schimbat'
  );
  assert.deepEqual(
    { x: posBobFirst.x, y: posBobFirst.y },
    { x: posBobSecond.x, y: posBobSecond.y },
    'poziția lui bob s-a schimbat doar pentru că ordinea din array s-a schimbat'
  );
});

// --- 3. Mapare activity → culoare --------------------------------------------

test('colorForActivity: "working" primește culoarea dedicată', async () => {
  const { sandbox } = await loadApp();
  assert.equal(sandbox.colorForActivity('working'), '#2A5FAE');
});

test('colorForActivity: "waiting" primește culoarea dedicată', async () => {
  const { sandbox } = await loadApp();
  assert.equal(sandbox.colorForActivity('waiting'), '#B4801E');
});

test('colorForActivity: "sleeping" primește gri', async () => {
  const { sandbox } = await loadApp();
  assert.equal(sandbox.colorForActivity('sleeping'), '#888');
});

test('colorForActivity: valori necunoscute primesc gri și nu aruncă', async () => {
  const { sandbox } = await loadApp();
  for (const activity of ['busy', 'idle', 'ceva-inventat', undefined, null, '']) {
    assert.doesNotThrow(() => {
      const color = sandbox.colorForActivity(activity);
      assert.equal(color, '#888');
    });
  }
});

// --- 4. Detectare click -----------------------------------------------------

test('click exact pe centrul unui cerc selectează agentul (apare în panoul de detalii)', async () => {
  const app = await loadApp();
  const agent = {
    sessionId: 'session-a',
    alive: true,
    status: 'busy',
    name: 'alice',
    pid: 123,
    cwd: '/tmp',
    updatedAt: Date.now(),
  };
  await app.setAgents([agent]);
  // T-11: click-ul selectează după poziția AFIȘATĂ curentă (agentMovement),
  // nu direct după ținta calculată — așteptăm sosirea (at-site) ca cele
  // două să coincidă exact.
  settleMovement(app);

  const pos = agentPixelPosition(app, agent);

  app.click(pos.x, pos.y);

  assert.ok(app.fakeDetails.innerHTML.includes('alice'), 'click pe centru ar fi trebuit să selecteze agentul');
  assert.ok(!app.fakeDetails._classes.has('hidden'), 'panoul de detalii ar fi trebuit să devină vizibil');
});

test('click în afara razei cercului NU selectează agentul', async () => {
  const app = await loadApp();
  const agent = {
    sessionId: 'session-a',
    alive: true,
    status: 'busy',
    name: 'alice',
    pid: 123,
    cwd: '/tmp',
    updatedAt: Date.now(),
  };
  await app.setAgents([agent]);
  settleMovement(app); // T-11: poziția afișată trebuie să coincidă cu ținta

  const pos = agentPixelPosition(app, agent);

  // 100px depărtare e mult mai mult decât raza cercului (28px).
  app.click(pos.x + 100, pos.y + 100);

  assert.equal(app.fakeDetails.innerHTML, '', 'click departe de cerc n-ar fi trebuit să selecteze nimic');
  assert.ok(app.fakeDetails._classes.has('hidden'), 'panoul de detalii ar fi trebuit să rămână ascuns');
});

// --- 5. Formatare timp -------------------------------------------------------

test('renderDetails formatează updatedAt ca string nevid, fără să arunce', async () => {
  const app = await loadApp();
  const agent = {
    sessionId: 'session-a',
    alive: true,
    status: 'busy',
    name: 'alice',
    pid: 123,
    cwd: '/tmp',
    updatedAt: Date.now(),
  };
  await app.setAgents([agent]);
  settleMovement(app); // T-11: poziția afișată trebuie să coincidă cu ținta

  const pos = agentPixelPosition(app, agent);

  assert.doesNotThrow(() => app.click(pos.x, pos.y));

  const match = app.fakeDetails.innerHTML.match(/<span class="label">updatedAt<\/span>([^<]*)</);
  assert.ok(match, 'nu găsesc câmpul updatedAt în panoul de detalii');
  assert.notEqual(match[1].trim(), '', 'updatedAt ar fi trebuit să fie un string nevid');
});

// --- 6. Sprite animat (T-04) -------------------------------------------------

// Dimensiuni fixe ale sheet-ului/sprite-ului, documentate explicit în
// docs/handoff/T-04-coder-raport.md (nu sunt "poziții ghicite" — sunt
// constante ale formatului sprite-ului: 8 cadre de 192x192px pe sheet,
// desenate la 56x56px pe canvas).
const SPRITE_FRAME_SIZE = 192;
const SPRITE_FRAME_COUNT = 8;
const SPRITE_DEST_SIZE = 56;
const SPRITE_HALF = SPRITE_DEST_SIZE / 2;
const CIRCLE_RADIUS = 28; // hit-test-ul de click, documentat în public/app.js

// T-11 — constante de mișcare, documentate în public/app.js (nu exportate,
// la fel ca restul constantelor `const`/`let` de mai sus în acest fișier —
// app.js nu are export-uri, deci le reproducem aici ca presupuneri explicite,
// nu ghicite).
const MOVEMENT_TICK_MS = 50;
const MOVEMENT_DT = MOVEMENT_TICK_MS / 1000; // 0.05s
const WALK_SPEED = 140; // px/s
const ARRIVE_RADIUS = 6; // px
const SPAWN_SCALE_RATE = 3; // scale/s
const LEAVING_SHRINK_RATE = 2.2; // scale/s

// T-12 — constante de cameră, documentate în public/app.js (camera 2D).
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
// Dimensiune fixă a mock-ului de canvas (vezi fakeCanvas/fakeWindow din
// loadApp()) — 720x720, ca să păstreze neschimbate testele T-04/T-07/T-10/T-11
// deja scrise pe baza acestei valori (GRID_OFFSET, celule de zonă etc.).
const CANVAS_W = 720;
const CANVAS_H = 720;
const CANVAS_CENTER_X = CANVAS_W / 2;
const CANVAS_CENTER_Y = CANVAS_H / 2;

// T-12 — SPAWN_POINT e acum originea LUMII ({x:0,y:0}, fix în app.js, nu mai
// depinde de canvas.width/height). Poziția de ECRAN, la camera implicită
// ({x:0,y:0,zoom:1}), e worldToScreen(0,0) = centrul canvas-ului — de-asta
// testele care compară cu drawImage (coordonate de ecran) folosesc centrul,
// nu colțul stânga-jos ca înainte de T-12.
const TEST_SPAWN_POINT = { x: CANVAS_CENTER_X, y: CANVAS_CENTER_Y };

function assertClose(actual, expected, msg, epsilon = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${msg} (așteptat ~${expected}, primit ${actual})`
  );
}

// T-12 — extrage zoom-ul curent al camerei FĂRĂ să atingă `camera` direct
// (e `const` la nivel de script, nu devine proprietate globală în sandbox —
// la fel ca `agents`/`state`). worldToScreen scalează orice deplasare de
// lume cu `camera.zoom`; diferența dintre transformarea a două puncte aflate
// la distanță de 1 unitate de lume pe axa x dă exact zoom-ul, indiferent de
// translația curentă a camerei (translația se anulează la scădere).
function getZoom(app) {
  const a = app.sandbox.worldToScreen(0, 0);
  const b = app.sandbox.worldToScreen(1, 0);
  return b.x - a.x;
}

// T-11 — avansează mișcarea suficient cât orice agent aflat în tranziție
// (spawn -> walking -> at-site, sau leaving -> dispariție) să-și termine
// ciclul, indiferent de distanța până la țintă. 400 pași * 7px/pas
// (WALK_SPEED*MOVEMENT_DT) = 2800px, mult peste diagonala canvas-ului de
// test (720x720 =~ 1018px), plus cele ~7 tick-uri necesare pentru scale-ul
// de apariție/plecare.
function settleMovement(app, ticks = 400) {
  for (let i = 0; i < ticks; i++) app.advanceMovementTick();
}

function makeAliveAgent(overrides = {}) {
  return {
    sessionId: 'session-a',
    alive: true,
    status: 'busy',
    name: 'alice',
    pid: 123,
    cwd: '/tmp',
    updatedAt: Date.now(),
    ...overrides,
  };
}

test('draw() NU cheamă drawImage cât timp imaginea sprite-ului nu s-a "încărcat"', async () => {
  const app = await loadApp();
  await app.setAgents([makeAliveAgent()]); // tick() -> draw(), imaginea nu s-a "încărcat" încă
  app.advanceMovementTick(); // T-11: creează intrarea în agentMovement (scale>0)
  app.sandbox.draw();

  assert.equal(
    app.drawImageCalls.length,
    0,
    'drawImage n-ar fi trebuit chemat înainte ca pawnImage.onload să fi fost declanșat'
  );
});

test('după "încărcarea" imaginii, draw() cheamă drawImage cu cadrul 0 (sx=0, sy=0, sw=192, sh=192)', async () => {
  const app = await loadApp();
  await app.setAgents([makeAliveAgent()]);
  app.advanceMovementTick(); // T-11: fără asta, agentMovement e gol -> 0 chemări

  app.triggerImageLoad();
  app.sandbox.draw();

  assert.equal(app.drawImageCalls.length, 1, 'ar fi trebuit exact o chemare de drawImage pentru un agent viu');
  const [, sx, sy, sw, sh] = app.drawImageCalls[0];
  assert.equal(sx, 0, 'sx ar fi trebuit să corespundă cadrului 0');
  assert.equal(sy, 0, 'sy ar fi trebuit să fie 0 (un singur rând de cadre)');
  assert.equal(sw, SPRITE_FRAME_SIZE, 'sw ar fi trebuit să fie dimensiunea unui cadru');
  assert.equal(sh, SPRITE_FRAME_SIZE, 'sh ar fi trebuit să fie dimensiunea unui cadru');
});

test('cadrele de animație avansează ciclic 0..7 și revin la 0 după cadrul 7', async () => {
  const app = await loadApp();
  await app.setAgents([makeAliveAgent()]);
  app.advanceMovementTick(); // T-11: fără asta, agentMovement e gol -> 0 chemări
  app.triggerImageLoad();

  // 10 avansări peste un ciclu de 8 cadre -> trebuie să "dea roată" de două ori.
  const expectedFrames = [1, 2, 3, 4, 5, 6, 7, 0, 1, 2];
  const observedFrames = [];

  for (let i = 0; i < expectedFrames.length; i++) {
    app.advanceAnimationFrame(); // avansează currentFrame ȘI cheamă draw()
    const lastCall = app.drawImageCalls[app.drawImageCalls.length - 1];
    assert.ok(lastCall, `nicio chemare de drawImage după avansarea #${i + 1}`);
    observedFrames.push(lastCall[1] / SPRITE_FRAME_SIZE);
  }

  assert.deepEqual(
    observedFrames,
    expectedFrames,
    'secvența de cadre nu e ciclică 0..7 sau nu se resetează după cadrul 7'
  );
  assert.equal(SPRITE_FRAME_COUNT, 8, 'presupunere invalidată: sheet-ul nu mai are 8 cadre');
});

test('draw() desenează un indicator de status suplimentar (arc+fill) cu culoarea din colorForActivity', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent({ activity: 'working' });
  await app.setAgents([agent]);
  settleMovement(app); // T-11: poziția afișată trebuie să coincidă cu ținta
  app.arcCalls.length = 0;
  app.fillCalls.length = 0;
  app.sandbox.draw();

  assert.equal(app.arcCalls.length, 1, 'ar fi trebuit desenat exact un cerc (indicatorul de status) pentru un agent viu');
  assert.equal(app.fillCalls.length, 1, 'ar fi trebuit exact o chemare fill() pentru indicatorul de status');
  assert.equal(
    app.fillCalls[0].fillStyle,
    app.sandbox.colorForActivity('working'),
    'culoarea indicatorului de status ar fi trebuit să vină din colorForActivity'
  );

  // T-15: zoom implicit e acum 2 (nu 1) — dimensiunea desenată a sprite-ului
  // (deci și poziția indicatorului, calculată relativ la ea) scalează cu
  // camera.zoom (vezi public/app.js: spriteSize = SPRITE_DEST_SIZE * scale *
  // camera.zoom). La scale=1 (agent stabilizat, "at-site"), jumătatea reală
  // e SPRITE_HALF * zoom, nu SPRITE_HALF fix.
  const zoom = getZoom(app);
  const half = SPRITE_HALF * zoom;
  const pos = agentPixelPosition(app, agent);
  const spriteX = pos.x - half;
  const spriteY = pos.y - half;
  const [cx, cy] = app.arcCalls[0];
  assertClose(cx, spriteX + half * 2, 'centrul indicatorului nu e în colțul dreapta-sus al sprite-ului');
  assertClose(cy, spriteY, 'centrul indicatorului nu e în colțul dreapta-sus al sprite-ului');
});

test('draw() NU desenează indicatorul de status pentru agenți morți (alive=false)', async () => {
  const app = await loadApp();
  await app.setAgents([makeAliveAgent({ alive: false })]);

  assert.equal(app.arcCalls.length, 0, 'un agent mort n-ar fi trebuit desenat deloc');
  assert.equal(app.drawImageCalls.length, 0, 'un agent mort n-ar fi trebuit desenat deloc');
});

test('la agent selectat, strokeRect e chemat cu zona sprite-ului (scalată cu zoom)', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent();
  await app.setAgents([agent]);
  settleMovement(app); // T-11: poziția afișată trebuie să coincidă cu ținta

  // T-15: zoom implicit e acum 2 (nu 1) — dimensiunea reală a sprite-ului
  // (deci și a conturului de selecție) e SPRITE_DEST_SIZE * zoom, nu
  // SPRITE_DEST_SIZE fix. Zona (drawZones()) desenează și ea strokeRect
  // (conturul celulelor, dimensiune CELL_SIZE*zoom = 160 la zoom implicit)
  // la fiecare draw(), indiferent de selecție — deci "0 apeluri fără
  // selecție" nu mai e adevărat. Distingem conturul de SELECȚIE de cele de
  // ZONĂ după dimensiune (spriteSize vs cellSizeScreen), nu după numărul
  // total de apeluri.
  const zoom = getZoom(app);
  const spriteSize = SPRITE_DEST_SIZE * zoom;
  const selectionStrokesBefore = app.strokeRectCalls.filter(([, , w]) => w === spriteSize);
  assert.equal(selectionStrokesBefore.length, 0, 'fără selecție, nu ar trebui desenat niciun contur de SELECȚIE (cele de zonă nu contează)');

  const pos = agentPixelPosition(app, agent);
  app.click(pos.x, pos.y); // selectează agentul (click în centrul zonei de hit-test) și redesenează

  const selectionStrokesAfter = app.strokeRectCalls.filter(([, , w]) => w === spriteSize);
  assert.equal(selectionStrokesAfter.length, 1, `ar fi trebuit exact un contur de selecție (dimensiune ${spriteSize}) după click`);
  const [sx, sy, w, h] = selectionStrokesAfter[0];
  assert.equal(sx, pos.x - spriteSize / 2, 'colțul stânga-sus (x) al conturului nu corespunde poziției agentului');
  assert.equal(sy, pos.y - spriteSize / 2, 'colțul stânga-sus (y) al conturului nu corespunde poziției agentului');
  assert.equal(w, spriteSize, 'lățimea conturului ar fi trebuit să fie dimensiunea sprite-ului scalată cu zoom-ul');
  assert.equal(h, spriteSize, 'înălțimea conturului ar fi trebuit să fie dimensiunea sprite-ului scalată cu zoom-ul');
});

// --- 7. Arhivare (T-07) ------------------------------------------------------

// T-11: înainte de mișcarea reală, un agent arhivat dispărea INSTANT din
// desen (hideAgent() îl scotea imediat din `agents`/`agentPositions`). Acum
// draw() iterează `agentMovement`, iar un agent arhivat trece în starea
// 'leaving' și continuă să fie desenat cât "pleacă" spre SPAWN_POINT —
// exact comportamentul cerut de T-11 (vezi și secțiunea 9 de mai jos). Acest
// test verifică varianta corectă: dispariția e eventuală, nu instantanee.
test('un agent arhivat NU mai e desenat abia după ce animația de plecare (leaving) s-a terminat complet', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent();
  await app.setAgents([agent]);
  app.triggerImageLoad();
  app.triggerRunImageLoad();
  settleMovement(app); // agentul ajunge at-site

  // Îl arhivăm prin calea reală (hideAgent), singura care populează
  // `state.archived` — `state` e `let` la nivel de script, nu există altă
  // cale de a-l seta din exterior după ce initState() a rulat deja.
  app.sandbox.hideAgent(agent.sessionId);
  settleMovement(app); // suficient pentru ca leaving-ul să se termine complet

  app.arcCalls.length = 0;
  app.drawImageCalls.length = 0;
  app.fillTextCalls.length = 0;

  app.sandbox.draw();

  assert.equal(app.arcCalls.length, 0, 'după plecarea completă, agentul arhivat n-ar mai trebui desenat (arc)');
  assert.equal(app.drawImageCalls.length, 0, 'după plecarea completă, agentul arhivat n-ar mai trebui desenat (drawImage)');
  assert.ok(
    !app.fillTextCalls.some((c) => c.text === agent.name),
    'după plecarea completă, numele agentului arhivat n-ar mai trebui desenat pe hartă'
  );
});

test('un agent arhivat e TOT desenat imediat după Hide, cât timp e în leaving (nu dispare brusc)', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent();
  await app.setAgents([agent]);
  app.triggerImageLoad();
  app.triggerRunImageLoad();
  settleMovement(app); // agentul ajunge at-site

  app.sandbox.hideAgent(agent.sessionId); // arhivare + draw() intern (încă în starea de dinainte)
  app.advanceMovementTick(); // un pas: tranziția explicită spre 'leaving'

  app.drawImageCalls.length = 0;
  app.arcCalls.length = 0;
  app.sandbox.draw();

  assert.equal(
    app.drawImageCalls.length,
    1,
    'un agent arhivat, cât timp e în leaving, ar fi trebuit tot desenat (nu dispărut brusc)'
  );
  assert.equal(app.arcCalls.length, 1, 'un agent arhivat, cât timp e în leaving, ar fi trebuit tot desenat (arc)');
  assert.equal(
    app.drawImageCalls[0][0],
    app.pawnRunImage,
    'în leaving, sprite-ul ar fi trebuit să fie cel de alergare (pawn-run), nu idle'
  );
});

test('click pe poziția unui agent arhivat NU îl selectează (filtrare la hit-test)', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent();
  await app.setAgents([agent]);
  settleMovement(app); // T-11: poziția afișată trebuie să coincidă cu ținta

  const pos = agentPixelPosition(app, agent);

  // selectăm normal (confirmă că poziția de click e corectă), apoi îl
  // ascundem prin fluxul real (buton Hide).
  app.click(pos.x, pos.y);
  assert.ok(app.fakeDetails.innerHTML.includes(agent.name), 'presetup: click-ul ar fi trebuit să selecteze agentul înainte de Hide');
  app.clickHide();

  app.click(pos.x, pos.y);

  assert.equal(
    app.fakeDetails.innerHTML.includes(agent.name),
    false,
    'click pe poziția unui agent ascuns nu ar fi trebuit să-l selecteze din nou'
  );
});

test('initState() la pornire încarcă archived existent din /api/state — agentul e filtrat din primul draw()', async () => {
  const agent = makeAliveAgent();
  const app = await loadApp({
    initialState: {
      version: 1,
      archived: [agent.sessionId],
      archivedAt: { [agent.sessionId]: 12345 },
      updatedAt: 42,
    },
  });

  await app.setAgents([agent]);
  // T-11: verificăm și că updateAgentMovement() nu-l adaugă retroactiv în
  // agentMovement — un agent deja arhivat la încărcare nu ar trebui să
  // "apară" nici măcar temporar.
  app.advanceMovementTick();
  app.arcCalls.length = 0;
  app.drawImageCalls.length = 0;
  app.sandbox.draw();

  assert.equal(app.arcCalls.length, 0, 'un agent deja arhivat pe disc n-ar fi trebuit desenat de la primul tick()');
  assert.ok(
    app.fakeHiddenPanel.innerHTML.includes('(1)'),
    `initState() ar fi trebuit să populeze renderHiddenList() cu agentul persistat, are: ${app.fakeHiddenPanel.innerHTML}`
  );
});

test('hideAgent (prin butonul Hide) arhivează agentul, resetează selecția și programează salvarea', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent();
  await app.setAgents([agent]);
  app.triggerImageLoad();
  app.triggerRunImageLoad();
  settleMovement(app); // T-11: poziția afișată trebuie să coincidă cu ținta

  const pos = agentPixelPosition(app, agent);
  app.click(pos.x, pos.y);
  assert.ok(app.fakeDetails.innerHTML.includes('Hide'), 'panoul de detalii ar fi trebuit să conțină butonul Hide');

  app.arcCalls.length = 0;
  app.drawImageCalls.length = 0;

  app.clickHide();

  // 1. selecția s-a resetat -> renderDetails arată panoul ascuns
  assert.ok(app.fakeDetails._classes.has('hidden'), 'panoul de detalii ar fi trebuit să redevină ascuns după Hide');
  assert.equal(app.fakeDetails.textContent, '', 'panoul de detalii ar fi trebuit golit după Hide');

  // 2. T-11: agentul TOT e desenat imediat după Hide — nu mai dispare
  // instant, ci pleacă spre SPAWN_POINT (stare 'leaving'), vizibil cât timp
  // se retrage. Dispariția completă e testată separat, mai jos (secțiunea
  // Arhivare) și explicit în secțiunea 9 (T-11).
  assert.equal(app.arcCalls.length, 1, 'agentul ascuns ar fi trebuit tot desenat imediat după Hide (pleacă, nu dispare instant)');
  assert.equal(app.drawImageCalls.length, 1, 'agentul ascuns ar fi trebuit tot desenat imediat după Hide (pleacă, nu dispare instant)');

  // 3. lista de ascunși reflectă noul count
  assert.ok(
    app.fakeHiddenPanel.innerHTML.includes('(1)'),
    `lista de ascunși ar fi trebuit să arate 1 element, are: ${app.fakeHiddenPanel.innerHTML}`
  );

  // 4. s-a programat o salvare (debounce), dar nu s-a trimis încă
  assert.equal(app.getPutCalls().length, 0, 'PUT-ul nu ar fi trebuit trimis înainte de debounce');
  assert.equal(app.pendingTimerCount(), 1, 'ar fi trebuit programat exact un timer de debounce');

  await app.runDebounce();

  const puts = app.getPutCalls();
  assert.equal(puts.length, 1, 'debounce-ul ar fi trebuit să trimită exact un PUT /api/state');
  assert.ok(puts[0].archived.includes(agent.sessionId), 'PUT-ul ar fi trebuit să conțină sessionId-ul ascuns');
  assert.ok(
    Object.prototype.hasOwnProperty.call(puts[0].archivedAt, agent.sessionId),
    'PUT-ul ar fi trebuit să conțină un timestamp pentru sessionId-ul ascuns'
  );
});

test('unhideAgent (prin butonul Unhide din lista de ascunși) scoate agentul din archived și reapare pe hartă', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent();
  await app.setAgents([agent]);
  app.triggerImageLoad();
  settleMovement(app); // T-11: poziția afișată trebuie să coincidă cu ținta

  const pos = agentPixelPosition(app, agent);
  app.click(pos.x, pos.y);
  app.clickHide();

  app.clickShowHidden();
  assert.ok(
    app.fakeHiddenPanel.innerHTML.includes(agent.sessionId) || app.fakeHiddenPanel.innerHTML.includes(agent.name),
    'lista extinsă ar fi trebuit să arate agentul ascuns'
  );

  app.clickUnhide(agent.sessionId);

  assert.ok(
    app.fakeHiddenPanel.innerHTML.includes('(0)'),
    `lista de ascunși ar fi trebuit să arate 0 elemente după Unhide, are: ${app.fakeHiddenPanel.innerHTML}`
  );

  // agentul e din nou "vizibil" pentru randare (tick încă îl are în `agents`,
  // pentru că mock-ul de /api/agents nu s-a schimbat).
  app.arcCalls.length = 0;
  app.drawImageCalls.length = 0;
  app.sandbox.draw();
  assert.equal(app.arcCalls.length, 1, 'agentul ar fi trebuit să redevină vizibil (arc) după Unhide');
});

test('saveState — succes: PUT conține archived/archivedAt curente și baseUpdatedAt se actualizează (verificat indirect prin al doilea PUT)', async () => {
  const app = await loadApp();
  const agentA = makeAliveAgent({ sessionId: 'session-a', name: 'alice' });
  const agentB = makeAliveAgent({ sessionId: 'session-b', name: 'bob' });
  await app.setAgents([agentA, agentB]);

  app.sandbox.hideAgent('session-a');
  await app.runDebounce();

  const firstPut = app.getPutCalls()[0];
  assert.deepEqual(firstPut.archived, ['session-a']);

  // al doilea Hide: dacă baseUpdatedAt nu s-ar fi actualizat din răspunsul
  // serverului la primul PUT, acest al doilea PUT ar trimite tot
  // baseUpdatedAt-ul vechi (0) — verificăm indirect că s-a schimbat.
  app.sandbox.hideAgent('session-b');
  await app.runDebounce();

  const secondPut = app.getPutCalls()[1];
  assert.ok(secondPut.baseUpdatedAt > 0, 'baseUpdatedAt ar fi trebuit actualizat din răspunsul primului PUT (nu a rămas 0)');
  assert.deepEqual(
    new Set(secondPut.archived),
    new Set(['session-a', 'session-b']),
    'al doilea PUT ar fi trebuit să conțină ambii agenți ascunși'
  );
});

test('saveState — conflict 409: face merge cu starea remote și reîncearcă (nu se oprește la prima eroare)', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent();
  await app.setAgents([agent]);

  let calls = 0;
  app.setPutStateImpl((body) => {
    calls++;
    if (calls === 1) {
      const remote = {
        version: 1,
        archived: ['remote-agent'],
        archivedAt: { 'remote-agent': 111 },
        updatedAt: 999,
      };
      return { ok: false, status: 409, json: async () => remote };
    }
    const saved = { version: 1, archived: body.archived, archivedAt: body.archivedAt, updatedAt: 2000 };
    return { ok: true, status: 200, json: async () => saved };
  });

  app.sandbox.hideAgent(agent.sessionId);
  await app.runDebounce();

  const puts = app.getPutCalls();
  assert.equal(puts.length, 2, 'ar fi trebuit exact 2 încercări de PUT: prima respinsă cu 409, a doua reușită');

  const retryBody = puts[1];
  assert.ok(
    retryBody.archived.includes(agent.sessionId),
    'reîncercarea ar fi trebuit să păstreze elementul ascuns local'
  );
  assert.ok(
    retryBody.archived.includes('remote-agent'),
    'reîncercarea ar fi trebuit să includă și elementul din starea remote (mergeState nu a fost apelat sau a fost apelat greșit)'
  );
});

test('debounce: două hideAgent() rapide trimit un singur PUT /api/state, nu două', async () => {
  const app = await loadApp();
  const agentA = makeAliveAgent({ sessionId: 'session-a' });
  const agentB = makeAliveAgent({ sessionId: 'session-b' });
  await app.setAgents([agentA, agentB]);

  app.sandbox.hideAgent('session-a');
  app.sandbox.hideAgent('session-b'); // înainte ca debounce-ul primului să ruleze

  assert.equal(
    app.pendingTimerCount(),
    1,
    'al doilea hideAgent() ar fi trebuit să anuleze timer-ul primului (clearTimeout), nu să programeze unul suplimentar'
  );

  await app.runDebounce();

  const puts = app.getPutCalls();
  assert.equal(puts.length, 1, 'ar fi trebuit trimis un singur PUT după debounce, nu unul per hideAgent()');
  assert.deepEqual(
    new Set(puts[0].archived),
    new Set(['session-a', 'session-b']),
    'singurul PUT trimis ar fi trebuit să conțină ambii agenți ascunși în acel interval'
  );
});

// --- 8. Zone per proiect (T-10) ----------------------------------------------
//
// CELL_SIZE=80 (public/app.js) — folosit direct mai jos (nu importat, pentru
// că app.js nu exportă nimic; e documentat aici ca presupunere explicită,
// nu "ghicit").
const ZONE_CELL_SIZE = 80;

test('un singur proiect, un singur agent: poziția vine din prima celulă a zonei, fără jitter', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent({ cwd: '/proj/alpha' });
  await app.setAgents([agent]);

  // Oracol independent: aceeași alocare pe care ar fi făcut-o updateZones()
  // la primul tick (state.plots pornește gol -> previousMap gol).
  const plotsMap = app.sandbox.allocateCells([{ id: agent.cwd, size: 1 }], new Map());
  const cells = plotsMap.get(agent.cwd);
  assert.ok(cells && cells.length >= 1, 'presetup: proiectul ar fi trebuit să primească cel puțin o celulă');
  const expectedPos = app.sandbox.zoneCellToPixels(cells[0]);

  const actualPos = app.sandbox.computeAgentPositions([agent]).get(agent.sessionId);
  assert.deepEqual(
    actualPos,
    expectedPos,
    'poziția agentului unic dintr-un proiect ar fi trebuit să fie exact centrul primei celule a zonei, fără jitter'
  );
});

test('un singur proiect, mai mulți agenți: sunt distribuiți pe celule diferite ale zonei', async () => {
  const app = await loadApp();
  const cwd = '/proj/many';
  // 8 agenți > SLOTS_PER_CELL (7 din zones.js) -> proiectul primește cel
  // puțin 2 celule; id-uri alese ca hash-ul (sumă de coduri ASCII) să aibă
  // parități alternante, garantând că nu toți cad pe aceeași celulă.
  const agentList = [];
  for (let i = 0; i < 8; i++) {
    agentList.push(makeAliveAgent({ sessionId: `agent-${i}`, name: `a${i}`, cwd }));
  }
  await app.setAgents(agentList);

  const plotsMap = app.sandbox.allocateCells([{ id: cwd, size: 8 }], new Map());
  const cells = plotsMap.get(cwd);
  assert.ok(cells.length >= 2, 'presetup: 8 agenți ar fi trebuit să primească cel puțin 2 celule');

  const usedCellKeys = new Set();
  for (const agent of agentList) {
    const cell = app.sandbox.cellForAgent(agent, cells);
    usedCellKeys.add(`${cell.x},${cell.y}`);
  }
  assert.ok(
    usedCellKeys.size >= 2,
    `cei 8 agenți ar fi trebuit distribuiți pe cel puțin 2 celule diferite, au folosit doar: ${[...usedCellKeys]}`
  );
});

test('coliziune pe aceeași celulă: doi agenți din același proiect primesc poziții apropiate, dar diferite (jitter)', async () => {
  const app = await loadApp();
  const cwd = '/proj/collide';
  // proiect cu doar 2 agenți (sub SLOTS_PER_CELL=7) -> exact o celulă ->
  // ambii cad garantat pe aceeași celulă, indiferent de sessionId.
  const agentA = makeAliveAgent({ sessionId: 'agent-x', name: 'ax', cwd });
  const agentB = makeAliveAgent({ sessionId: 'agent-y', name: 'ay', cwd });
  await app.setAgents([agentA, agentB]);

  const positions = app.sandbox.computeAgentPositions([agentA, agentB]);
  const posA = positions.get(agentA.sessionId);
  const posB = positions.get(agentB.sessionId);
  assert.notDeepEqual(posA, posB, 'cei doi agenți de pe aceeași celulă ar fi trebuit despărțiți prin jitter');

  const plotsMap = app.sandbox.allocateCells([{ id: cwd, size: 2 }], new Map());
  const cellCenter = app.sandbox.zoneCellToPixels(plotsMap.get(cwd)[0]);
  const distA = Math.hypot(posA.x - cellCenter.x, posA.y - cellCenter.y);
  const distB = Math.hypot(posB.x - cellCenter.x, posB.y - cellCenter.y);
  // ZONE_JITTER_RADIUS = 12px în app.js; 20px e o margine generoasă, nu o
  // valoare exactă ghicită.
  assert.ok(
    distA <= 20 && distB <= 20,
    `jitter-ul ar fi trebuit să păstreze agenții aproape de centrul celulei, distanțe: ${distA}, ${distB}`
  );
});

test('doi agenți din cwd-uri diferite ajung în zone diferite, nesuprapuse', async () => {
  const app = await loadApp();
  const agentA = makeAliveAgent({ sessionId: 'session-a', name: 'alice', cwd: '/proj/one' });
  const agentB = makeAliveAgent({ sessionId: 'session-b', name: 'bob', cwd: '/proj/two' });
  await app.setAgents([agentA, agentB]);

  const positions = app.sandbox.computeAgentPositions([agentA, agentB]);
  const posA = positions.get(agentA.sessionId);
  const posB = positions.get(agentB.sessionId);
  assert.notDeepEqual(posA, posB, 'agenți din proiecte diferite n-ar fi trebuit să cadă pe aceeași poziție');
});

test('updateZones(): două tick-uri cu ACELAȘI set de agenți -> un singur PUT /api/state, nu unul per tick', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent({ cwd: '/proj/stable' });

  await app.setAgents([agent]); // primul tick: plots gol -> plots populat => schimbare => queueSave()
  assert.equal(app.pendingTimerCount(), 1, 'primul tick cu un proiect nou ar fi trebuit să programeze o salvare');
  await app.runDebounce();
  const putsAfterFirst = app.getPutCalls().length;
  assert.equal(putsAfterFirst, 1, 'primul layout de zone ar fi trebuit salvat o singură dată');

  await app.setAgents([agent]); // al doilea tick, exact același agent -> același layout
  assert.equal(
    app.pendingTimerCount(),
    0,
    'un tick cu exact același layout de zone n-ar fi trebuit să programeze o nouă salvare'
  );
  await app.runDebounce();
  assert.equal(
    app.getPutCalls().length,
    putsAfterFirst,
    'al doilea tick cu același layout n-ar fi trebuit să trimită un PUT suplimentar'
  );
});

test('updateZones(): un agent nou dintr-un proiect nou schimbă layout-ul -> se declanșează un nou PUT', async () => {
  const app = await loadApp();
  const agentA = makeAliveAgent({ sessionId: 'session-a', cwd: '/proj/first' });
  const agentC = makeAliveAgent({ sessionId: 'session-c', cwd: '/proj/second' });

  await app.setAgents([agentA]);
  await app.runDebounce();
  const putsBefore = app.getPutCalls().length;

  await app.setAgents([agentA, agentC]); // proiect nou apărut -> layout diferit
  assert.equal(
    app.pendingTimerCount(),
    1,
    'apariția unui proiect nou ar fi trebuit să schimbe layout-ul și să programeze o salvare'
  );
  await app.runDebounce();
  assert.equal(
    app.getPutCalls().length,
    putsBefore + 1,
    'schimbarea reală de layout ar fi trebuit să trimită exact un PUT suplimentar'
  );
});

test('drawZones(): un strokeRect (contur) per celulă a proiectului, FĂRĂ fill propriu, iar eticheta e doar ultimul segment al căii', async () => {
  const app = await loadApp();
  const cwd = 'C:\\Users\\lucian\\proiecte\\rpgfactory';
  const agentList = [];
  for (let i = 0; i < 8; i++) {
    agentList.push(makeAliveAgent({ sessionId: `agent-${i}`, name: `a${i}`, cwd }));
  }
  await app.setAgents(agentList); // populează state.plots[cwd] cu >= 2 celule

  const plotsMap = app.sandbox.allocateCells([{ id: cwd, size: 8 }], new Map());
  const cells = plotsMap.get(cwd);
  // T-15: dimensiunea unei celule pe ecran e acum CELL_SIZE * camera.zoom
  // (160 la zoom implicit 2), nu ZONE_CELL_SIZE (80, dimensiunea de LUME)
  // direct — worldToScreen aplică zoom-ul.
  const zoom = getZoom(app);
  const cellScreenSize = ZONE_CELL_SIZE * zoom;

  app.fillRectCalls.length = 0;
  app.strokeRectCalls.length = 0;
  app.fillTextCalls.length = 0;

  app.sandbox.drawZones();

  // T-15: drawZones() nu mai desenează niciun fillRect propriu — fundalul de
  // iarbă e global, desenat o singură dată în draw(), înainte de drawZones().
  assert.equal(
    app.fillRectCalls.length,
    0,
    'drawZones() n-ar mai trebui să deseneze niciun fillRect propriu (fill-ul per-celulă a fost eliminat la T-15)'
  );
  const zoneStrokes = app.strokeRectCalls.filter((args) => args[2] === cellScreenSize && args[3] === cellScreenSize);
  assert.equal(
    zoneStrokes.length,
    cells.length,
    `ar fi trebuit exact un strokeRect de ${cellScreenSize}x${cellScreenSize} per celulă a proiectului`
  );

  const label = app.fillTextCalls.find((c) => c.text === 'rpgfactory');
  assert.ok(
    label,
    `eticheta desenată ar fi trebuit să fie ultimul segment al căii ("rpgfactory"), nu calea completă; fillText-uri: ${JSON.stringify(app.fillTextCalls)}`
  );
  assert.ok(
    !app.fillTextCalls.some((c) => c.text === cwd),
    'eticheta n-ar fi trebuit să conțină niciodată calea completă'
  );
});

test('proiect fără nicio celulă alocată: cellForAgent întoarce fallback {x:0,y:0}, fără să arunce', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent({ cwd: '/proj/empty' });
  await app.setAgents([agent]);

  // Obiectul întors de cellForAgent aparține realm-ului vm (Object.prototype
  // diferit de cel din acest fișier) — assert.deepEqual îl respinge ca
  // "same structure but not reference-equal" deși conținutul e identic.
  // Comparăm proprietățile direct, nu obiectul întreg (același tipar de
  // reparație folosit deja la merge-state.test.mjs, T-06).
  assert.doesNotThrow(() => {
    const cell = app.sandbox.cellForAgent(agent, []);
    assert.equal(cell.x, 0);
    assert.equal(cell.y, 0);
  });
  assert.doesNotThrow(() => {
    const cell = app.sandbox.cellForAgent(agent, undefined);
    assert.equal(cell.x, 0);
    assert.equal(cell.y, 0);
  });
});

test('colorForProject e determinist: același cwd primește aceeași culoare la apeluri repetate (nu se testează hex-ul exact)', async () => {
  const app = await loadApp();
  const cwd = '/proj/color-determinism';

  const first = app.sandbox.colorForProject(cwd);
  const second = app.sandbox.colorForProject(cwd);

  assert.deepEqual(first, second, 'colorForProject ar fi trebuit să întoarcă aceeași culoare pentru același cwd');
});

// --- 8b. Teren real: iarbă globală + turn central (T-13/T-15) ---------------
//
// T-15: apa/norii au fost eliminate complet — fundalul e acum iarbă pe tot
// ecranul, independent de zone/agenți (înainte, fără agenți nu exista NICIUN
// fill de iarbă, doar apă). drawZones() nu mai desenează niciun fill propriu
// (doar strokeRect de contur). Un turn static se desenează în centrul hărții,
// ÎNAINTE de zone. Zoom implicit e acum 2 (nu 1).

// Helper: creează un proiect cu >=1 celulă alocată în state.plots, ca
// drawZones() să aibă ce desena (identic cu tiparul folosit deja la testul
// "drawZones(): un dreptunghi per celulă...").
async function setupZoneApp(app, cwd, agentCount = 4) {
  const agentList = [];
  for (let i = 0; i < agentCount; i++) {
    agentList.push(makeAliveAgent({ sessionId: `agent-${i}`, name: `a${i}`, cwd }));
  }
  await app.setAgents(agentList);
}

test('T-15 fundal de iarbă acoperă tot ecranul chiar și FĂRĂ nicio zonă/agent (state.plots gol)', async () => {
  const app = await loadApp();
  // fără setAgents -> state.plots rămâne {} — înainte de T-15, iarba era
  // desenată doar în interiorul zonelor și n-ar fi apărut deloc aici.
  app.triggerTerrainImageLoad();

  app.fillRectCalls.length = 0;
  app.fillRectStyles.length = 0;
  app.sandbox.draw();

  const fullCanvasFillIndex = app.fillRectCalls.findIndex(
    ([x, y, w, h]) => x === 0 && y === 0 && w === CANVAS_W && h === CANVAS_H
  );
  assert.notEqual(
    fullCanvasFillIndex,
    -1,
    'draw() ar fi trebuit să umple tot canvas-ul cu iarbă chiar și fără nicio zonă/agent (T-15)'
  );
  assert.deepEqual(
    app.fillRectStyles[fullCanvasFillIndex],
    { __fakePattern: true },
    'fundalul ar fi trebuit să folosească pattern-ul de iarbă (createPattern), nu o culoare plată'
  );
});

test('T-15 fallback: înainte de onload pe imaginea de teren, fundalul foloseşte o culoare plată, nu pattern-ul', async () => {
  const app = await loadApp();
  // fără triggerTerrainImageLoad() — grassPattern e încă null în app.js.

  app.fillRectCalls.length = 0;
  app.fillRectStyles.length = 0;
  app.sandbox.draw();

  const fullCanvasFillIndex = app.fillRectCalls.findIndex(
    ([x, y, w, h]) => x === 0 && y === 0 && w === CANVAS_W && h === CANVAS_H
  );
  assert.notEqual(
    fullCanvasFillIndex,
    -1,
    'draw() ar fi trebuit să umple tot canvas-ul chiar înainte de onload (fallback), ca să nu rămână ecranul gol'
  );
  const style = app.fillRectStyles[fullCanvasFillIndex];
  assert.notDeepEqual(
    style,
    { __fakePattern: true },
    'înainte de onload, fillStyle NU ar fi trebuit să fie markerul de pattern al ierbii'
  );
});

test('T-15 apă/nori eliminate: drawClouds/updateClouds/waterPattern/cloud1Image/cloud2Image nu mai există, iar draw() produce exact 1 fillRect de fundal', async () => {
  const app = await loadApp();
  app.triggerTerrainImageLoad();

  for (const name of ['drawClouds', 'updateClouds', 'waterPattern', 'cloud1Image', 'cloud2Image']) {
    assert.equal(
      app.sandbox[name],
      undefined,
      `${name} ar fi trebuit eliminat complet din app.js (T-15)`
    );
  }

  app.fillRectCalls.length = 0;
  app.sandbox.draw();
  const fullCanvasFills = app.fillRectCalls.filter(
    ([x, y, w, h]) => x === 0 && y === 0 && w === CANVAS_W && h === CANVAS_H
  );
  assert.equal(
    fullCanvasFills.length,
    1,
    'draw() ar fi trebuit să producă exact UN singur fillRect de fundal (iarbă), nu apă + altceva'
  );
});

test('T-15 zonele nu mai desenează fill propriu: singurul fillRect rămas e cel global de ecran, nu unul per celulă', async () => {
  const app = await loadApp();
  const cwd = '/proj/t15-no-cell-fill';
  await setupZoneApp(app, cwd);
  app.triggerTerrainImageLoad();

  const zoom = getZoom(app);
  const cellScreenSize = ZONE_CELL_SIZE * zoom; // 160 la zoom implicit (2)
  assertClose(cellScreenSize, 160, 'presetup: la zoom implicit, o celulă ar trebui să aibă 160x160px pe ecran');

  app.fillRectCalls.length = 0;
  app.sandbox.draw();

  const cellFills = app.fillRectCalls.filter(([, , w, h]) => w === cellScreenSize && h === cellScreenSize);
  assert.equal(
    cellFills.length,
    0,
    'nu ar mai trebui să existe niciun fillRect cu dimensiunea unei celule de zonă (fill-ul per-celulă a fost eliminat)'
  );

  const fullCanvasFills = app.fillRectCalls.filter(
    ([x, y, w, h]) => x === 0 && y === 0 && w === CANVAS_W && h === CANVAS_H
  );
  assert.equal(fullCanvasFills.length, 1, 'ar fi trebuit să existe exact un fillRect (fundalul global de iarbă)');
});

test('T-15 zoom implicit e 2 (nu 1)', async () => {
  const app = await loadApp();
  const zoom = getZoom(app);
  assertClose(zoom, 2, 'camera.zoom implicit ar fi trebuit să fie 2, nu 1');
});

test('T-15 spawn point rămâne exact în centrul canvas-ului la zoom implicit (2)', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent({ cwd: '/proj/t15-spawn-center' });
  await app.setAgents([agent]); // agentMovement încă gol
  app.advanceMovementTick(); // primul pas: creează intrarea 'spawning' la SPAWN_POINT
  app.triggerImageLoad();

  app.drawImageCalls.length = 0;
  app.sandbox.draw();

  assert.equal(app.drawImageCalls.length, 1, 'presetup: agentul nou ar fi trebuit desenat');
  const [, , , , , dx, dy, dw, dh] = app.drawImageCalls[0];
  const centerX = dx + dw / 2;
  const centerY = dy + dh / 2;
  assertClose(centerX, TEST_SPAWN_POINT.x, 'centrul sprite-ului de apariție nu cade pe centrul canvas-ului (x) la zoom implicit 2');
  assertClose(centerY, TEST_SPAWN_POINT.y, 'centrul sprite-ului de apariție nu cade pe centrul canvas-ului (y) la zoom implicit 2');
});

test('T-15 turn: după onload, se desenează centrat orizontal pe ecran și ANCORAT LA BAZĂ (nu la centru)', async () => {
  const app = await loadApp();
  app.triggerTowerImageLoad();

  app.drawImageCalls.length = 0;
  app.sandbox.draw();

  const towerImg = app.imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('tower'));
  const towerCall = app.drawImageCalls.find((args) => args[0] === towerImg);
  assert.ok(towerCall, 'ar fi trebuit desenat turnul (drawImage cu imaginea towerImage)');

  const [, destX, destY, destW, destH] = towerCall;
  assertClose(destX + destW / 2, CANVAS_CENTER_X, 'turnul nu e centrat orizontal pe centrul ecranului');
  assertClose(
    destY + destH,
    CANVAS_CENTER_Y,
    'baza turnului (destY+destH) nu cade pe centrul vertical al ecranului — verifică ancorarea la BAZĂ, nu la centru'
  );
  assert.notEqual(
    destY + destH / 2,
    CANVAS_CENTER_Y,
    'dacă acest test trece cu egalitate aici, turnul e ancorat la CENTRU, nu la BAZĂ (regresie)'
  );
});

test('T-15 turn: NU se desenează înainte de onload pe imaginea turnului', async () => {
  const app = await loadApp();
  app.sandbox.draw();

  const towerImg = app.imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('tower'));
  const towerCall = app.drawImageCalls.find((args) => args[0] === towerImg);
  assert.equal(towerCall, undefined, 'turnul n-ar fi trebuit desenat înainte de onload');
});

test('T-15 turn: dimensiunile desenate scalează cu zoom-ul camerei (dublate quando zoom-ul se dublează)', async () => {
  const app = await loadApp();
  app.triggerTowerImageLoad();
  const towerImg = app.imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('tower'));

  // zoom out la exact 1 (jumătate din implicitul 2): factor 0.5 => deltaY=500
  app.wheel(CANVAS_CENTER_X, CANVAS_CENTER_Y, 500);
  const zoom1 = getZoom(app);
  assertClose(zoom1, 1, 'presetup: zoom-ul ar fi trebuit să ajungă la exact 1 după acest wheel');

  app.drawImageCalls.length = 0;
  app.sandbox.draw();
  const callAtZoom1 = app.drawImageCalls.find((args) => args[0] === towerImg);
  assert.ok(callAtZoom1, 'presetup: turnul ar fi trebuit desenat la zoom 1');
  const [, , , destWAt1, destHAt1] = callAtZoom1;

  // dublăm zoom-ul (1 -> 2): factor 2 => deltaY = -1000
  app.wheel(CANVAS_CENTER_X, CANVAS_CENTER_Y, -1000);
  const zoom2 = getZoom(app);
  assertClose(zoom2, 2, 'presetup: zoom-ul ar fi trebuit dublat la exact 2');

  app.drawImageCalls.length = 0;
  app.sandbox.draw();
  const callAtZoom2 = app.drawImageCalls.find((args) => args[0] === towerImg);
  assert.ok(callAtZoom2, 'presetup: turnul ar fi trebuit desenat la zoom 2');
  const [, , , destWAt2, destHAt2] = callAtZoom2;

  assertClose(destWAt2, destWAt1 * 2, 'lățimea desenată a turnului nu s-a dublat odată cu zoom-ul camerei');
  assertClose(destHAt2, destHAt1 * 2, 'înălțimea desenată a turnului nu s-a dublat odată cu zoom-ul camerei');
});

test('T-15 ordinea de desenare: turnul se desenează ÎNAINTE de zone (rămâne în spatele lor dacă se suprapun)', async () => {
  const app = await loadApp();
  app.triggerTowerImageLoad();
  const cwd = '/proj/t15-tower-order';
  await app.setAgents([makeAliveAgent({ sessionId: 't15-order-agent', cwd })]);
  app.triggerTerrainImageLoad();

  app.callOrder.length = 0;
  app.sandbox.draw();

  const towerImg = app.imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('tower'));
  const towerIdx = app.callOrder.findIndex((c) => c.type === 'drawImage' && c.args[0] === towerImg);
  // Singurul strokeRect existent la acest moment (fără agent selectat) e cel
  // desenat de drawZones() pentru conturul celulei.
  const zoneStrokeIdx = app.callOrder.findIndex((c) => c.type === 'strokeRect');

  assert.notEqual(towerIdx, -1, 'presetup: turnul ar fi trebuit desenat');
  assert.notEqual(zoneStrokeIdx, -1, 'presetup: zona ar fi trebuit desenată (strokeRect de contur)');
  assert.ok(
    towerIdx < zoneStrokeIdx,
    `turnul ar fi trebuit desenat ÎNAINTE de zone (indice turn=${towerIdx}, indice zonă=${zoneStrokeIdx})`
  );
});

test('decuparea peticului de iarbă: canvas-ul offscreen se creează o singură dată, nu la fiecare draw()', async () => {
  const app = await loadApp();
  await setupZoneApp(app, '/proj/grass-clip-once');

  app.triggerTerrainImageLoad();
  assert.equal(
    app.offscreenCreateCalls.length,
    1,
    'document.createElement("canvas") ar fi trebuit apelat o singură dată, la onload-ul terenului'
  );

  // Mai multe draw()-uri ulterioare NU ar trebui să mai creeze alt canvas
  // offscreen (pattern-ul, odată creat, rămâne fix — vezi raportul coder-ului).
  app.sandbox.draw();
  app.sandbox.draw();
  assert.equal(
    app.offscreenCreateCalls.length,
    1,
    'draw()-uri repetate n-ar fi trebuit să recreeze canvas-ul offscreen de decupare'
  );
});

test('decuparea peticului de iarbă: drawImage pe canvas-ul offscreen folosește exact sx=40, sy=60, sw=64, sh=64', async () => {
  const app = await loadApp();
  await setupZoneApp(app, '/proj/grass-clip-coords');

  app.triggerTerrainImageLoad();

  assert.equal(
    app.offscreenDrawImageCalls.length,
    1,
    'ar fi trebuit exact o chemare drawImage pe contextul canvas-ului offscreen, la onload-ul terenului'
  );
  const [, sx, sy, sw, sh] = app.offscreenDrawImageCalls[0];
  assert.equal(sx, 40, 'sx ar fi trebuit să fie 40, conform raportului coder-ului');
  assert.equal(sy, 60, 'sy ar fi trebuit să fie 60, conform raportului coder-ului');
  assert.equal(sw, 64, 'sw ar fi trebuit să fie 64, conform raportului coder-ului');
  assert.equal(sh, 64, 'sh ar fi trebuit să fie 64, conform raportului coder-ului');
});

// --- 9. Mișcare reală (T-11) --------------------------------------------------
//
// draw()/click-ul citesc acum din `agentMovement` (Map sessionId -> {state,
// x, y, scale, stateAge, ...}), populat și avansat DOAR de
// `updateAgentMovement()`, la nivel de MOVEMENT_TICK_MS=50ms. `setAgents()`
// (folosit peste tot mai sus) NU avansează mișcarea — trebuie apelat explicit
// `app.advanceMovementTick()` (un singur pas) sau `settleMovement(app)`
// (avansează suficient cât orice tranziție să se termine).

test('T-11 apariție: agent nou primește o intrare la SPAWN_POINT, stare spawning, scale pornind de la 0', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent({ cwd: '/proj/t11-spawn' });
  await app.setAgents([agent]); // agentMovement încă gol

  app.advanceMovementTick(); // primul pas: creează intrarea + un increment de scale
  app.sandbox.draw();
  assert.equal(app.arcCalls.length, 1, 'ar fi trebuit exact o intrare nouă în agentMovement (arc desenat necondiționat)');

  app.triggerImageLoad();
  app.drawImageCalls.length = 0;
  app.sandbox.draw();

  assert.equal(app.drawImageCalls.length, 1, 'agentul nou ar fi trebuit desenat (idle) după încărcarea imaginii');
  const [image, , , , , dx, dy, dw, dh] = app.drawImageCalls[0];
  const expectedScale = MOVEMENT_DT * SPAWN_SCALE_RATE; // 0.15, sub pragul de 1
  // T-15: zoom implicit e acum 2 (nu 1) — dimensiunea desenată include și
  // camera.zoom (spriteSize = SPRITE_DEST_SIZE * scale * camera.zoom).
  const zoom = getZoom(app);
  const expectedSize = SPRITE_DEST_SIZE * expectedScale * zoom;
  assert.equal(image, app.pawnIdleImage, 'la apariție (spawning), sprite-ul ar fi trebuit să fie idle, nu de alergare');
  assertClose(dw, expectedSize, 'lățimea sprite-ului nu reflectă scale-ul de apariție așteptat după un singur tick');
  assertClose(dh, expectedSize, 'înălțimea sprite-ului nu reflectă scale-ul de apariție așteptat după un singur tick');
  assertClose(dx, TEST_SPAWN_POINT.x - expectedSize / 2, 'poziția x a agentului nou nu e la SPAWN_POINT');
  assertClose(dy, TEST_SPAWN_POINT.y - expectedSize / 2, 'poziția y a agentului nou nu e la SPAWN_POINT');
});

test('T-11 tranziția spawning -> walking se declanșează exact la scale >= 1 (nu mai devreme)', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent({ cwd: '/proj/t11-transition' });
  await app.setAgents([agent]);
  app.triggerImageLoad();
  app.triggerRunImageLoad();

  const ticksToScaleOne = Math.ceil(1 / (MOVEMENT_DT * SPAWN_SCALE_RATE)); // 7

  for (let i = 0; i < ticksToScaleOne - 1; i++) app.advanceMovementTick();
  app.drawImageCalls.length = 0;
  app.sandbox.draw();
  assert.equal(
    app.drawImageCalls[0][0],
    app.pawnIdleImage,
    'cu o tranziție înainte de scale=1, agentul ar fi trebuit desenat încă cu sprite-ul idle (spawning)'
  );

  app.advanceMovementTick(); // al 7-lea pas: scale atinge exact 1 -> tranziție la walking
  app.drawImageCalls.length = 0;
  app.sandbox.draw();
  assert.equal(
    app.drawImageCalls[0][0],
    app.pawnRunImage,
    'după ce scale-ul atinge 1, agentul ar fi trebuit să treacă la sprite-ul de alergare (walking)'
  );
});

test('T-11 mișcare spre țintă: în walking, distanța până la țintă scade monoton la fiecare pas', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent({ cwd: '/proj/t11-monotone' });
  // Corecție planner (T-12): SPAWN_POINT e acum originea lumii {0,0}, la fel
  // ca prima celulă a primului proiect așezat de allocateCells — cu un
  // singur proiect, ținta lui putea coincide cu SPAWN_POINT (distanță ~0,
  // fără nimic de măsurat "monoton"). Un proiect-ancoră mai mare (2 agenți,
  // sortat înaintea celui testat) ocupă originea, împingând zona testată
  // la un inel mai departe — garantează separare reală.
  const anchor1 = makeAliveAgent({ sessionId: 'anchor-1', cwd: '/proj/anchor', name: 'anchor1' });
  const anchor2 = makeAliveAgent({ sessionId: 'anchor-2', cwd: '/proj/anchor', name: 'anchor2' });
  await app.setAgents([anchor1, anchor2, agent]);
  app.triggerImageLoad();
  app.triggerRunImageLoad();

  const target = agentPixelPosition(app, agent);

  const ticksToScaleOne = Math.ceil(1 / (MOVEMENT_DT * SPAWN_SCALE_RATE));
  for (let i = 0; i < ticksToScaleOne; i++) app.advanceMovementTick(); // acum walking

  function currentPos() {
    app.drawImageCalls.length = 0;
    app.sandbox.draw();
    // Corecție planner (T-12): cu proiectul-ancoră (2 agenți, inserați
    // primii), apelul nostru e al treilea (index 2) în ordinea de inserare
    // a `agentMovement`, nu primul — [0] ar fi urmărit mișcarea tranzitorie
    // a ancorei (care se stabilizează rapid lângă propria țintă, aproape de
    // SPAWN_POINT), nu a agentului testat.
    const [, , , , , dx, dy, dw] = app.drawImageCalls[2];
    return { x: dx + dw / 2, y: dy + dw / 2 };
  }

  let prevDist = Math.hypot(currentPos().x - target.x, currentPos().y - target.y);
  let steps = 0;
  const maxSteps = 500;
  while (prevDist > ARRIVE_RADIUS && steps < maxSteps) {
    app.advanceMovementTick();
    const pos = currentPos();
    const dist = Math.hypot(pos.x - target.x, pos.y - target.y);
    assert.ok(
      dist <= prevDist + 1e-9,
      `distanța până la țintă ar fi trebuit să scadă monoton (era ${prevDist}, a devenit ${dist})`
    );
    prevDist = dist;
    steps++;
  }
  assert.ok(steps > 0, 'presetup: agentul ar fi trebuit să aibă nevoie de cel puțin un pas ca să ajungă la țintă');
  assert.ok(
    steps < maxSteps,
    'agentul nu a ajuns la țintă în numărul maxim de pași testați — verifică WALK_SPEED/ARRIVE_RADIUS'
  );
});

test('T-11 sosire: la distanță < ARRIVE_RADIUS, poziția se fixează EXACT pe țintă și starea devine at-site', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent({ cwd: '/proj/t11-arrive' });
  await app.setAgents([agent]);
  app.triggerImageLoad();
  app.triggerRunImageLoad();

  const target = agentPixelPosition(app, agent);
  settleMovement(app);

  app.drawImageCalls.length = 0;
  app.sandbox.draw();
  const [image, , , , , dx, dy, dw] = app.drawImageCalls[0];
  const actual = { x: dx + dw / 2, y: dy + dw / 2 };

  assertClose(actual.x, target.x, 'poziția finală ar fi trebuit să fie EXACT pe țintă (x), nu doar apropiată');
  assertClose(actual.y, target.y, 'poziția finală ar fi trebuit să fie EXACT pe țintă (y), nu doar apropiată');
  assert.equal(image, app.pawnIdleImage, 'la sosire (at-site), sprite-ul ar fi trebuit să revină la idle');
});

test('T-11 recalculare țintă în at-site: dacă ținta se schimbă, agentul revine în walking', async () => {
  const app = await loadApp();
  const cwd = '/proj/t11-retarget';
  const agentA = makeAliveAgent({ sessionId: 'agent-a', name: 'a', cwd });
  await app.setAgents([agentA]);
  app.triggerImageLoad();
  app.triggerRunImageLoad();

  settleMovement(app); // agentA ajunge at-site, singur în proiect (fără jitter)

  app.drawImageCalls.length = 0;
  app.sandbox.draw();
  assert.equal(
    app.drawImageCalls[0][0],
    app.pawnIdleImage,
    'presetup: agentul ar fi trebuit să fie at-site (idle) înainte de al doilea agent'
  );

  // Al doilea agent din ACELAȘI proiect cade probabil pe aceeași celulă
  // (SLOTS_PER_CELL permite mai mulți pe o celulă) -> grup de 2 -> jitter ->
  // ținta lui agentA se schimbă față de poziția single-agent de dinainte.
  const agentB = makeAliveAgent({ sessionId: 'agent-b', name: 'b', cwd });
  await app.setAgents([agentA, agentB]);

  const oldTarget = agentPixelPosition(app, agentA);
  const newTargets = app.sandbox.computeAgentPositions([agentA, agentB]);
  const newTargetWorld = newTargets.get(agentA.sessionId);
  // T-12: `oldTarget` e deja convertit în coordonate de ECRAN (agentPixelPosition
  // aplică worldToScreen) — trebuie comparat cu ceva din același sistem de
  // coordonate, altfel diferența de offset (centrul canvas-ului) ar face
  // comparația mereu "diferită", indiferent dacă jitter-ul chiar a schimbat
  // ceva sau nu.
  const newTarget = app.sandbox.worldToScreen(newTargetWorld.x, newTargetWorld.y);
  assert.notDeepEqual(
    newTarget,
    oldTarget,
    'presetup: ținta lui agentA ar fi trebuit să se schimbe odată cu apariția lui agentB pe aceeași celulă (jitter)'
  );

  app.advanceMovementTick(); // updateAgentMovement() vede noua țintă -> at-site -> walking
  app.drawImageCalls.length = 0;
  app.sandbox.draw();

  assert.equal(
    app.drawImageCalls[0][0],
    app.pawnRunImage,
    'după ce ținta s-a schimbat, agentul at-site ar fi trebuit să revină în walking (sprite de alergare)'
  );
});

test('T-11 plecare critică: agent arhivat imediat după apariție (încă spawning) trece direct în leaving, din poziția/scale curente', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent({ cwd: '/proj/t11-early-leave' });
  await app.setAgents([agent]);
  app.triggerImageLoad();
  app.triggerRunImageLoad();

  app.advanceMovementTick(); // 1 pas: încă spawning, scale mic (0.15)
  app.drawImageCalls.length = 0;
  app.sandbox.draw();
  const beforeArchive = app.drawImageCalls[0];
  // T-15: zoom implicit e acum 2 (nu 1) — dw include camera.zoom, deci
  // trebuie împărțit și la zoom (nu doar la SPRITE_DEST_SIZE) ca să obținem
  // `scale`-ul pur, comparabil cu SPAWN_SCALE_RATE/LEAVING_SHRINK_RATE.
  const zoom = getZoom(app);
  const scaleBefore = beforeArchive[7] / (SPRITE_DEST_SIZE * zoom);
  assert.ok(
    scaleBefore > 0 && scaleBefore < 1,
    'presetup: agentul ar fi trebuit prins încă în spawning (scale sub 1)'
  );

  // Arhivare/dispariție imediată (simulăm procesul mort/arhivat: dispare din
  // /api/agents înainte să apuce să treacă prin walking/at-site).
  await app.setAgents([]);

  app.advanceMovementTick(); // 1 pas: ar trebui să treacă direct în leaving

  app.drawImageCalls.length = 0;
  app.sandbox.draw();
  const afterLeave = app.drawImageCalls[0];
  assert.ok(
    afterLeave,
    'agentul arhivat imediat după apariție ar fi trebuit tot desenat (în leaving), nu dispărut brusc'
  );
  assert.equal(
    afterLeave[0],
    app.pawnRunImage,
    'în leaving, sprite-ul ar fi trebuit să fie cel de alergare, nu idle'
  );

  const scaleAfter = afterLeave[7] / (SPRITE_DEST_SIZE * zoom);
  const expectedScaleAfter = Math.max(0, scaleBefore - MOVEMENT_DT * LEAVING_SHRINK_RATE);
  assertClose(
    scaleAfter,
    expectedScaleAfter,
    'scale-ul la plecare ar fi trebuit să continue de la scale-ul avut la arhivare, nu resetat la 0 sau la 1'
  );
});

// T-11: BUG suspectat — brief-ul cere ca intrarea să dispară din
// agentMovement doar când AMBELE praguri sunt atinse (scale<=0 ȘI poziția a
// ajuns la SPAWN_POINT). Codul din updateAgentMovement() folosește însă
// `if (arrived || entry.scale <= 0) { agentMovement.delete(...) }` — un SAU,
// nu un ȘI. Cum LEAVING_SHRINK_RATE (2.2/s) face scale-ul să atingă 0 în
// ~10 tick-uri (foarte rapid), iar drumul de întoarcere la SPAWN_POINT poate
// dura mult mai mult, un agent aflat departe de SPAWN_POINT dispare din
// desen când scale-ul ajunge la 0, deși încă nu a "ajuns acasă" — adică
// dispare brusc undeva pe ecran, nu în colț, contrar descrierii din brief.
// Acest test documentează comportamentul ACTUAL (eșuează dacă presupunerea
// de mai sus e corectă) — planner-ul decide dacă e un bug de reparat sau o
// simplificare acceptată.
//
// T-16b — redesign (docs/handoff/T-16b-tester.md): (0,0) e rezervat acum
// pentru TOATE proiectele (T-16), deci un singur proiect-"ancoră" de 2 agenți
// pe aceeași celulă NU mai garantează plecare rapidă pentru ambii: jitter-ul
// (ZONE_JITTER_RADIUS=12) e aplicat pe un unghi ABSOLUT (2*pi*i/n), nu radial
// față de origine — într-un grup de 2, un singur agent se apropie de origine
// (80-12=68px, 10 tick-uri), celălalt se depărtează (80+12=92px, 14
// tick-uri) — exact ce a stricat testul dinaintea acestei predări (ancora
// "de rezervă" avea nevoie de 14 tick-uri, mai mult decât cele 11 necesare
// ca scale-ul să ajungă la 0, deci rămânea desenată alături de agentul
// testat: arcCalls.length === 2, nu 1).
//
// Soluție aleasă (alternativă la "ancoră mai mare/mai multe inele" sugerată
// în brief, motivată aici): 4 proiecte-"filler" SEPARATE, fiecare cu un
// singur agent (fără grupare -> fără jitter) — ocupă exact cele 4 celule
// din ring(1) (singurele rămase după excluderea (0,0) de T-16), la distanță
// EXACTĂ, calculabilă, de 80 fiecare. Asta împinge proiectul TESTAT în
// ring(2) (prima celulă liberă acolo, distanță 160) — dublu față de fillere,
// deci cu o marjă de tick-uri sănătoasă (nu doar 1 tick, cum ar fi cazul cu
// un singur proiect fără niciun filler). Fillerele sunt inserate ÎNAINTE de
// agentul testat în array-ul dat lui setAgents(); toate au size=1 (egal cu
// al agentului testat) — la egalitate, ordinea e păstrată de
// `Array.prototype.sort` (stabil, garantat de spec din ES2019, folosit deja
// de app.js la sortarea proiectelor) — deci fillerele tot ocupă ring(1)
// înaintea agentului testat, fără să fie nevoie de dimensiuni artificiale.
test('T-11 (bug suspectat) plecare: intrarea NU ar trebui să dispară doar pentru că scale-ul a ajuns la 0, dacă poziția e încă departe de SPAWN_POINT', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent({ cwd: '/proj/t11-far-leave' });
  const fillers = [0, 1, 2, 3].map((i) =>
    makeAliveAgent({ sessionId: `filler-${i}`, cwd: `/proj/t11-far-leave-filler-${i}`, name: `filler${i}` })
  );
  const liveAgents = [...fillers, agent];
  await app.setAgents(liveAgents);
  app.triggerImageLoad();
  app.triggerRunImageLoad();

  settleMovement(app); // toți (fillere + agent) ajung at-site, la ținta din propria zonă

  // Poziții de LUME calculate cu funcția de producție folosită și de
  // updateAgentMovement() — nu ghicite. SPAWN_POINT e originea lumii (0,0),
  // deci distanța față de el e direct hypot(x,y) (fără conversia la ecran,
  // care ar amesteca world-space cu WALK_SPEED, definit tot în world-space).
  const worldPositions = app.sandbox.computeAgentPositions(liveAgents);
  const targetWorld = worldPositions.get(agent.sessionId);
  assert.ok(targetWorld, 'presetup: agentul testat ar fi trebuit să primească o poziție de zonă');
  const distFromSpawn = Math.hypot(targetWorld.x, targetWorld.y);
  assert.ok(
    distFromSpawn > ARRIVE_RADIUS,
    'presetup: ținta trebuie să fie suficient de departe de SPAWN_POINT ca testul să aibă sens'
  );

  const fillerDistances = fillers.map((f) => {
    const pos = worldPositions.get(f.sessionId);
    assert.ok(pos, `presetup: filler-ul ${f.sessionId} ar fi trebuit să primească o poziție de zonă`);
    return Math.hypot(pos.x, pos.y);
  });
  const maxFillerDist = Math.max(...fillerDistances);
  assert.ok(
    maxFillerDist < distFromSpawn,
    'presetup: toate proiectele-filler trebuie să fie strict mai aproape de SPAWN_POINT decât proiectul testat (altfel n-au cum să fi "ocupat" ring(1) în locul lui)'
  );

  await app.setAgents([]); // toți (fillere + agent) devin 'leaving', din poziția lor curentă (at-site)

  const ticksForScaleZero = Math.ceil(1 / (MOVEMENT_DT * LEAVING_SHRINK_RATE)) + 1;
  const ticksNeededToArrive = Math.ceil(distFromSpawn / (WALK_SPEED * MOVEMENT_DT));
  const ticksForFillersToArrive = Math.ceil(maxFillerDist / (WALK_SPEED * MOVEMENT_DT));
  const waitTicks = Math.max(ticksForScaleZero, ticksForFillersToArrive);

  assert.ok(
    ticksForScaleZero < ticksNeededToArrive,
    'presetup: scale-ul trebuie să ajungă la 0 mult înainte ca agentul testat să fi parcurs drumul înapoi la SPAWN_POINT'
  );
  assert.ok(
    waitTicks < ticksNeededToArrive,
    'presetup: TOATE proiectele-filler trebuie să termine complet plecarea (ajunse ȘI scale=0) cu mult înainte ca agentul testat să ajungă înapoi la SPAWN_POINT — altfel testul nu poate izola comportamentul agentului testat de al fillerelor'
  );

  for (let i = 0; i < waitTicks; i++) app.advanceMovementTick();

  // Aserția centrală (bug suspectat, T-11), verificată END-TO-END (nu doar
  // din calcul): la acest tick, toate fillerele au atins deja AMBELE praguri
  // (arrived && scale<=0, waitTicks >= ticksForFillersToArrive) — dacă tot
  // ar mai apărea vreunul, arc/fillText de mai jos n-ar mai izola
  // comportamentul agentului testat. Agentul testat, în schimb, are deja
  // scale===0 (waitTicks >= ticksForScaleZero), dar NU a ajuns încă la
  // SPAWN_POINT (waitTicks < ticksNeededToArrive, verificat mai sus) — dacă
  // regula din updateAgentMovement() ar fi SAU (nu ȘI), intrarea lui ar fi
  // fost deja ștearsă la acest tick, la fel ca a fillerelor, și
  // `arcCalls.length` ar fi 0, nu 1.
  app.arcCalls.length = 0;
  app.fillTextCalls.length = 0;
  app.sandbox.draw();
  assert.equal(
    app.arcCalls.length,
    1,
    'indicatorul de status tot ar trebui desenat — intrarea nu ar trebui ștearsă doar pentru scale===0 (dacă e 0, toate fillerele au dispărut deja corect, dar și agentul testat; dacă e >1, vreun filler n-a dispărut încă — verifică presetup-ul de mai sus)'
  );
  assert.ok(
    app.fillTextCalls.some((c) => c.text === agent.name),
    'numele agentului testat tot ar trebui desenat — dacă acest test eșuează, codul șterge intrarea la primul prag atins (SAU), nu la ambele (ȘI), cum cere brief-ul'
  );
  assert.ok(
    fillers.every((f) => !app.fillTextCalls.some((c) => c.text === f.name)),
    'numele niciunui filler nu ar mai trebui desenat — ar fi trebuit să dispară complet din agentMovement până la acest tick'
  );
});

test('T-11 plecare — după suficiente tick-uri (ambele praguri atinse), agentul dispare complet din desen', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent({ cwd: '/proj/t11-full-leave' });
  await app.setAgents([agent]);
  app.triggerImageLoad();
  app.triggerRunImageLoad();

  settleMovement(app);
  await app.setAgents([]);
  settleMovement(app, 800); // suficient pentru orice distanță în canvas-ul 720x720

  app.drawImageCalls.length = 0;
  app.arcCalls.length = 0;
  app.sandbox.draw();

  assert.equal(app.drawImageCalls.length, 0, 'după plecarea completă, agentul n-ar mai trebui desenat deloc');
  assert.equal(app.arcCalls.length, 0, 'după plecarea completă, agentul n-ar mai trebui desenat deloc (arc)');
});

test('T-11 agent în leaving tot produce drawImage chiar dacă nu mai apare în /api/agents', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent({ cwd: '/proj/t11-leaving-drawn' });
  await app.setAgents([agent]);
  app.triggerImageLoad();
  app.triggerRunImageLoad();
  settleMovement(app);

  await app.setAgents([]); // dispare din /api/agents
  app.advanceMovementTick(); // trece în leaving

  app.drawImageCalls.length = 0;
  app.sandbox.draw();
  assert.equal(
    app.drawImageCalls.length,
    1,
    'un agent în leaving, deși absent din /api/agents, ar fi trebuit tot desenat'
  );
});

test('T-11 alegerea sprite-ului: walking/leaving -> pawn-run, spawning/at-site -> pawn-idle', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent({ cwd: '/proj/t11-sprite-choice' });
  await app.setAgents([agent]);
  app.triggerImageLoad();
  app.triggerRunImageLoad();

  // spawning
  app.advanceMovementTick();
  app.drawImageCalls.length = 0;
  app.sandbox.draw();
  assert.equal(app.drawImageCalls[0][0], app.pawnIdleImage, 'spawning ar fi trebuit desenat cu sprite-ul idle');

  // walking
  const ticksToScaleOne = Math.ceil(1 / (MOVEMENT_DT * SPAWN_SCALE_RATE));
  for (let i = 1; i < ticksToScaleOne; i++) app.advanceMovementTick();
  app.drawImageCalls.length = 0;
  app.sandbox.draw();
  assert.equal(app.drawImageCalls[0][0], app.pawnRunImage, 'walking ar fi trebuit desenat cu sprite-ul de alergare');

  // at-site
  settleMovement(app);
  app.drawImageCalls.length = 0;
  app.sandbox.draw();
  assert.equal(app.drawImageCalls[0][0], app.pawnIdleImage, 'at-site ar fi trebuit desenat cu sprite-ul idle');

  // leaving
  await app.setAgents([]);
  app.advanceMovementTick();
  app.drawImageCalls.length = 0;
  app.sandbox.draw();
  assert.equal(app.drawImageCalls[0][0], app.pawnRunImage, 'leaving ar fi trebuit desenat cu sprite-ul de alergare');
});

test('T-11 hit-test în mișcare: click pe poziția AFIȘATĂ curentă (nu pe ținta finală) selectează agentul', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent({ cwd: '/proj/t11-hit-test-moving', name: 'runner' });
  // Corecție planner (T-12): vezi comentariul din testul "mișcare monotonă" —
  // proiect-ancoră mai mare ocupă originea (=SPAWN_POINT), garantând că
  // ținta agentului testat e efectiv departe de punctul de apariție.
  const anchor1 = makeAliveAgent({ sessionId: 'anchor-1', cwd: '/proj/anchor', name: 'anchor1' });
  const anchor2 = makeAliveAgent({ sessionId: 'anchor-2', cwd: '/proj/anchor', name: 'anchor2' });
  await app.setAgents([anchor1, anchor2, agent]);
  app.triggerImageLoad();
  app.triggerRunImageLoad();

  const target = agentPixelPosition(app, agent);

  // Câteva tick-uri: agentul e sigur în walking, dar probabil încă departe
  // de țintă (n-a ajuns), deci poziția curentă != poziția finală.
  // Corecție planner (T-12): în 'spawning' (primele ~ticksToScaleOne
  // tick-uri) agentul NU se mișcă deloc — stă fix la SPAWN_POINT, doar
  // `scale` crește (vezi app.js). Cu doar +2 tick-uri de mers după aceea
  // (~14px din 80px totali), poziția curentă cădea prea aproape de
  // SPAWN_POINT — unde stă și proiectul-ancoră — și clickul selecta
  // ancora, nu `runner`. +6 tick-uri de mers (~42px) garantează distanță
  // >CIRCLE_RADIUS față de AMBELE capete (ancoră și țintă).
  const ticksToScaleOne = Math.ceil(1 / (MOVEMENT_DT * SPAWN_SCALE_RATE));
  for (let i = 0; i < ticksToScaleOne + 6; i++) app.advanceMovementTick();

  app.drawImageCalls.length = 0;
  app.sandbox.draw();
  // `agentMovement` e un Map care păstrează ordinea de inserare — cu 3 agenți
  // acum (2 ancoră + `agent`), apelul nostru e al TREILEA (index 2), nu
  // primul. `drawImageCalls[0]` ar fi luat poziția unui agent-ancoră, complet
  // nelegată de `target`/`agent`.
  const [, , , , , dx, dy, dw] = app.drawImageCalls[2];
  const currentPos = { x: dx + dw / 2, y: dy + dw / 2 };

  const distToTarget = Math.hypot(currentPos.x - target.x, currentPos.y - target.y);
  assert.ok(
    distToTarget > CIRCLE_RADIUS,
    'presetup: agentul trebuie să fie încă vizibil departe de țintă pentru ca testul să aibă sens'
  );

  // click pe țintă (unde agentul încă NU a ajuns) -> nu ar trebui să-l selecteze
  app.click(target.x, target.y);
  assert.ok(
    !app.fakeDetails.innerHTML.includes('runner'),
    'click pe ținta finală (unde agentul încă nu a ajuns) n-ar fi trebuit să-l selecteze'
  );

  // click pe poziția curentă -> ar trebui să-l selecteze
  app.click(currentPos.x, currentPos.y);
  assert.ok(
    app.fakeDetails.innerHTML.includes('runner'),
    'click pe poziția AFIȘATĂ curentă a agentului ar fi trebuit să-l selecteze'
  );
});

// --- 10. Camera 2D: zoom/pan/resize (T-12) -----------------------------------

test('T-12 worldToScreen/screenToWorld sunt inverse una alteia (la zoom != 1 și camera.x/y != 0)', async () => {
  const app = await loadApp();

  // Aducem camera într-o stare cu zoom != 1 ȘI translație != 0: un zoom
  // ancorat pe un punct din afara centrului schimbă ambele.
  app.wheel(500, 200, -600);
  app.mouseDown(300, 300);
  app.mouseMove(250, 340);
  app.mouseUp(250, 340);

  const zoom = getZoom(app);
  assert.notEqual(zoom, 1, 'presetup: zoom-ul ar fi trebuit să difere de 1 după wheel');

  const points = [
    { x: 0, y: 0 },
    { x: 123.5, y: -47.25 },
    { x: -900, y: 400 },
    { x: 37, y: 37 },
  ];

  for (const p of points) {
    const screen = app.sandbox.worldToScreen(p.x, p.y);
    const back = app.sandbox.screenToWorld(screen.x, screen.y);
    assertClose(back.x, p.x, `screenToWorld(worldToScreen(${p.x},${p.y})).x nu revine la valoarea inițială`);
    assertClose(back.y, p.y, `screenToWorld(worldToScreen(${p.x},${p.y})).y nu revine la valoarea inițială`);
  }
});

test('T-12 spawn în centru la camera implicită: worldToScreen(0,0) = centrul exact al canvas-ului', async () => {
  const app = await loadApp();
  const center = app.sandbox.worldToScreen(0, 0);
  assert.equal(center.x, CANVAS_CENTER_X, 'la camera implicită, originea lumii nu cade exact pe centrul orizontal al ecranului');
  assert.equal(center.y, CANVAS_CENTER_Y, 'la camera implicită, originea lumii nu cade exact pe centrul vertical al ecranului');
});

test('T-12 zoom ancorat pe cursor: punctul de lume de sub cursor rămâne același înainte/după schimbarea zoom-ului', async () => {
  const app = await loadApp();
  const cursorX = 550; // deliberat NU centrul ecranului (360,360)
  const cursorY = 150;

  const worldBefore = app.sandbox.screenToWorld(cursorX, cursorY);

  app.wheel(cursorX, cursorY, -300); // zoom in, ancorat pe (cursorX, cursorY)

  const zoomAfter = getZoom(app);
  assert.notEqual(zoomAfter, 1, 'presetup: zoom-ul ar fi trebuit să se schimbe după wheel');

  const worldAfter = app.sandbox.screenToWorld(cursorX, cursorY);
  assertClose(worldAfter.x, worldBefore.x, 'punctul de lume de sub cursor s-a mutat după zoom (x) — zoom-ul nu e ancorat pe cursor');
  assertClose(worldAfter.y, worldBefore.y, 'punctul de lume de sub cursor s-a mutat după zoom (y) — zoom-ul nu e ancorat pe cursor');
});

test('T-12 clamp de zoom: wheel repetat în aceeași direcție nu depășește MIN_ZOOM/MAX_ZOOM', async () => {
  const app = await loadApp();

  for (let i = 0; i < 50; i++) app.wheel(360, 360, -1000); // zoom in agresiv, repetat
  const zoomedIn = getZoom(app);
  assert.ok(zoomedIn <= MAX_ZOOM + 1e-9, `zoom-ul a depășit MAX_ZOOM (${MAX_ZOOM}): ${zoomedIn}`);

  for (let i = 0; i < 50; i++) app.wheel(360, 360, 1000); // zoom out agresiv, repetat
  const zoomedOut = getZoom(app);
  assert.ok(zoomedOut >= MIN_ZOOM - 1e-9, `zoom-ul a coborât sub MIN_ZOOM (${MIN_ZOOM}): ${zoomedOut}`);
});

test('T-12 pan: punctul de lume de sub cursor la mousedown rămâne sub cursor după mousemove, inclusiv la zoom != 1', async () => {
  const app = await loadApp();

  // Zoom cu cursorul EXACT în centrul ecranului -> schimbă doar zoom-ul, nu
  // și camera.x/y (formula din app.js: (cursorX - canvas.width/2) === 0),
  // ca să izolăm strict efectul împărțirii la camera.zoom din pan, fără
  // interferența unei translații pre-existente.
  app.wheel(CANVAS_CENTER_X, CANVAS_CENTER_Y, -700);
  const zoom = getZoom(app);
  assert.notEqual(zoom, 1, 'presetup: zoom-ul ar fi trebuit schimbat înainte de testul de pan');

  const startX = 200;
  const startY = 500;
  const worldUnderCursorAtStart = app.sandbox.screenToWorld(startX, startY);

  app.mouseDown(startX, startY);
  const endX = 260; // delta cunoscut: +60
  const endY = 470; // delta cunoscut: -30
  app.mouseMove(endX, endY);

  const worldUnderCursorNow = app.sandbox.screenToWorld(endX, endY);
  assertClose(
    worldUnderCursorNow.x,
    worldUnderCursorAtStart.x,
    'la pan, punctul de lume de sub cursor nu a rămas fix (x) — verifică împărțirea la camera.zoom în handler-ul de mousemove'
  );
  assertClose(
    worldUnderCursorNow.y,
    worldUnderCursorAtStart.y,
    'la pan, punctul de lume de sub cursor nu a rămas fix (y) — verifică împărțirea la camera.zoom în handler-ul de mousemove'
  );

  app.mouseUp(endX, endY);
});

test('T-12 prag drag-vs-click: mișcare sub 4px tot selectează agentul de sub cursor', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent({ cwd: '/proj/t12-threshold-under', name: 'threshold-under' });
  await app.setAgents([agent]);
  settleMovement(app);
  const pos = agentPixelPosition(app, agent);

  app.mouseDown(pos.x, pos.y);
  app.mouseMove(pos.x + 2, pos.y + 1); // distanță ~2.24px, sub pragul de 4px
  app.mouseUp(pos.x + 2, pos.y + 1);

  assert.ok(
    app.fakeDetails.innerHTML.includes(agent.name),
    'o mișcare sub pragul de 4px ar fi trebuit tot să selecteze agentul de sub cursor'
  );
});

test('T-12 prag drag-vs-click: mișcare peste 4px NU selectează, chiar dacă punctul final e peste agent', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent({ cwd: '/proj/t12-threshold-over', name: 'threshold-over' });
  await app.setAgents([agent]);
  settleMovement(app);
  const pos = agentPixelPosition(app, agent);

  app.mouseDown(pos.x - 50, pos.y - 50); // start departe de agent
  app.mouseMove(pos.x, pos.y); // se termină exact peste agent, dar distanța > 4px
  app.mouseUp(pos.x, pos.y);

  assert.equal(
    app.fakeDetails.innerHTML,
    '',
    'o mișcare peste pragul de 4px n-ar fi trebuit să selecteze, chiar dacă se termină peste agent'
  );
});

test('T-12 resize: poziții calculate ulterior reflectă noile dimensiuni ale canvas-ului', async () => {
  const app = await loadApp();
  const beforeCenter = app.sandbox.worldToScreen(0, 0);
  // Comparăm proprietăți individuale, nu obiectul întreg: `beforeCenter` e un
  // obiect din realm-ul vm, `assert.deepEqual` cu un literal din acest
  // fișier a fost deja o sursă de fals-negative în suita asta (vezi
  // comentariul de la testul cellForAgent, secțiunea T-10).
  assert.equal(beforeCenter.x, CANVAS_CENTER_X);
  assert.equal(beforeCenter.y, CANVAS_CENTER_Y);

  app.resize(1000, 400);

  const afterCenter = app.sandbox.worldToScreen(0, 0);
  assert.equal(afterCenter.x, 500, 'după resize, worldToScreen(0,0).x ar fi trebuit să reflecte noua lățime (1000/2)');
  assert.equal(afterCenter.y, 200, 'după resize, worldToScreen(0,0).y ar fi trebuit să reflecte noua înălțime (400/2)');
});

test('T-12/T-15 dimensiunile desenate ale sprite-ului scalează cu zoom-ul camerei (dw/dh înjumătățite la zoom=1, față de implicitul 2)', async () => {
  const app = await loadApp();
  const agent = makeAliveAgent({ cwd: '/proj/t12-zoom-scale' });
  await app.setAgents([agent]);
  app.triggerImageLoad();
  app.triggerRunImageLoad();
  settleMovement(app);

  // T-15: zoom implicit e acum 2 (nu 1) — presetup-ul verifică asta explicit
  // înainte de a măsura orice, ca testul să rămână corect indiferent care
  // era valoarea implicită.
  const zoomBefore = getZoom(app);
  assertClose(zoomBefore, 2, 'presetup: zoom-ul implicit ar fi trebuit să fie 2 (T-15)');

  app.drawImageCalls.length = 0;
  app.sandbox.draw();
  const dwBefore = app.drawImageCalls[0][7];
  const dhBefore = app.drawImageCalls[0][8];
  assertClose(dwBefore, SPRITE_DEST_SIZE * zoomBefore, 'presetup: la zoom implicit (2), dw ar fi trebuit să fie SPRITE_DEST_SIZE*2');

  // Zoom out la exact jumătate (factor 0.5 => deltaY=500), cu cursorul în
  // centrul ecranului -> nu deplasează camera.x/y, izolând strict efectul
  // zoom-ului asupra dimensiunii desenate.
  app.wheel(CANVAS_CENTER_X, CANVAS_CENTER_Y, 500);
  const zoomAfter = getZoom(app);
  assertClose(zoomAfter, zoomBefore / 2, 'presetup: zoom-ul ar fi trebuit înjumătățit după acest wheel');

  app.drawImageCalls.length = 0;
  app.sandbox.draw();
  const dwAfter = app.drawImageCalls[0][7];
  const dhAfter = app.drawImageCalls[0][8];

  assertClose(dwAfter, dwBefore / 2, 'lățimea desenată a sprite-ului n-a scalat cu zoom-ul camerei (dw)');
  assertClose(dhAfter, dhBefore / 2, 'înălțimea desenată a sprite-ului n-a scalat cu zoom-ul camerei (dh)');
});

// --- 11. Decorațiuni de zonă (tufe/stânci) (T-14) ----------------------------
//
// T-15: norii (drawClouds/updateClouds/CLOUD_DEST_*) au fost eliminați din
// app.js — testele lor din T-14 au fost eliminate mai jos (vezi raportul
// tester T-15). Decorațiile de zonă (tufe/stânci) NU sunt afectate de T-15,
// rămân neschimbate.
//
// Constante citite direct din public/app.js (T-14-coder-raport.md), nu
// ghicite — la fel ca SPRITE_FRAME_SIZE/ZONE_CELL_SIZE mai sus în acest
// fișier.
const BUSH_FRAME_SIZE = 128; // 8 cadre de 128x128, așezate orizontal
// Corecție planner (T-14b): valorile reale au fost micșorate de coder ca să
// nu se mai suprapună decorația cu sprite-ul agentului (vezi
// docs/handoff/T-14b-coder-raport.md) — 40/4 erau geometric imposibile de
// făcut să nu se suprapună, dat fiind un cell de 80px cu sprite de 56px
// centrat. Copia asta din test trebuie ținută sincronă cu app.js.
const DECORATION_DEST_SIZE = 8;
const DECORATION_OFFSET = 2; // px

// Caută, printre proiecte-fantomă cu un singur agent/o singură celulă, unul a
// cărui `decorationForCell` produce tipul cerut (`'bush'` sau `'rock'`).
// Brută-forțăm pe cwd-uri diferite în loc să presupunem un cwd anume, ca
// testul să rămână corect indiferent de funcția de hash folosită intern —
// singurul lucru garantat e determinismul (testat separat mai jos).
function findCellWithDecoration(app, type, maxTries = 500) {
  for (let i = 0; i < maxTries; i++) {
    const cwd = `/proj/t14-deco-${type}-${i}`;
    const plotsMap = app.sandbox.allocateCells([{ id: cwd, size: 1 }], new Map());
    const cell = plotsMap.get(cwd)[0];
    const decoration = app.sandbox.decorationForCell(cwd, cell);
    if (decoration && decoration.type === type) {
      return { cwd, cell, decoration };
    }
  }
  throw new Error(`nu am găsit nicio celulă cu decorație de tip "${type}" în ${maxTries} încercări`);
}

test('T-14 decorationForCell e determinist: același (projectId, celulă) dă mereu același rezultat', async () => {
  const { sandbox } = await loadApp();
  const cases = [
    { projectId: '/proj/alpha', cell: { x: 0, y: 0 } },
    { projectId: '/proj/alpha', cell: { x: 3, y: 7 } },
    { projectId: 'C:\\Users\\lucian\\proiecte\\rpgfactory', cell: { x: 12, y: 1 } },
  ];
  for (const { projectId, cell } of cases) {
    const first = sandbox.decorationForCell(projectId, cell);
    const second = sandbox.decorationForCell(projectId, cell);
    assert.deepEqual(
      second,
      first,
      `decorationForCell(${projectId}, ${JSON.stringify(cell)}) nu e stabil la apeluri repetate`
    );
  }
});

test('T-14 distribuția bush/rock/gol pe un eșantion mare (300 celule) e aproximativ echilibrată (20%-45% fiecare)', async () => {
  const { sandbox } = await loadApp();
  const projectId = '/proj/t14-distribution';
  const counts = { bush: 0, rock: 0, empty: 0 };

  for (let x = 0; x < 30; x++) {
    for (let y = 0; y < 10; y++) {
      const decoration = sandbox.decorationForCell(projectId, { x, y });
      if (!decoration) counts.empty++;
      else if (decoration.type === 'bush') counts.bush++;
      else if (decoration.type === 'rock') counts.rock++;
      else assert.fail(`tip de decorație necunoscut: ${JSON.stringify(decoration)}`);
    }
  }

  const total = 300;
  assert.equal(counts.bush + counts.rock + counts.empty, total, 'presetup: fiecare din cele 300 de celule ar fi trebuit clasificată');
  for (const [label, count] of Object.entries(counts)) {
    const ratio = count / total;
    assert.ok(
      ratio >= 0.2 && ratio <= 0.45,
      `categoria "${label}" are ${count}/${total} (${(ratio * 100).toFixed(1)}%), în afara intervalului 20%-45%`
    );
  }
});

test('T-14 fără onload pe imaginile noi, drawZones() nu desenează nicio decorație (0 drawImage) și nu aruncă', async () => {
  const app = await loadApp();
  const cwd = '/proj/t14-no-load';
  const agentList = [];
  for (let i = 0; i < 8; i++) {
    agentList.push(makeAliveAgent({ sessionId: `t14-agent-${i}`, name: `t14a${i}`, cwd }));
  }
  await app.setAgents(agentList); // populează state.plots[cwd] cu >= 2 celule

  app.drawImageCalls.length = 0;
  assert.doesNotThrow(() => app.sandbox.drawZones());
  assert.equal(
    app.drawImageCalls.length,
    0,
    'fără onload pe bush/rock, drawZones() n-ar fi trebuit să cheme deloc drawImage'
  );
});

test('T-14 tufa animată: sx-ul desenat pentru tufă ciclează 0..7 × 128px, la fel ca sprite-ul de agent', async () => {
  const app = await loadApp();
  const { cwd } = findCellWithDecoration(app, 'bush');
  await app.setAgents([makeAliveAgent({ sessionId: 't14-bush-agent', cwd })]);
  app.triggerBushImageLoad();

  const bushImg = app.imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('bush'));
  assert.ok(bushImg, 'presetup: nu am găsit imaginea de tufă instanțiată');

  const expectedFrames = [1, 2, 3, 4, 5, 6, 7, 0, 1, 2];
  const observedSx = [];
  for (let i = 0; i < expectedFrames.length; i++) {
    app.advanceAnimationFrame(); // avansează currentFrame ȘI cheamă draw()
    const bushCalls = app.drawImageCalls.filter((args) => args[0] === bushImg);
    const lastCall = bushCalls[bushCalls.length - 1];
    assert.ok(lastCall, `nicio chemare de drawImage pentru tufă după avansarea #${i + 1}`);
    observedSx.push(lastCall[1] / BUSH_FRAME_SIZE);
  }

  assert.deepEqual(
    observedSx,
    expectedFrames,
    'sx-ul tufei nu ciclează 0..7×128px (sau nu se resetează după cadrul 7)'
  );
});

test('T-14 stânca statică: sursa desenată NU se schimbă între avansări de cadru', async () => {
  const app = await loadApp();
  const { cwd } = findCellWithDecoration(app, 'rock');
  await app.setAgents([makeAliveAgent({ sessionId: 't14-rock-agent', cwd })]);
  app.triggerRockImagesLoad();

  app.sandbox.draw();
  const firstCall = app.drawImageCalls[app.drawImageCalls.length - 1];
  assert.ok(firstCall, 'presetup: ar fi trebuit o chemare de drawImage pentru stâncă');
  const firstImage = firstCall[0];
  const firstArgs = firstCall.slice(1);

  for (let i = 0; i < 5; i++) app.advanceAnimationFrame();

  const lastCall = app.drawImageCalls[app.drawImageCalls.length - 1];
  assert.equal(lastCall[0], firstImage, 'imaginea stâncii s-a schimbat între avansări de cadru (ar trebui statică)');
  assert.deepEqual(
    lastCall.slice(1),
    firstArgs,
    'argumentele drawImage pentru stâncă s-au schimbat între avansări de cadru (ar trebui statică)'
  );
});

// NOTĂ pentru planner/reviewer: testul de mai jos verifică EXPLICIT cerința
// din brief ("decorația nu trebuie să se suprapună peste centrul celulei,
// unde stau agenții"). Fixat la T-14b: cu DECORATION_DEST_SIZE = 8 și
// DECORATION_OFFSET = 2, dreptunghiul decorației stă strict în colțul
// celulei, în afara pătratului central de 56×56 ocupat de sprite-ul
// agentului, la orice nivel de zoom (marja rămâne 2·zoom > 0). Detalii în
// docs/handoff/T-14b-coder-raport.md.
test('T-14 poziționare: dreptunghiul decorației NU se suprapune cu dreptunghiul sprite-ului agentului din același cell (colț dreapta-jos)', async () => {
  const app = await loadApp();
  const { cwd, cell, decoration } = findCellWithDecoration(app, 'bush');
  const agent = makeAliveAgent({ sessionId: 't14-overlap-agent', cwd });
  await app.setAgents([agent]);
  app.triggerBushImageLoad();
  settleMovement(app); // sprite-ul agentului ajunge exact în centrul celulei

  app.drawImageCalls.length = 0;
  app.sandbox.draw();

  const bushImg = app.imageInstances.find((i) => typeof i.src === 'string' && i.src.includes('bush'));
  const decoCall = app.drawImageCalls.find((args) => args[0] === bushImg);
  assert.ok(decoCall, 'presetup: decorația de tufă ar fi trebuit desenată');
  const [, , , , , decoX, decoY, decoW, decoH] = decoCall;

  // T-15: zoom implicit e acum 2 (nu 1) — dimensiunea reală a sprite-ului
  // agentului e SPRITE_DEST_SIZE * zoom (scale=1 după settleMovement).
  const zoom = getZoom(app);
  const half = SPRITE_HALF * zoom;
  const spriteSize = half * 2;
  const pos = agentPixelPosition(app, agent);
  const spriteX = pos.x - half;
  const spriteY = pos.y - half;

  const overlapX = Math.min(decoX + decoW, spriteX + spriteSize) - Math.max(decoX, spriteX);
  const overlapY = Math.min(decoY + decoH, spriteY + spriteSize) - Math.max(decoY, spriteY);

  assert.ok(
    overlapX <= 0 || overlapY <= 0,
    `decorația (tip ${decoration.type}) se suprapune cu sprite-ul agentului: dreptunghi decorație=[${decoX},${decoY},${decoW}x${decoH}], sprite=[${spriteX},${spriteY},${spriteSize}x${spriteSize}], suprapunere=${overlapX}x${overlapY}px`
  );
});
// T-15: testele de nori (updateClouds/drawClouds, reciclare la marginea
// ecranului, ordinea nori-vs-zone, nescalarea cu zoom-ul) au fost ELIMINATE
// — norii nu mai există în app.js (vezi raportul tester T-15).

// --- 12. Zone tematice pădure/aur + landmark-uri fixe (T-17) ----------------
//
// Constante citite direct din docs/handoff/T-17-coder.md/T-17-coder-raport.md
// (nu ghicite), la fel ca BUSH_FRAME_SIZE/DECORATION_DEST_SIZE mai sus.
const FOREST_TREE_POSITIONS = [
  { x: 220, y: 220 }, { x: 300, y: 260 }, { x: 260, y: 320 },
];
const GOLD_STONE_POSITIONS = [
  { x: 220, y: -220 }, { x: 300, y: -260 }, { x: 260, y: -320 },
];
const TREE_FRAME_SIZE = 192;
const TREE_FRAME_COUNT = 8;
const TREE_FRAME_HEIGHT = 256;
const TREE_DEST_WIDTH = 48;
const TREE_DEST_HEIGHT = 64;
const GOLD_STONE_SIZE = 128;
const GOLD_STONE_DEST_SIZE = 32;

// T-17 — numărul de tick-uri de mișcare necesare ca un agent nou-apărut să
// termine faza 'spawning' (scale ajunge la 1) și să facă primul PAS în starea
// 'walking' (încă neajuns la țintă). Derivat din constantele deja existente
// în acest fișier (MOVEMENT_DT, SPAWN_SCALE_RATE), nu ghicit: vezi
// updateAgentMovement() în public/app.js — scale creşte cu
// MOVEMENT_DT*SPAWN_SCALE_RATE pe tick, tranziția la 'walking' se face pe
// tick-ul în care scale atinge 1, iar primul PAS de mers se întâmplă abia pe
// tick-ul URMĂTOR (if/else — nu ambele ramuri pe același tick).
const SPAWN_TICKS_TO_FULL_SCALE = Math.ceil(1 / (MOVEMENT_DT * SPAWN_SCALE_RATE));
const TICKS_TO_FIRST_WALK_STEP = SPAWN_TICKS_TO_FULL_SCALE + 1;

// T-17 — celule FIXE, alese ca să cadă clar în fiecare cadran (o unitate de
// celulă = CELL_SIZE = 80px, deci pixelul e mereu >=80px de axă — mult peste
// pragul strict >0/<0 al regionForWorldPos, fără ambiguitate de rotunjire).
const T17_FOREST_CELL = { x: 1, y: 1 }; // pixel (80,80) -> x>0,y>0 -> 'forest'
const T17_GOLD_CELL = { x: 1, y: -1 }; // pixel (80,-80) -> x>0,y<0 -> 'gold'
const T17_NEUTRAL_CELL = { x: -1, y: 0 }; // pixel (-80,0) -> x<0 -> null

// T-17b (raport tester) — tehnica `stateWithPlots`/`initialState` de mai sus
// a fost ELIMINATĂ: bootstrap-ul de la coada lui app.js
// (`initState().then(() => { tick(); ... })`) rulează un `tick()` AUTOMAT,
// singur, imediat ce `loadApp()` lasă micro-task-urile să se scurgă — ÎNAINTE
// ca testul să apuce să cheme `app.setAgents([agent])`. La acel tick automat,
// `agentsOnServer` e încă `[]` (setAgents() nu a fost chemat), deci
// `updateZones()` vede ZERO agenți vii, `layOut([], previous)` întoarce un
// `Map` GOL (comportament CORECT — un proiect fără agenți nu poate păstra o
// zonă), iar celula seedată prin `initialState` e ștearsă din `state.plots`
// înainte ca testul să apuce s-o folosească. Detalii complete + demonstrația
// celor 2 teste care treceau "din întâmplare" (nu pentru că semănarea
// funcționa): docs/handoff/T-17b-tester-raport.md.
//
// Tehnică nouă, verificată direct în zones.js (nu presupusă): pentru un
// proiect nou ("fresh", fără `previous`), layOut() alege mereu prima celulă
// LIBERĂ dintr-un pool construit în ordinea inelelor spiralei (`ring(0)`,
// `ring(1)`, `ring(2)`, ...), identic indiferent de id-ul proiectului.
// `ring(0) = [{0,0}]` e mereu rezervat turnului (scos din pool). Citite
// direct din codul lui `ring()`:
//   ring(1) = [{-1,0}, {0,1}, {0,-1}, {1,0}]                      (4 celule)
//   ring(2) = [{-2,0}, {-1,1}, {-1,-1}, {0,2}, {0,-2}, {1,1}, {1,-1}, {2,0}]
// Toate proiectele din testele de mai jos au exact 1 agent fiecare
// (cellsNeeded(1) = 1, `want` = 1 pentru toate) și sunt inserate simultan
// într-un singur `setAgents()` — la egalitate de `size`, `Array.prototype
// .sort` e stabil (folosit deja de app.js la sortarea proiectelor), deci
// ordinea de alocare urmează exact ordinea array-ului dat lui `setAgents()`
// (fillere ÎNAINTE de proiectul testat). Rezultă:
//   proiect #1..#4  -> ring(1), în ordine: {-1,0}, {0,1}, {0,-1}, {1,0}
//   proiect #5..#9  -> primele 5 din ring(2): {-2,0},{-1,1},{-1,-1},{0,2},{0,-2}
//   proiect #10     -> a 6-a din ring(2) = {1,1}  (forest)
//   proiect #11     -> a 7-a din ring(2) = {1,-1} (gold)
// Deci: 9 fillere -> al 10-lea proiect cade pe forest; 10 fillere (cele 9 +
// proiectul forest însuși) -> al 11-lea proiect cade pe gold. FIECARE test de
// mai jos VERIFICĂ programatic acest calcul cu `computeAgentPositions()`
// (funcția de producție reală) înainte de a face aserția centrală — nu-l
// presupune pe hârtie (la T-16b, un calcul similar, nevalidat programatic, s-
// a dovedit geometric imposibil; aici s-a confirmat corect, dar tot prin
// verificare, nu presupunere).
const FOREST_FILLER_COUNT = 9;
const GOLD_FILLER_COUNT = 10; // = FOREST_FILLER_COUNT + 1 (forestAgent devine al 10-lea filler pentru gold)

function makeZoneFillers(count, labelPrefix) {
  return Array.from({ length: count }, (_, i) =>
    makeAliveAgent({
      sessionId: `${labelPrefix}-filler-${i}`,
      cwd: `/proj/${labelPrefix}-filler-${i}`,
      name: `${labelPrefix}filler${i}`,
    })
  );
}

// Verifică programatic (nu presupune) că agentul testat a primit poziția de
// LUME așteptată pentru `expectedCell`, folosind `computeAgentPositions()` —
// aceeași funcție de producție folosită de `updateAgentMovement()`/`draw()`.
function assertAgentInCell(app, agent, expectedCell, context) {
  // Comparăm x/y individual, nu obiectul întreg: `worldPos` vine din realm-ul
  // `vm` (alt prototip de Object decât obiectele din fișierul de test), iar
  // assert.deepEqual poate respinge greșit obiecte altfel identice — același
  // pitfall documentat deja la T-09/T-10 (vezi antetul fișierului).
  const worldPos = app.sandbox.computeAgentPositions([agent]).get(agent.sessionId);
  const expected = { x: expectedCell.x * ZONE_CELL_SIZE, y: expectedCell.y * ZONE_CELL_SIZE };
  const msg = `presetup (${context}): proiectul testat nu a căzut pe celula așteptată ${JSON.stringify(expectedCell)} — verifică numărul de fillere/ordinea ring() dacă acest test eșuează aici`;
  assert.equal(worldPos.x, expected.x, msg);
  assert.equal(worldPos.y, expected.y, msg);
}

// --- 12.1 regionForWorldPos: cele 4 cazuri de cadran -------------------------

test('T-17 regionForWorldPos: x>0 și y>0 -> "forest"', async () => {
  const { sandbox } = await loadApp();
  assert.equal(sandbox.regionForWorldPos(5, 5), 'forest');
  assert.equal(sandbox.regionForWorldPos(220, 220), 'forest');
});

test('T-17 regionForWorldPos: x>0 și y<0 -> "gold"', async () => {
  const { sandbox } = await loadApp();
  assert.equal(sandbox.regionForWorldPos(5, -5), 'gold');
  assert.equal(sandbox.regionForWorldPos(220, -220), 'gold');
});

test('T-17 regionForWorldPos: x<0 (orice y) -> null (cadran neutru)', async () => {
  const { sandbox } = await loadApp();
  assert.equal(sandbox.regionForWorldPos(-5, 5), null);
  assert.equal(sandbox.regionForWorldPos(-5, -5), null);
});

test('T-17 regionForWorldPos: pe axe (x=0 sau y=0) -> null, strict > / <, nu >= / <=', async () => {
  const { sandbox } = await loadApp();
  assert.equal(sandbox.regionForWorldPos(0, 5), null, 'x=0 nu ar trebui să cadă în niciun cadran');
  assert.equal(sandbox.regionForWorldPos(0, -5), null, 'x=0 nu ar trebui să cadă în niciun cadran');
  assert.equal(sandbox.regionForWorldPos(5, 0), null, 'y=0 nu ar trebui să cadă în niciun cadran');
  assert.equal(sandbox.regionForWorldPos(0, 0), null, 'originea nu ar trebui să cadă în niciun cadran');
});

// --- 12.2 Sprite de agent pe cadran (idle/run × forest/gold/neutru) ---------

test('T-17 agent la-site (idle) în cadranul pădure: desenat cu pawnInteractAxeImage, nu pawnImage', async () => {
  const app = await loadApp();
  const cwd = '/proj/t17-forest-idle';
  const agent = makeAliveAgent({ sessionId: 't17-forest-idle', cwd });
  const fillers = makeZoneFillers(FOREST_FILLER_COUNT, 't17-forest-idle');
  await app.setAgents([...fillers, agent]);
  assertAgentInCell(app, agent, T17_FOREST_CELL, 'forest idle');

  settleMovement(app); // ajunge la-site, exact pe ținta din cadranul pădure
  app.triggerAxeImagesLoad();

  app.drawImageCalls.length = 0;
  app.sandbox.draw();

  assert.equal(app.drawImageCalls.length, 1, 'ar fi trebuit exact o chemare de drawImage pentru agentul din cadranul pădure');
  assert.equal(
    app.drawImageCalls[0][0],
    app.pawnInteractAxeImage,
    'agentul idle din cadranul pădure ar fi trebuit desenat cu pawnInteractAxeImage'
  );
});

test('T-17 agent care merge (walking) prin cadranul pădure: desenat cu pawnRunAxeImage, nu pawnRunImage', async () => {
  const app = await loadApp();
  const cwd = '/proj/t17-forest-run';
  const agent = makeAliveAgent({ sessionId: 't17-forest-run', cwd });
  const fillers = makeZoneFillers(FOREST_FILLER_COUNT, 't17-forest-run');
  await app.setAgents([...fillers, agent]);
  assertAgentInCell(app, agent, T17_FOREST_CELL, 'forest run');
  app.triggerAxeImagesLoad();

  for (let i = 0; i < TICKS_TO_FIRST_WALK_STEP; i++) app.advanceMovementTick();

  app.drawImageCalls.length = 0;
  app.sandbox.draw();

  assert.equal(app.drawImageCalls.length, 1, 'ar fi trebuit exact o chemare de drawImage pentru agentul aflat în mers');
  assert.equal(
    app.drawImageCalls[0][0],
    app.pawnRunAxeImage,
    'agentul aflat în mers prin cadranul pădure ar fi trebuit desenat cu pawnRunAxeImage'
  );
});

test('T-17 agent la-site (idle) în cadranul aur: desenat cu pawnInteractPickaxeImage, nu pawnImage', async () => {
  const app = await loadApp();
  const cwd = '/proj/t17-gold-idle';
  const agent = makeAliveAgent({ sessionId: 't17-gold-idle', cwd });
  const fillers = makeZoneFillers(GOLD_FILLER_COUNT, 't17-gold-idle');
  await app.setAgents([...fillers, agent]);
  assertAgentInCell(app, agent, T17_GOLD_CELL, 'gold idle');

  settleMovement(app);
  app.triggerPickaxeImagesLoad();

  app.drawImageCalls.length = 0;
  app.sandbox.draw();

  assert.equal(app.drawImageCalls.length, 1, 'ar fi trebuit exact o chemare de drawImage pentru agentul din cadranul aur');
  assert.equal(
    app.drawImageCalls[0][0],
    app.pawnInteractPickaxeImage,
    'agentul idle din cadranul aur ar fi trebuit desenat cu pawnInteractPickaxeImage'
  );
});

test('T-17 agent care merge (walking) prin cadranul aur: desenat cu pawnRunPickaxeImage, nu pawnRunImage', async () => {
  const app = await loadApp();
  const cwd = '/proj/t17-gold-run';
  const agent = makeAliveAgent({ sessionId: 't17-gold-run', cwd });
  const fillers = makeZoneFillers(GOLD_FILLER_COUNT, 't17-gold-run');
  await app.setAgents([...fillers, agent]);
  assertAgentInCell(app, agent, T17_GOLD_CELL, 'gold run');
  app.triggerPickaxeImagesLoad();

  for (let i = 0; i < TICKS_TO_FIRST_WALK_STEP; i++) app.advanceMovementTick();

  app.drawImageCalls.length = 0;
  app.sandbox.draw();

  assert.equal(app.drawImageCalls.length, 1, 'ar fi trebuit exact o chemare de drawImage pentru agentul aflat în mers');
  assert.equal(
    app.drawImageCalls[0][0],
    app.pawnRunPickaxeImage,
    'agentul aflat în mers prin cadranul aur ar fi trebuit desenat cu pawnRunPickaxeImage'
  );
});

// T-17b — acest test NU are nevoie de tehnica filler: un singur proiect nou,
// fără niciun alt agent viu, cade NATURAL pe prima celulă din ring(1)
// ({-1,0} — vezi comentariul de mai sus, verificat direct din zones.js),
// care e neutră (x<0). Nicio manipulare de `state.plots`/`initialState` —
// doar `setAgents([agent])` simplu, cu poziția verificată programatic mai
// jos înainte de aserția centrală.
test('T-17 agent în cadran neutru: comportament NESCHIMBAT (pawnImage/pawnRunImage), non-regresie', async () => {
  const app = await loadApp();
  const cwd = '/proj/t17-neutral-idle';
  const agent = makeAliveAgent({ sessionId: 't17-neutral-idle', cwd });
  await app.setAgents([agent]);
  assertAgentInCell(app, agent, T17_NEUTRAL_CELL, 'neutral idle, fără fillere');

  settleMovement(app);
  app.triggerImageLoad();

  app.drawImageCalls.length = 0;
  app.sandbox.draw();

  assert.equal(app.drawImageCalls.length, 1, 'ar fi trebuit exact o chemare de drawImage pentru agentul din cadranul neutru');
  assert.equal(
    app.drawImageCalls[0][0],
    app.pawnIdleImage,
    'agentul idle din cadranul neutru ar fi trebuit desenat tot cu pawnImage (comportament dinainte de T-17)'
  );
});

// T-17b — refăcut cu tehnica filler: `forestAgent` (proiectul #10) joacă
// direct rolul celui de-al 10-lea "filler" necesar ca `goldAgent` (proiectul
// #11) să cadă pe gold — nu sunt necesare fillere suplimentare pentru gold.
// Poziția AMBILOR agenți e verificată programatic mai jos, altfel acest test
// n-ar dovedi nimic despre codul din T-17 (doar despre calea generică
// spriteLoaded===false, care ar trece indiferent de cadran).
test('T-17 fallback: dacă sprite-ul de topor/târnăcop nu s-a "încărcat", NU se desenează nimic pentru acel agent (nu aruncă)', async () => {
  const app = await loadApp();
  const forestCwd = '/proj/t17-forest-noload';
  const goldCwd = '/proj/t17-gold-noload';
  const forestAgent = makeAliveAgent({ sessionId: 't17-forest-noload', cwd: forestCwd });
  const goldAgent = makeAliveAgent({ sessionId: 't17-gold-noload', cwd: goldCwd });
  const fillers = makeZoneFillers(FOREST_FILLER_COUNT, 't17-fallback');
  await app.setAgents([...fillers, forestAgent, goldAgent]);
  assertAgentInCell(app, forestAgent, T17_FOREST_CELL, 'fallback forest');
  assertAgentInCell(app, goldAgent, T17_GOLD_CELL, 'fallback gold');

  settleMovement(app);
  // Deliberat: NU chemăm triggerAxeImagesLoad()/triggerPickaxeImagesLoad().

  assert.doesNotThrow(() => app.sandbox.draw());
  assert.equal(
    app.drawImageCalls.length,
    0,
    'fără onload pe sprite-urile de topor/târnăcop, draw() n-ar fi trebuit să cheme deloc drawImage pentru agenți'
  );
});

test('T-17 frameCount pentru topor/târnăcop ciclează pe RUN_SPRITE_FRAME_COUNT (6), nu SPRITE_FRAME_COUNT (8), chiar și pentru varianta idle-equivalentă (interact)', async () => {
  const app = await loadApp();
  const cwd = '/proj/t17-forest-frames';
  const agent = makeAliveAgent({ sessionId: 't17-forest-frames', cwd });
  const fillers = makeZoneFillers(FOREST_FILLER_COUNT, 't17-forest-frames');
  await app.setAgents([...fillers, agent]);
  assertAgentInCell(app, agent, T17_FOREST_CELL, 'forest frames');

  settleMovement(app); // la-site -> desenat cu pawnInteractAxeImage (idle-equivalent)
  app.triggerAxeImagesLoad();

  // 7 avansări: currentFrame (global, mod 8) devine succesiv 1,2,3,4,5,6,7.
  // sx desenat = (currentFrame % RUN_SPRITE_FRAME_COUNT) * SPRITE_FRAME_SIZE.
  // La a 6-a avansare (currentFrame=6), un ciclu de 8 cadre ar fi arătat încă
  // 6 (6%8=6); cu ciclul de 6 cadre cerut de T-17, cade deja înapoi la 0
  // (6%6=0) — exact verificarea cerută de brief ("revine la 0, nu la 6").
  const expectedFrameIndices = [1, 2, 3, 4, 5, 0, 1];
  const observed = [];
  for (let i = 0; i < expectedFrameIndices.length; i++) {
    app.drawImageCalls.length = 0; // golește între avansări — altfel .find() tot găsește primul apel istoric, nu cel curent
    app.advanceAnimationFrame();
    const call = app.drawImageCalls.find((args) => args[0] === app.pawnInteractAxeImage);
    assert.ok(call, `nicio chemare de drawImage cu pawnInteractAxeImage după avansarea #${i + 1}`);
    observed.push(call[1] / SPRITE_FRAME_SIZE);
  }

  assert.deepEqual(
    observed,
    expectedFrameIndices,
    'sx-ul pentru sprite-ul de topor (interact) nu ciclează pe 6 cadre (RUN_SPRITE_FRAME_COUNT)'
  );
});

// --- 12.3 Landmark-uri fixe (copaci + aur) -----------------------------------

test('T-17 landmark copaci: după onload, drawRegionLandmarks() desenează exact 3 drawImage(treeImage, ...), unul per FOREST_TREE_POSITIONS', async () => {
  const app = await loadApp();
  app.triggerTreeImageLoad();

  app.drawImageCalls.length = 0;
  app.sandbox.drawRegionLandmarks();

  const treeCalls = app.drawImageCalls.filter((args) => args[0] === app.treeImage);
  assert.equal(treeCalls.length, FOREST_TREE_POSITIONS.length, 'ar fi trebuit exact un drawImage(treeImage) per poziție din FOREST_TREE_POSITIONS');

  for (const p of FOREST_TREE_POSITIONS) {
    const pos = app.sandbox.worldToScreen(p.x, p.y);
    const match = treeCalls.find((args) => {
      const [, , , , , destX, destY, destW] = args;
      return Math.abs(destX + destW / 2 - pos.x) < 1e-6;
    });
    assert.ok(match, `n-am găsit un drawImage(treeImage) pentru poziția (${p.x},${p.y})`);
    const [, , , sw, sh, , destY, destW, destH] = match;
    assert.equal(sw, TREE_FRAME_SIZE, 'sw ar fi trebuit să fie dimensiunea unui cadru de copac');
    assert.equal(sh, TREE_FRAME_HEIGHT, 'sh ar fi trebuit să fie înălțimea completă a cadrului de copac');
    assertClose(destY + destH, pos.y, 'baza copacului (destY+destH) nu cade pe punctul din lume al poziției');
  }
});

test('T-17 landmark copaci: sx-ul desenat ciclează pe currentFrame % TREE_FRAME_COUNT, la fel ca tufele T-14', async () => {
  const app = await loadApp();
  app.triggerTreeImageLoad();

  const expectedFrames = [1, 2, 3, 4, 5, 6, 7, 0, 1, 2];
  const observed = [];
  for (let i = 0; i < expectedFrames.length; i++) {
    app.advanceAnimationFrame();
    const treeCalls = app.drawImageCalls.filter((args) => args[0] === app.treeImage);
    const lastCall = treeCalls[treeCalls.length - 1];
    assert.ok(lastCall, `nicio chemare de drawImage(treeImage) după avansarea #${i + 1}`);
    observed.push(lastCall[1] / TREE_FRAME_SIZE);
  }

  assert.deepEqual(observed, expectedFrames, 'sx-ul copacului nu ciclează 0..7×192px (currentFrame % TREE_FRAME_COUNT)');
});

test('T-17 landmark aur: după onload, drawRegionLandmarks() desenează exact 3 drawImage(goldStoneImage, ...), unul per GOLD_STONE_POSITIONS, sursă FIXĂ', async () => {
  const app = await loadApp();
  app.triggerGoldStoneImageLoad();

  app.drawImageCalls.length = 0;
  app.sandbox.drawRegionLandmarks();

  const goldCalls = app.drawImageCalls.filter((args) => args[0] === app.goldStoneImage);
  assert.equal(goldCalls.length, GOLD_STONE_POSITIONS.length, 'ar fi trebuit exact un drawImage(goldStoneImage) per poziție din GOLD_STONE_POSITIONS');

  for (const call of goldCalls) {
    const [, sx, sy, sw, sh] = call;
    assert.equal(sx, 0, 'sursa bolovanului de aur ar fi trebuit fixă (sx=0), fără ciclare de cadre');
    assert.equal(sy, 0, 'sursa bolovanului de aur ar fi trebuit fixă (sy=0)');
    assert.equal(sw, GOLD_STONE_SIZE, 'sw ar fi trebuit să fie dimensiunea nativă a bolovanului de aur');
    assert.equal(sh, GOLD_STONE_SIZE, 'sh ar fi trebuit să fie dimensiunea nativă a bolovanului de aur');
  }

  for (const p of GOLD_STONE_POSITIONS) {
    const pos = app.sandbox.worldToScreen(p.x, p.y);
    const match = goldCalls.find((args) => {
      const [, , , , , destX, destY, destW, destH] = args;
      return Math.abs(destX + destW / 2 - pos.x) < 1e-6 && Math.abs(destY + destH - pos.y) < 1e-6;
    });
    assert.ok(match, `n-am găsit un drawImage(goldStoneImage) ancorat la bază pentru poziția (${p.x},${p.y})`);
  }
});

test('T-17 landmark aur: sursa desenată NU se schimbă între avansări de cadru (static, ca stâncile T-14)', async () => {
  const app = await loadApp();
  app.triggerGoldStoneImageLoad();

  app.sandbox.drawRegionLandmarks();
  const firstCalls = app.drawImageCalls.filter((args) => args[0] === app.goldStoneImage).map((args) => args.slice(1));
  assert.ok(firstCalls.length > 0, 'presetup: ar fi trebuit cel puțin un drawImage(goldStoneImage)');

  for (let i = 0; i < 5; i++) app.advanceAnimationFrame();

  const lastCalls = app.drawImageCalls.filter((args) => args[0] === app.goldStoneImage).slice(-firstCalls.length).map((args) => args.slice(1));
  assert.deepEqual(lastCalls, firstCalls, 'argumentele drawImage pentru bolovanul de aur s-au schimbat între avansări de cadru (ar trebui statice)');
});

test('T-17 landmark-uri: fără onload (nici tree, nici gold-stone), niciun drawImage și nu aruncă', async () => {
  const app = await loadApp();

  app.drawImageCalls.length = 0;
  assert.doesNotThrow(() => app.sandbox.drawRegionLandmarks());
  assert.equal(app.drawImageCalls.length, 0, 'fără onload pe tree/gold-stone, drawRegionLandmarks() n-ar fi trebuit să cheme deloc drawImage');
});

test('T-17 ancorare la bază landmark-uri: destY + destH === worldToScreen(...).y pentru un copac cunoscut, NU destY + destH/2', async () => {
  const app = await loadApp();
  app.triggerTreeImageLoad();

  app.drawImageCalls.length = 0;
  app.sandbox.drawRegionLandmarks();

  const p = FOREST_TREE_POSITIONS[0];
  const pos = app.sandbox.worldToScreen(p.x, p.y);
  const treeCalls = app.drawImageCalls.filter((args) => args[0] === app.treeImage);
  const call = treeCalls.find((args) => Math.abs(args[5] + args[7] / 2 - pos.x) < 1e-6);
  assert.ok(call, `presetup: n-am găsit drawImage(treeImage) pentru poziția (${p.x},${p.y})`);

  const [, , , , , destX, destY, destW, destH] = call;
  assertClose(destX + destW / 2, pos.x, 'copacul nu e centrat orizontal pe punctul din lume');
  assertClose(destY + destH, pos.y, 'baza copacului (destY+destH) nu cade pe punctul din lume — verifică ancorarea la BAZĂ');
  assert.notEqual(
    destY + destH / 2,
    pos.y,
    'dacă acest test trece cu egalitate aici, copacul e ancorat la CENTRU, nu la BAZĂ (regresie)'
  );
});

test('T-17 ordinea de desenare: drawRegionLandmarks() (drawImage copac/aur) apare ÎNAINTE de primul strokeRect de zonă (drawZones())', async () => {
  const app = await loadApp();
  app.triggerTreeImageLoad();
  app.triggerGoldStoneImageLoad();
  const cwd = '/proj/t17-landmark-order';
  await app.setAgents([makeAliveAgent({ sessionId: 't17-order-agent', cwd })]);

  app.callOrder.length = 0;
  app.sandbox.draw();

  const treeIdx = app.callOrder.findIndex((c) => c.type === 'drawImage' && c.args[0] === app.treeImage);
  const goldIdx = app.callOrder.findIndex((c) => c.type === 'drawImage' && c.args[0] === app.goldStoneImage);
  const zoneStrokeIdx = app.callOrder.findIndex((c) => c.type === 'strokeRect');

  assert.notEqual(treeIdx, -1, 'presetup: copacii ar fi trebuit desenați');
  assert.notEqual(goldIdx, -1, 'presetup: bolovanii de aur ar fi trebuit desenați');
  assert.notEqual(zoneStrokeIdx, -1, 'presetup: zona ar fi trebuit desenată (strokeRect de contur)');
  assert.ok(treeIdx < zoneStrokeIdx, `copacii ar fi trebuit desenați ÎNAINTE de zone (indice copac=${treeIdx}, indice zonă=${zoneStrokeIdx})`);
  assert.ok(goldIdx < zoneStrokeIdx, `bolovanii de aur ar fi trebuit desenați ÎNAINTE de zone (indice aur=${goldIdx}, indice zonă=${zoneStrokeIdx})`);
});

// --- 13. T-18 — butoanele "New session" / "Reveal in folder" ----------------
//
// Helper comun celor 4 teste de mai jos: selectează un agent (click pe
// centrul cercului lui), la fel cum fac deja testele #4/#5 de mai sus.

async function loadAppWithSelectedAgent(overrides = {}) {
  const app = await loadApp();
  const agent = makeAliveAgent({ cwd: 'C:\\proiecte\\agent-x', ...overrides });
  await app.setAgents([agent]);
  settleMovement(app);
  const pos = agentPixelPosition(app, agent);
  app.click(pos.x, pos.y);
  assert.ok(app.fakeDetails.innerHTML.includes(agent.name), 'presetup: click-ul ar fi trebuit să selecteze agentul');
  return { app, agent };
}

test('T-18 renderDetails() include butoanele new-session-btn și reveal-btn lângă open-btn/hide-btn', async () => {
  const { app } = await loadAppWithSelectedAgent();
  assert.ok(app.fakeDetails.innerHTML.includes('id="new-session-btn"'), 'lipsește new-session-btn din panoul de detalii');
  assert.ok(app.fakeDetails.innerHTML.includes('id="reveal-btn"'), 'lipsește reveal-btn din panoul de detalii');
  assert.ok(app.fakeDetails.innerHTML.includes('New session'), 'lipsește eticheta "New session"');
  assert.ok(app.fakeDetails.innerHTML.includes('Reveal in folder'), 'lipsește eticheta "Reveal in folder"');
});

test('T-18 click pe new-session-btn cheamă POST /api/new-session cu body {folder: agent.cwd}', async () => {
  const { app, agent } = await loadAppWithSelectedAgent();

  await app.clickNewSession();

  const calls = app.getNewSessionCalls();
  assert.equal(calls.length, 1, 'ar fi trebuit exact o chemare către /api/new-session');
  assert.deepEqual(calls[0], { folder: agent.cwd }, 'body-ul trimis nu conține exact { folder: agent.cwd }');
});

test('T-18 click pe reveal-btn cheamă POST /api/reveal cu body {folder: agent.cwd}', async () => {
  const { app, agent } = await loadAppWithSelectedAgent();

  await app.clickReveal();

  const calls = app.getRevealCalls();
  assert.equal(calls.length, 1, 'ar fi trebuit exact o chemare către /api/reveal');
  assert.deepEqual(calls[0], { folder: agent.cwd }, 'body-ul trimis nu conține exact { folder: agent.cwd }');
});

test('T-18 New session: răspuns non-ok (400) -> mesaj de eroare afișat în #open-error', async () => {
  const { app } = await loadAppWithSelectedAgent();
  app.setNewSessionImpl(async () => ({ ok: false, status: 400, json: async () => ({ ok: false, error: 'folder invalid sau inexistent' }) }));

  await app.clickNewSession();

  assert.notEqual(app.openErrorText, '', 'mesajul de eroare ar fi trebuit afișat în #open-error după un răspuns non-ok');
});

test('T-18 New session: eșec de rețea (fetch aruncă) -> mesaj de eroare afișat în #open-error', async () => {
  const { app } = await loadAppWithSelectedAgent();
  app.setNewSessionImpl(async () => {
    throw new Error('network down');
  });

  await app.clickNewSession();

  assert.notEqual(app.openErrorText, '', 'mesajul de eroare ar fi trebuit afișat în #open-error după o eroare de rețea');
});

test('T-18 Reveal in folder: răspuns non-ok (400) -> mesaj de eroare afișat în #open-error', async () => {
  const { app } = await loadAppWithSelectedAgent();
  app.setRevealImpl(async () => ({ ok: false, status: 400, json: async () => ({ ok: false, error: 'folder invalid sau inexistent' }) }));

  await app.clickReveal();

  assert.notEqual(app.openErrorText, '', 'mesajul de eroare ar fi trebuit afișat în #open-error după un răspuns non-ok');
});

test('T-18 Reveal in folder: eșec de rețea (fetch aruncă) -> mesaj de eroare afișat în #open-error', async () => {
  const { app } = await loadAppWithSelectedAgent();
  app.setRevealImpl(async () => {
    throw new Error('network down');
  });

  await app.clickReveal();

  assert.notEqual(app.openErrorText, '', 'mesajul de eroare ar fi trebuit afișat în #open-error după o eroare de rețea');
});

test('T-18 succes: #open-error rămâne gol (nu afișează eroare) după un click reușit pe New session', async () => {
  const { app } = await loadAppWithSelectedAgent();

  await app.clickNewSession();

  assert.equal(app.openErrorText, '', 'un click reușit (200 {ok:true}) nu ar trebui să lase niciun mesaj de eroare în #open-error');
});
