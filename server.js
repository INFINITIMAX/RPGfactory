const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { getRank } = require('./rank');
const { getActivityState } = require('./status');
const { handleGetState, handlePutState } = require('./state');

const CLAUDE_HOME = path.join(os.homedir(), '.claude');
const SESSIONS_DIR = path.join(CLAUDE_HOME, 'sessions');
const PORT = process.env.PORT || 5311;

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function readAgents() {
  let files = [];
  try {
    files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'));
  } catch (e) {
    return [];
  }

  return files
    .map((f) => {
      try {
        const raw = fs.readFileSync(path.join(SESSIONS_DIR, f), 'utf8');
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

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
};

function openInClaudeCode(sessionId) {
  const url = 'claude://resume?session=' + sessionId;
  const child = spawn('rundll32', ['url.dll,FileProtocolHandler', url], { stdio: 'ignore', detached: true });
  child.on('error', () => {}); // opener-ul poate lipsi; nu trebuie să oprească serverul
  child.unref();
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/agents') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readAgents()));
    return;
  }

  if (req.url === '/api/open' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      let data;
      try {
        data = JSON.parse(body);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }));
        return;
      }

      if (!data || typeof data.sessionId !== 'string' || !data.sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'missing sessionId' }));
        return;
      }

      openInClaudeCode(data.sessionId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }

  if (req.url === '/api/state' && req.method === 'GET') {
    handleGetState(req, res);
    return;
  }

  if (req.url === '/api/state' && req.method === 'PUT') {
    handlePutState(req, res);
    return;
  }

  // orice altă cerere e tratată ca fișier static din public/ — index.html
  // pentru rădăcină, altfel calea exactă cerută (ex. /app.js, /style.css)
  const requestedPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(__dirname, 'public', requestedPath);

  // apără-te de path traversal (ex. /../server.js) — fișierul rezolvat
  // trebuie să rămână în interiorul public/
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  let content;
  try {
    content = fs.readFileSync(filePath);
  } catch (e) {
    res.writeHead(404);
    res.end('not found');
    return;
  }

  const contentType = CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
});

server.listen(PORT, () => {
  console.log('agent-map skeleton running at http://localhost:' + PORT + '/');
  console.log('reading sessions from ' + SESSIONS_DIR);
});
