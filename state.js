// state.js — agent archive persistence (T-06), reproducing bot-crossing's
// safe-write mechanics (server/api.mjs): atomic write (temporary file +
// rename), serialized write queue, and optimistic concurrency on `updatedAt`.
// The schema is reduced to what this application uses: `archived` +
// `archivedAt` + `plots`, without `seen`/`hiddenProjects`/etc. `plots` is the
// zone layout calculated by public/zones.js (T-08), persisted so it need not be
// rebuilt from scratch on every server start/page reload (wiring arrives in T-10).
//
// RF-01: no file path is a module constant. `dataDir`, and the derived state
// file, are calculated per store and injected through `createStateStore(options)`.
// Tests can therefore use temporary directories rather than real data/state.json.

const fs = require('fs');
const path = require('path');
const { readJsonBody } = require('./body');

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ALLOWED_KEYS = new Set(['archived', 'archivedAt', 'plots', 'version', 'baseUpdatedAt']);
const MAX_ARCHIVED_ITEMS = 10000;
const MAX_ARCHIVED_ITEM_LEN = 512;
const MAX_ARCHIVED_AT_KEYS = 10000;
const MAX_PLOTS_BYTES = 512 * 1024;
const MAX_PLOTS_DEPTH = 8;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Searches for `__proto__`/`constructor`/`prototype` as key names at any depth
// in `plots`; an arbitrarily nested object can hide prototype pollution just
// as effectively as a first-level object.
function hasReservedKey(value) {
  if (!isPlainObject(value)) return false;
  for (const key of Object.keys(value)) {
    if (RESERVED_KEYS.has(key)) return true;
    if (hasReservedKey(value[key])) return true;
  }
  return false;
}

// Depth of a plain object: an object without keys has depth 1, and each nested
// level adds one.
function objectDepth(value) {
  if (!isPlainObject(value)) return 0;
  const keys = Object.keys(value);
  if (keys.length === 0) return 1;
  let max = 0;
  for (const key of keys) {
    const d = objectDepth(value[key]);
    if (d > max) max = d;
  }
  return max + 1;
}

// Validates a PUT patch (D6). Checks EVERYTHING before touching disk so any
// failure leaves on-disk state unchanged. Unknown fields are explicitly
// rejected rather than silently ignored.
function validateStatePatch(data) {
  if (!isPlainObject(data)) return { ok: false, message: 'body must be a JSON object' };

  for (const key of Object.keys(data)) {
    if (!ALLOWED_KEYS.has(key)) return { ok: false, message: 'unknown field: ' + key };
  }

  const baseUpdatedAt = data.baseUpdatedAt;
  if (typeof baseUpdatedAt !== 'number' || !Number.isFinite(baseUpdatedAt)) {
    return { ok: false, message: 'baseUpdatedAt must be a finite number' };
  }

  if ('version' in data && data.version !== 1) {
    return { ok: false, message: 'version must be exactly 1' };
  }

  let archived;
  if ('archived' in data) {
    if (!Array.isArray(data.archived)) return { ok: false, message: 'archived must be an array' };
    if (data.archived.length > MAX_ARCHIVED_ITEMS) {
      return { ok: false, message: 'archived exceeds ' + MAX_ARCHIVED_ITEMS + ' items' };
    }
    for (const item of data.archived) {
      if (typeof item !== 'string' || item.length > MAX_ARCHIVED_ITEM_LEN) {
        return { ok: false, message: 'archived items must be strings up to ' + MAX_ARCHIVED_ITEM_LEN + ' chars' };
      }
    }
    archived = data.archived;
  }

  let archivedAt;
  if ('archivedAt' in data) {
    if (!isPlainObject(data.archivedAt)) return { ok: false, message: 'archivedAt must be an object' };
    const keys = Object.keys(data.archivedAt);
    if (keys.length > MAX_ARCHIVED_AT_KEYS) {
      return { ok: false, message: 'archivedAt exceeds ' + MAX_ARCHIVED_AT_KEYS + ' keys' };
    }
    for (const key of keys) {
      if (RESERVED_KEYS.has(key)) return { ok: false, message: 'archivedAt has reserved key: ' + key };
      const value = data.archivedAt[key];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return { ok: false, message: 'archivedAt values must be finite numbers' };
      }
    }
    archivedAt = data.archivedAt;
  }

  let plots;
  if ('plots' in data) {
    if (!isPlainObject(data.plots)) return { ok: false, message: 'plots must be an object' };
    if (hasReservedKey(data.plots)) return { ok: false, message: 'plots has a reserved key' };
    if (objectDepth(data.plots) > MAX_PLOTS_DEPTH) {
      return { ok: false, message: 'plots exceeds max depth of ' + MAX_PLOTS_DEPTH };
    }
    if (Buffer.byteLength(JSON.stringify(data.plots), 'utf8') > MAX_PLOTS_BYTES) {
      return { ok: false, message: 'plots exceeds ' + MAX_PLOTS_BYTES + ' bytes' };
    }
    plots = data.plots;
  }

  return { ok: true, baseUpdatedAt, archived, archivedAt, plots };
}

