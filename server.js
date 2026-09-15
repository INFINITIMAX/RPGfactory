// server.js — serverul HTTP al agent-map. RF-01: construcția modulului
// (`createServer`) nu mai are efecte secundare — nu ascultă, nu citește
// sesiunile de pe disc, nu lansează nimic. Pornirea efectivă e o funcție
// separată (`startServer`), iar CLI-ul rămâne un simplu entrypoint la
// finalul fișierului (`require.main === module`).

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL, URLSearchParams } = require('url');
const { spawn } = require('child_process');
const { getRank } = require('./rank');
const { getActivityState } = require('./status');
const { createStateStore } = require('./state');
const { createProfilesStore } = require('./profiles');
const { createRunsStore } = require('./runs');
const { readJsonBody } = require('./body');
const { buildAllowedOrigins, checkOrigin, resolveStaticPath } = require('./server/http-guards');

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
};

// Un byte de control (inclusiv \r/\n) într-un sessionId nu are ce căuta
// acolo — fie e input corupt, fie o încercare de injecție în URL-ul
// `claude://resume?session=...` construit mai jos.
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

function defaultOpener(target) {
  const child = spawn('rundll32', ['url.dll,FileProtocolHandler', target], {
    stdio: 'ignore',
    detached: true,
  });
  child.on('error', () => {}); // opener-ul poate lipsi; nu trebuie să oprească serverul
  child.unref();
}

function defaultIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

// Traduce erorile aruncate de profiles.js în răspunsuri HTTP. `e.code`
// vine din modul ('VALIDATION' -> 400, 'NOT_FOUND' -> 404,
// 'CONFLICT' -> 409, cu `e.current` atașat). O eroare fără `code` e
// neașteptată (ex. eroare de disc) — tratată ca 500, ca la state.js, nu
// lăsată să iasă neprinsă din callback-ul cererii HTTP.
function respondProfileError(res, e) {
  if (e && e.code === 'VALIDATION') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
    return;
  }
  if (e && e.code === 'NOT_FOUND') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
    return;
  }
  if (e && e.code === 'CONFLICT') {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message, current: e.current || null }));
    return;
  }
  console.error('server.js: eroare neașteptată din profilesStore:', e);
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'eroare internă' }));
}

// Ca `respondProfileError`, dar pentru erorile venite din `runs.js`. La
// CONFLICT, `runsStore.associateProfile` poate atașa fie `current` (revizie
// neconcordantă), fie `activeRuns` (I24 — run-uri active care blochează
// asocierea) — ambele sunt trimise mai departe dacă există, fără să
// presupunem care anume e prezentă.
function respondRunError(res, e) {
  if (e && e.code === 'VALIDATION') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
    return;
  }
  if (e && e.code === 'NOT_FOUND') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
    return;
  }
  if (e && e.code === 'CONFLICT') {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: false,
        error: e.message,
        current: e.current || null,
        activeRuns: e.activeRuns || null,
      })
    );
    return;
  }
  console.error('server.js: eroare neașteptată din runsStore:', e);
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'eroare internă' }));
}

function resolveFolder(folder) {
  if (typeof folder !== 'string' || !path.isAbsolute(folder)) return null;
  try {
    const stat = fs.statSync(folder);
    return stat.isDirectory() ? folder : null;
  } catch (e) {
    return null;
  }
}

// `sessionsDir` și `isAlive` sunt injectate (D1/D12) — nicio citire de pe
// disc real sau sondă de proces reală în teste. Restul (getRank/getActivityState,
// proiecția de activitate) rămâne neatins: aparține RF-03.
function readAgents(sessionsDir, isAlive) {
  let files = [];
  try {
    files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.json'));
  } catch (e) {
    return [];
  }

  return files
    .map((f) => {
      try {
        const raw = fs.readFileSync(path.join(sessionsDir, f), 'utf8');
        const data = JSON.parse(raw);
        const { rank, model } = getRank(data.cwd, data.sessionId);
        const { activity } = getActivityState(data.cwd, data.sessionId);
        return {
          pid: data.pid,
          sessionId: data.sessionId,
          name: data.name,
          cwd: data.cwd,
          status: data.status,
          kind: data.kind,
          updatedAt: data.updatedAt,
          alive: isAlive(data.pid),
          rank: rank,
          model: model,
          activity: activity,
        };
      } catch (e) {
        return null;
      }
    })
    .filter((a) => a && a.alive);
}

