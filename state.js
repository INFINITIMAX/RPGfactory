// state.js — persistență pentru arhivarea agenților (T-06), reproducând
// exact mecanica de scriere sigură din bot-crossing (server/api.mjs):
// scriere atomică (tmp + rename), coadă de scriere serializată, concurență
// optimistă pe `updatedAt`. Schema e simplificată la ce ne trebuie efectiv:
// `archived` + `archivedAt` + `plots` (fără `seen`/`hiddenProjects`/etc.,
// care nu există la noi). `plots` e layout-ul de zone calculat de
// public/zones.js (T-08), salvat ca să nu se recalculeze de la zero la
// fiecare pornire de server/reîncărcare de pagină (wiring-ul vine la T-10).

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

function emptyState() {
  return { version: 1, archived: [], archivedAt: {}, plots: {}, updatedAt: 0 };
}

function readState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Object.assign(emptyState(), parsed);
  } catch (e) {
    return emptyState();
  }
}

// coadă de scriere serializată: două PUT-uri care ajung aproape simultan nu
// trebuie să calce unul peste celălalt între citirea stării curente și
// scrierea ei — un fișier tmp comun ar cauza o cursă pe rename (ENOENT), iar
// citire-apoi-scriere nu e atomică peste un await fără lanțul ăsta.
let writeQueue = Promise.resolve();
let tmpSeq = 0;
function serialise(fn) {
  writeQueue = writeQueue.then(fn, fn);
  return writeQueue;
}

function writeState(archived, archivedAt, plots) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const state = {
    version: 1,
    archived: archived || [],
    archivedAt: archivedAt || {},
    plots: plots || {},
    updatedAt: Date.now(),
  };
  const tmp = STATE_FILE + '.' + process.pid + '.' + (++tmpSeq) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
  return state;
}

function handleGetState(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(readState()));
}

function handlePutState(req, res) {
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

    serialise(() => {
      const current = readState();
      const base = data && data.baseUpdatedAt;
      // baseUpdatedAt lipsă sau 0 e permis fără verificare — prima scriere.
      // Comparăm cu `!==`, nu `<`: fișierul se poate întoarce în timp (dacă
      // e restaurat dintr-o copie), iar un client cu o bază mai nouă decât
      // disk-ul ar trece de un test `>` și ar suprascrie starea restaurată.
      if (base && current.updatedAt !== base) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(current));
        return;
      }

      const next = writeState(data && data.archived, data && data.archivedAt, data && data.plots);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(next));
    });
  });
}

module.exports = { readState, writeState, handleGetState, handlePutState };
