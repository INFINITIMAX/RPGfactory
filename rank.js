// rank.js — calculează rangul unui agent (Fleet Admiral / Captain / Cadet)
// pornind de la modelul folosit în transcript-ul sesiunii lui Claude Code.

const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_HOME = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_HOME, 'projects');

// citim doar coada fișierului .jsonl, nu tot fișierul: am văzut transcript-uri
// de 5MB+, iar modelul din ultima interacțiune apare oricum spre finalul
// fișierului (liniile mai vechi nu ne interesează pentru rangul curent).
const TAIL_BYTES = 20 * 1024;

// cache pe cale de fișier, invalidat pe mtime — evită re-citirea cozii la
// fiecare poll de 3 secunde dacă transcript-ul nu s-a schimbat între timp.
const cache = new Map();

function modelToRank(model) {
  if (!model) return null;
  const m = model.toLowerCase();
  if (m.includes('opus')) return 'Fleet Admiral';
  if (m.includes('sonnet')) return 'Captain';
  if (m.includes('haiku')) return 'Cadet';
  return null;
}

// Claude Code encodează cwd-ul într-un nume de folder înlocuind orice
// separator de cale (\, /, :) cu '-'. Verificat manual: `C:\Users\Lucian-PC`
// devine folderul `C--Users-Lucian-PC` (`:` -> `-`, fiecare `\` -> `-`).
function encodeCwd(cwd) {
  return cwd.replace(/[\\/:]/g, '-');
}

function readTail(filePath, size) {
  const stat = fs.statSync(filePath);
  const start = Math.max(0, stat.size - size);
  const length = stat.size - start;
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, start);
    return { text: buffer.toString('utf8'), mtimeMs: stat.mtimeMs, truncated: start > 0 };
  } finally {
    fs.closeSync(fd);
  }
}

function findLastAssistantModel(text, truncated) {
  const lines = text.split('\n');
  // dacă am tăiat coada, prima linie poate fi parțială (începe la mijlocul
  // unui JSON) — o ignorăm ca să nu dăm peste JSON.parse invalid.
  const usableLines = truncated ? lines.slice(1) : lines;

  for (let i = usableLines.length - 1; i >= 0; i--) {
    const line = usableLines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (e) {
      continue;
    }
    // "model" nu e la rădăcina liniei — e imbricat în entry.message.model
    // (formatul răspunsului Anthropic, nu al liniei de transcript în sine).
    if (entry.type === 'assistant' && entry.message && entry.message.model) {
      return entry.message.model;
    }
  }
  return null;
}

// Întoarce { rank, model } pentru un (cwd, sessionId) dat. Nu aruncă
// niciodată — orice eroare (fișier lipsă, permisiuni, etc.) se traduce în
// { rank: null, model: null }, ca /api/agents să nu cadă din cauza unui
// singur agent cu transcript inaccesibil.
function getRank(cwd, sessionId) {
  if (!cwd || !sessionId) return { rank: null, model: null };

  const filePath = path.join(PROJECTS_DIR, encodeCwd(cwd), sessionId + '.jsonl');

  let mtimeMs;
  try {
    mtimeMs = fs.statSync(filePath).mtimeMs;
  } catch (e) {
    return { rank: null, model: null };
  }

  const cached = cache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) {
    return { rank: cached.rank, model: cached.model };
  }

  let model = null;
  try {
    const { text, truncated } = readTail(filePath, TAIL_BYTES);
    model = findLastAssistantModel(text, truncated);
  } catch (e) {
    model = null;
  }

  const result = { rank: modelToRank(model), model };
  cache.set(filePath, { mtimeMs, rank: result.rank, model: result.model });
  return result;
}

module.exports = { getRank, encodeCwd, modelToRank };