// Construiește (NU pornește) serverul HTTP. Fără efecte secundare: nu
// ascultă porturi, nu atinge `sessionsDir` decât la o cerere efectivă.
function createServer(options = {}) {
  const publicDir = options.publicDir || path.join(__dirname, 'public');
  const sessionsDir = options.sessionsDir || path.join(os.homedir(), '.claude', 'sessions');
  const dataDir = options.dataDir || path.join(__dirname, 'data');
  const now = options.now || (() => Date.now());
  const opener = options.opener || defaultOpener;
  const isAlive = options.isAlive || defaultIsAlive;

  const stateStore = createStateStore({ dataDir, now });
  // Ca la stateStore: construcția store-ului nu deschide baza (RF-02b,
  // §2.1) — deschiderea e lazy, în interiorul profiles.js, la prima cerere
  // reală care ajunge pe /api/profiles.
  const profilesStore = createProfilesStore({ dbPath: options.dbPath, migrationsDir: options.migrationsDir, now });
  // RF-02c: handle SQLite propriu, independent de `profilesStore` — deschis
  // lazy la fel (vezi runs.js), fără să partajeze ownership-ul de închidere.
  const runsStore = createRunsStore({ dbPath: options.dbPath, migrationsDir: options.migrationsDir, now });

  // Setul de origini permise nu se cunoaște până nu ascultă efectiv
  // serverul (portul efemer 0 devine un port real abia atunci). Se
  // inițializează gol/restrictiv aici și se completează de `startServer`
  // prin `server.setAllowedOrigins`, imediat după `listen`.
  let allowedOrigins = buildAllowedOrigins(options.port && options.port !== 0 ? options.port : null);

  const server = http.createServer((req, res) => {
    let url;
    try {
      // rutăm și servim după `url.pathname`, niciodată după `req.url` brut
      // (D9: altfel `?v=1` ajunge în calea de fișier).
      url = new URL(req.url, 'http://localhost');
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'invalid URL' }));
      return;
    }
    const pathname = url.pathname;
    const isApi = pathname.startsWith('/api/');

    if (isApi && !checkOrigin(req, allowedOrigins)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'forbidden' }));
      return;
    }

    if (pathname === '/api/agents') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(readAgents(sessionsDir, isAlive)));
      return;
    }

    if (pathname === '/api/open') {
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' });
        res.end();
        return;
      }
      readJsonBody(req, res, (data) => {
        const sessionId = data && data.sessionId;
        if (typeof sessionId !== 'string' || !sessionId || CONTROL_CHARS.test(sessionId)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'missing sessionId' }));
          return;
        }
        opener('claude://resume?session=' + sessionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    if (pathname === '/api/reveal') {
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' });
        res.end();
        return;
      }
      readJsonBody(req, res, (data) => {
        const folder = resolveFolder(data && data.folder);
        if (!folder) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'folder invalid sau inexistent' }));
          return;
        }
        opener(folder);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    if (pathname === '/api/new-session') {
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' });
        res.end();
        return;
      }
      readJsonBody(req, res, (data) => {
        const folder = resolveFolder(data && data.folder);
        if (!folder) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'folder invalid sau inexistent' }));
          return;
        }
        opener('claude://code/new?' + new URLSearchParams({ folder }).toString());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    if (pathname === '/api/state') {
      if (req.method === 'GET') {
        stateStore.handleGetState(req, res);
        return;
      }
      if (req.method === 'PUT') {
        stateStore.handlePutState(req, res);
        return;
      }
      res.writeHead(405, { Allow: 'GET, PUT' });
      res.end();
      return;
    }

    // RF-02b: /api/profiles și sub-căile lui. server.js nu are router — pe
    // `pathname.split('/')` obținem segmentele, ca la orice altă rută de
    // aici, doar că avem nevoie de un `id` opțional în cale.
    if (pathname === '/api/profiles' || pathname.startsWith('/api/profiles/')) {
      const segments = pathname.split('/').filter(Boolean); // ['api', 'profiles', id?, sub?]
      const id = segments[2];
      const sub = segments[3];

      if (
        segments.length > 4 ||
        (sub !== undefined && sub !== 'history' && sub !== 'configurations' && sub !== 'runs')
      ) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'not found' }));
        return;
      }

      if (id !== undefined && CONTROL_CHARS.test(id)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'id invalid' }));
        return;
      }

      // /api/profiles
      if (id === undefined) {
        if (req.method === 'POST') {
          readJsonBody(req, res, (data) => {
            try {
              const profile = profilesStore.createProfile({
                name: data && data.name,
                primarySpecialization: data && data.primarySpecialization,
              });
              res.writeHead(201, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(profile));
            } catch (e) {
              respondProfileError(res, e);
            }
          });
          return;
        }
        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(profilesStore.listProfiles()));
          return;
        }
        res.writeHead(405, { Allow: 'GET, POST' });
        res.end();
        return;
      }

      // /api/profiles/{id}/history
      if (sub === 'history') {
        if (req.method !== 'GET') {
          res.writeHead(405, { Allow: 'GET' });
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(profilesStore.getProfileHistory(id)));
        return;
      }

      // /api/profiles/{id}/configurations
      if (sub === 'configurations') {
        if (req.method === 'POST') {
          readJsonBody(req, res, (data) => {
            try {
              const configuration = profilesStore.createConfigurationVersion(id, {
                harness: data && data.harness,
                provider: data && data.provider,
                model: data && data.model,
                instructionsRef: data && data.instructionsRef,
                skillsRef: data && data.skillsRef,
                memoryRef: data && data.memoryRef,
              });
              res.writeHead(201, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(configuration));
            } catch (e) {
              respondProfileError(res, e);
            }
          });
          return;
        }
        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(profilesStore.listConfigurationVersions(id)));
          return;
        }
        res.writeHead(405, { Allow: 'GET, POST' });
        res.end();
        return;
      }

      // /api/profiles/{id}/runs — analog cu /api/profiles/{id}/configurations.
      if (sub === 'runs') {
        if (req.method !== 'GET') {
          res.writeHead(405, { Allow: 'GET' });
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(runsStore.listRunsForProfile(id)));
        return;
      }

      // /api/profiles/{id}
      if (req.method === 'GET') {
        const profile = profilesStore.getProfile(id);
        if (!profile) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'profilul ' + id + ' nu există' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(profile));
        return;
      }
      if (req.method === 'PATCH') {
        readJsonBody(req, res, (data) => {
          try {
            const profile = profilesStore.updateProfile(id, {
              expectedRevision: data && data.expectedRevision,
              changes: data && data.changes,
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(profile));
          } catch (e) {
            respondProfileError(res, e);
          }
        });
        return;
      }
      res.writeHead(405, { Allow: 'GET, PATCH' });
      res.end();
      return;
    }

    // RF-02c: /api/runs și sub-căile lui. `id`-ul unui run poate conține
    // ':' (formula `sourceHarness:nativeId`) — inofensiv pentru
    // `pathname.split('/')`, fiindcă ':' nu e separator de cale.
    if (pathname === '/api/runs' || pathname.startsWith('/api/runs/')) {
      const segments = pathname.split('/').filter(Boolean); // ['api', 'runs', 'observe'|id?, sub?]

      // POST /api/runs/observe — acțiune fixă, verificată înaintea rutării
      // pe id, ca să nu depindă de coincidența cu un run al cărui id ar fi
      // literal "observe".
      if (segments.length === 3 && segments[2] === 'observe') {
        if (req.method !== 'POST') {
          res.writeHead(405, { Allow: 'POST' });
          res.end();
          return;
        }
        readJsonBody(req, res, (data) => {
          try {
            const run = runsStore.observeRun({
              sourceHarness: data && data.sourceHarness,
              nativeId: data && data.nativeId,
              project: data && data.project,
              lifecycle: data && data.lifecycle,
            });
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(run));
          } catch (e) {
            respondRunError(res, e);
          }
        });
        return;
      }

      const id = segments[2];
      const sub = segments[3];

      if (segments.length > 4 || (sub !== undefined && sub !== 'associate' && sub !== 'dissociate')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'not found' }));
        return;
      }

      if (id !== undefined && CONTROL_CHARS.test(id)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'id invalid' }));
        return;
      }

      // /api/runs
      if (id === undefined) {
        if (req.method !== 'GET') {
          res.writeHead(405, { Allow: 'GET' });
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(runsStore.listRuns()));
        return;
      }

      // /api/runs/{id}/associate
      if (sub === 'associate') {
        if (req.method !== 'POST') {
          res.writeHead(405, { Allow: 'POST' });
          res.end();
          return;
        }
        readJsonBody(req, res, (data) => {
          try {
            const run = runsStore.associateProfile(id, {
              profileId: data && data.profileId,
              expectedRevision: data && data.expectedRevision,
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(run));
          } catch (e) {
            respondRunError(res, e);
          }
        });
        return;
      }

      // /api/runs/{id}/dissociate
      if (sub === 'dissociate') {
        if (req.method !== 'POST') {
          res.writeHead(405, { Allow: 'POST' });
          res.end();
          return;
        }
        readJsonBody(req, res, (data) => {
          try {
            const run = runsStore.dissociateProfile(id, {
              expectedRevision: data && data.expectedRevision,
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(run));
          } catch (e) {
            respondRunError(res, e);
          }
        });
        return;
      }

      // /api/runs/{id}
      if (req.method === 'GET') {
        const run = runsStore.getRun(id);
        if (!run) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'run-ul ' + id + ' nu există' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(run));
        return;
      }
      res.writeHead(405, { Allow: 'GET' });
      res.end();
      return;
    }

    if (isApi) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'not found' }));
      return;
    }

    // orice altă cerere e tratată ca fișier static din public/
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }

    const resolved = resolveStaticPath(publicDir, pathname);
    if (!resolved.ok) {
      if (resolved.status === 400) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: resolved.message }));
      } else {
        res.writeHead(resolved.status);
        res.end(resolved.message);
      }
      return;
    }

    let content;
    try {
      const stat = fs.statSync(resolved.path);
      if (stat.isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      content = fs.readFileSync(resolved.path);
    } catch (e) {
      res.writeHead(404);
      res.end('not found');
      return;
    }

    const contentType = CONTENT_TYPES[path.extname(resolved.path)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(req.method === 'HEAD' ? undefined : content);
  });

  // wiring intern folosit doar de `startServer`, după ce portul real e
  // cunoscut — nu face parte din contractul public al modulului.
  server.setAllowedOrigins = (allowed) => {
    allowedOrigins = allowed;
  };

  // RF-02b-b: expune închiderea bazei de profiluri, altfel handle-ul SQLite
  // memoizat (deschis lazy de profiles.js) rămâne deschis după ce serverul
  // HTTP se oprește. `close()` intern e sigur de apelat necondiționat —
  // vezi profiles.js (nu deschide baza doar ca s-o închidă la loc).
  // Rămâne disponibil separat pentru un apelant care vrea explicit doar
  // baza, fără să oprească HTTP-ul.
  server.closeProfilesStore = profilesStore.close;
  // RF-02c: la fel, pentru `runsStore` — handle SQLite separat, ownership
  // separat la închidere.
  server.closeRunsStore = runsStore.close;

  // RF-02b-c: `closeProfilesStore` de mai sus nu ajută dacă apelantul
  // oprește serverul cu `.close()` direct pe obiectul brut (fără să treacă
  // prin `startServer(...)`) — atunci nimeni nu-l cheamă și baza rămâne
  // deschisă. Înfășurăm metoda nativă ca ORICE apelant al `close()` să
  // închidă și baza, automat. `nativeClose` păstrează comportamentul
  // nativ: dacă serverul n-a ascultat niciodată, callback-ul primește
  // eroarea `ERR_SERVER_NOT_RUNNING` exact ca înainte — noi doar o
  // propagăm mai departe, nu o înghițim și nu o transformăm.
  // RF-02c: extinde ACELAȘI wrapper (nu creează altul paralel) — la orice
  // închidere a serverului, se închide și `runsStore`, alături de
  // `profilesStore`.
  const nativeClose = server.close.bind(server);
  server.close = (callback) => nativeClose((err) => {
    profilesStore.close();
    runsStore.close();
    if (callback) callback(err);
  });

  return server;
}