function createStateStore(options = {}) {
  const dataDir = options.dataDir || path.join(__dirname, 'data');
  const now = options.now || (() => Date.now());
  const stateFile = path.join(dataDir, 'state.json');

  function emptyState() {
    return { version: 1, archived: [], archivedAt: {}, plots: {}, updatedAt: 0 };
  }

  function readState() {
    try {
      const raw = fs.readFileSync(stateFile, 'utf8');
      const parsed = JSON.parse(raw);
      return Object.assign(emptyState(), parsed);
    } catch (e) {
      return emptyState();
    }
  }

  // Serialized write queue per store. A global queue would mix writes from
  // distinct stores, such as parallel tests. Two nearly simultaneous PUTs must
  // not overwrite each other between reading current state and writing it.
  let writeQueue = Promise.resolve();
  let tmpSeq = 0;
  function serialise(fn) {
    writeQueue = writeQueue.then(fn, fn);
    return writeQueue;
  }

  // Writes `patch` to disk while calculating a new monotonic revision (D7).
  // This is a counter rather than `Date.now()` so two writes in one millisecond
  // remain distinguishable. Must be called from an already serialized section,
  // either through `writeState` or from `handlePutState`.
  function persist(patch) {
    const current = readState();
    const nextRev = Math.max(Number(current.updatedAt) || 0, 0) + 1;
    const state = {
      version: 1,
      archived: (patch && patch.archived) || [],
      archivedAt: (patch && patch.archivedAt) || {},
      plots: (patch && patch.plots) || {},
      updatedAt: nextRev,
      savedAt: new Date(now()).toISOString(), // human display only, never used for CAS
    };

    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = stateFile + '.' + process.pid + '.' + (++tmpSeq) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    try {
      fs.renameSync(tmp, stateFile);
    } catch (e) {
      // If rename fails (full disk, permissions), try to clean up the temporary
      // file without allowing a cleanup error to mask the original error.
      try {
        fs.unlinkSync(tmp);
      } catch (cleanupErr) {
        // Ignore it; the original I/O error is the one that matters (D11).
      }
      throw e;
    }
    return state;
  }

  function writeState(patch) {
    return serialise(() => persist(patch));
  }

  // `res.writeHead`/`res.end` can throw if headers were sent or the client
  // closed the socket, including from inside the function serialized in
  // `writeQueue`. Without protection, the exception escapes, `writeQueue`
  // becomes a rejected promise, and `handlePutState` does not catch the value
  // returned by `serialise`, causing an unhandledRejection that may stop the
  // process (RF-01b). Catch and log here rather than silently swallowing it,
  // while keeping the queue usable for later writes.
  function respond(res, status, body) {
    try {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    } catch (e) {
      console.error('state.js: response ' + status + ' could not be sent (client disconnected?):', e);
    }
  }

  function handleGetState(req, res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readState()));
  }

  function handlePutState(req, res) {
    readJsonBody(req, res, (data) => {
      const validation = validateStatePatch(data);
      if (!validation.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: validation.message }));
        return;
      }

      // Keep reading current state for CAS and writing in the same serialized
      // section; otherwise another request could slip between them.
      serialise(() => {
        const current = readState();
        if (validation.baseUpdatedAt !== current.updatedAt) {
          respond(res, 409, current);
          return;
        }

        let next;
        try {
          next = persist({
            archived: validation.archived,
            archivedAt: validation.archivedAt,
            plots: validation.plots,
          });
        } catch (e) {
          // D11: a disk error must produce a response rather than an abandoned
          // request. Catch it here without breaking the queue promise so later
          // writes remain possible.
          respond(res, 500, { ok: false, error: 'disk write error' });
          return;
        }

        respond(res, 200, next);
      });
    });
  }

  return { readState, writeState, handleGetState, handlePutState };
}

module.exports = { createStateStore };
