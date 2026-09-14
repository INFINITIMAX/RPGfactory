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