// Construiește ȘI pornește serverul. Rezolvă după ce ascultă efectiv, cu
// portul real alocat (`server.address().port`) — esențial pentru portul
// efemer `0` folosit de teste.
function startServer(options = {}) {
  const host = options.host || '127.0.0.1'; // loopback implicit — niciodată wildcard din greșeală (D2)
  const port = options.port !== undefined ? options.port : (process.env.PORT || 5311);
  const sessionsDir = options.sessionsDir || path.join(os.homedir(), '.claude', 'sessions');

  const server = createServer({ ...options, host, port });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      server.setAllowedOrigins(buildAllowedOrigins(address.port));
      console.log('agent-map skeleton running at http://' + host + ':' + address.port + '/');
      console.log('reading sessions from ' + sessionsDir);
      resolve({
        server,
        address,
        port: address.port,
        // RF-02b-c/RF-02c: `server.close()` închide automat și
        // profilesStore, și runsStore (vezi wrapper-ul din `createServer`)
        // — HTTP-ul se oprește întâi
        // (așteaptă cererile active, comportamentul implicit al
        // http.Server#close()), abia apoi se închide baza, deci nu există
        // fereastră în care închiderea bazei să taie o cerere în curs.
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

if (require.main === module) {
  startServer().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { createServer, startServer };
