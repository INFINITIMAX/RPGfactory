// status.js — calculează starea reală (working/waiting/sleeping) a unui agent,
// folosind exact metoda bot-crossing: awaitingReply() peste coada transcript-ului.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { encodeCwd } = require('./rank');

const CLAUDE_HOME = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_HOME, 'projects');

const ACTIVE_WINDOW_MS = 30 * 60 * 1000; // 30 minute
const TAIL_BYTES = 64 * 1024; // 64KB — diferit de cei 20KB din rank.js, ca la bot-crossing

// cache pe cale de fișier, invalidat pe mtime — evită re-citirea cozii la
// fiecare poll dacă transcript-ul nu s-a schimbat între timp.
const cache = new Map();

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

// Parcurge coada transcript-ului de la ultima linie spre prima. Oprește
// căutarea la prima linie de tip 'user' (întoarce false — modelul urmează
// să vorbească) sau la prima linie de tip 'assistant' găsită.
function awaitingReplyFromText(text, truncated) {
  const lines = text.split('\n');
  // dacă am tăiat coada, prima linie poate fi parțială — o ignorăm.
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

    if (entry.type === 'user') return false;
    if (entry.type !== 'assistant') continue;

    const content = (entry.message && entry.message.content) || [];
    const usedTool = Array.isArray(content) && content.some((c) => c && c.type === 'tool_use');
    if (usedTool) return false;

    const stopReason = entry.message && entry.message.stop_reason;
    return stopReason !== 'tool_use';
  }
  return false;
}

// Întoarce { activity } pentru un (cwd, sessionId) dat. Nu aruncă niciodată —
// orice eroare (fișier lipsă, JSON invalid) degradează la { activity: null }.
function getActivityState(cwd, sessionId) {
  if (!cwd || !sessionId) return { activity: null };

  const filePath = path.join(PROJECTS_DIR, encodeCwd(cwd), sessionId + '.jsonl');

  let mtimeMs;
  try {
    mtimeMs = fs.statSync(filePath).mtimeMs;
  } catch (e) {
    return { activity: null };
  }

  const fresh = Date.now() - mtimeMs < ACTIVE_WINDOW_MS;
  if (!fresh) return { activity: 'sleeping' };

  const cached = cache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) {
    return { activity: cached.activity };
  }

  let activity;
  try {
    const { text, truncated } = readTail(filePath, TAIL_BYTES);
    activity = awaitingReplyFromText(text, truncated) ? 'waiting' : 'working';
  } catch (e) {
    activity = null;
  }

  cache.set(filePath, { mtimeMs, activity });
  return { activity };
}

module.exports = { getActivityState };
