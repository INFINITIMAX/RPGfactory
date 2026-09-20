// rank.js â€” calculates an agent's rank (Fleet Admiral / Captain / Cadet)
// from the model used in its Claude Code run transcript.

const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_HOME = path.join(os.homedir(), '.claude');
const PROJECTS_DIR = path.join(CLAUDE_HOME, 'projects');

// Read only the tail of the .jsonl file, not the entire file: transcripts can
// exceed 5 MB, and the latest interaction's model appears near the end anyway.
// Older lines do not matter for the current rank.
const TAIL_BYTES = 20 * 1024;

// File-path cache invalidated by mtime, avoiding a tail read on every
// three-second poll when the transcript has not changed.
const cache = new Map();

function modelToRank(model) {
  if (!model) return null;
  const m = model.toLowerCase();
  if (m.includes('opus')) return 'Fleet Admiral';
  if (m.includes('sonnet')) return 'Captain';
  if (m.includes('haiku')) return 'Cadet';
  return null;
}

// Claude Code encodes cwd as a folder name by replacing every path separator
// (\, /, :) with '-'. Manually verified: `C:\Users\<user>` becomes
// `C--Users-Lucian-PC` (`:` -> `-`, each `\` -> `-`).
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
  // When the tail was truncated, the first line may be partial (starting in
  // the middle of JSON), so ignore it rather than parsing invalid JSON.
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
    // "model" is not at the line root; it is nested in entry.message.model
    // (the Anthropic response shape, not the transcript-line shape itself).
    if (entry.type === 'assistant' && entry.message && entry.message.model) {
      return entry.message.model;
    }
  }
  return null;
}

// Returns { rank, model } for a given (cwd, sessionId). Never throws: any error
// (missing file, permissions, etc.) becomes { rank: null, model: null } so one
// inaccessible agent transcript cannot break /api/agents.
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
