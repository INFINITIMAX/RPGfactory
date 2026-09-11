const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
        return {
          pid: data.pid,
          sessionId: data.sessionId,
          name: data.name,
          cwd: data.cwd,
          status: data.status,
          kind: data.kind,
          updatedAt: data.updatedAt,
          alive: isAlive(data.pid),
        };
      } catch (e) {
        return null;
      }
    })
    .filter((a) => a && a.alive);
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/agents') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readAgents()));
    return;
  }
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log('agent-map skeleton running at http://localhost:' + PORT + '/');
  console.log('reading sessions from ' + SESSIONS_DIR);
});
