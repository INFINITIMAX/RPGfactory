// status.js — calculates an agent's actual state (working/waiting/sleeping)
// using the exact bot-crossing method: awaitingReply() over the transcript tail.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { encodeCwd } = require('./rank');

const CLAUDE_HOME = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_HOME, 'projects');

const ACTIVE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const TAIL_BYTES = 64 * 1024; // 64 KB, unlike rank.js's 20 KB, matching bot-crossing

// File-path cache invalidated by mtime, avoiding a tail read on every poll
// when the transcript has not changed.
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

// Walks the transcript tail from the last line to the first. Stops at the
// first 'user' line (returns false because the model should speak next) or
// the first 'assistant' line found.
function awaitingReplyFromText(text, truncated) {
  const lines = text.split('\n');
  // If the tail was truncated, the first line may be partial; ignore it.
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

// Returns { activity } for a given (cwd, sessionId). Never throws; any error
// (missing file, invalid JSON) degrades to { activity: null }.
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
