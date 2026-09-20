// body.js — reads a request body and parses it as JSON under a size limit
// (D8). Shared by server.js (/api/open, /api/reveal, /api/new-session) and
// state.js (PUT /api/state) so the limit and 413/400 behavior are not
// duplicated in four places.

const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB
// Known limitation (RF-01f closes D8 by scope rather than technically): the
// limit above protects memory in all cases. A client that declares an accurate
// Content-Length AND sends a complete body over ~1.1 MiB may receive ECONNRESET
// instead of 413 (measured: 1.05 MiB -> 413; 1.2 MiB and above -> no 413).
// This is standard HTTP-server behavior in this situation (nginx behaves the
// same way). It is not a practical issue here: the only client is public/app.js
// and `plots` is already schema-limited to 512 KiB (state.js), less than half
// this limit. Reevaluate if RPG Factory ever gains clients that send large bodies.
const DRAIN_TIMEOUT_MS = 2000; // time limit for a hostile client that stops sending

// The two rejection paths (declared Content-Length over the limit versus
// accumulated bytes over the limit without Content-Length) use different
// strategies because they genuinely require different behavior.
function rejectTooLargeImmediate(req, res) {
  // Declared Content-Length exceeds the limit: no useful in-flight bytes need
  // waiting for. The client stated its size; draining before responding could
  // wait forever when a client declares a large body but sends little (the
  // measured regression for a draining version of this path was a deterministic
  // 2051 ms and then nothing). req.pause() stops accumulation of already
  // buffered data without reading/processing it; respond immediately.
  req.pause();
  if (res.writableEnded || (res.socket && res.socket.destroyed)) return;
  res.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' });
  res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
}

function rejectTooLargeAfterDrain(req, res) {
  // Accumulation path: drain incoming `req` data first, then respond, in that
  // order. Responding first with Connection: close makes Node start its own
  // socket-closing mechanism on 'finish', independently of our drain. If unread
  // bytes remain in the kernel buffer, that internal destroy sends RST over our
  // response. Draining first leaves no unread bytes when we write, so any later
  // close is a clean FIN.
  drain(req, res, () => {
    if (res.writableEnded || (res.socket && res.socket.destroyed)) return;
    res.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' });
    res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
  });
}

// Drains `req` (reads and discards everything still arriving), then calls
// `callback`. On the normal path (the client finishes sending or disconnects),
// nothing is destroyed because a full drain is sufficient. On timeout (a
// hostile client sends nothing for DRAIN_TIMEOUT_MS), write the response first
// via callback, then destroy a still-live socket on the response's 'finish'
// event. This avoids cutting off the response just written: res.end() only
// queues data and does not guarantee it reached the wire in the same tick.
function drain(req, res, callback) {
  if (req.readableEnded || req.destroyed) {
    callback();
    return;
  }

  let done = false;

  const timer = setTimeout(() => {
    if (done) return;
    done = true;
    callback();
    res.once('finish', () => {
      if (!req.destroyed) req.destroy();
    });
  }, DRAIN_TIMEOUT_MS);
  timer.unref();

  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    callback();
  };

  req.on('data', () => {}); // discard everything still arriving without processing
  req.once('end', finish);
  req.once('error', finish);
  req.resume();
}

// Reads the body from `req`, enforces `MAX_BODY_BYTES`, and calls
// `callback(data)` only on success (valid non-empty JSON below the limit).
// On any 413/400 error it writes directly to `res` and does not invoke the
// callback, so callers do not need separate handling for these cases.
function readJsonBody(req, res, callback) {
  // Content-Length is immediately available. Reject an over-limit request
  // before processing any body bytes.
  const declaredLength = Number(req.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    rejectTooLargeImmediate(req, res);
    return;
  }

  const chunks = [];
  let total = 0;
  let stopped = false;

  req.on('data', (chunk) => {
    if (stopped) return;
    // Measure accumulated bytes (chunk.length is bytes for Buffer), not the
    // length of an already decoded string; counting characters would let a
    // multi-byte character slip under the limit.
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      stopped = true;
      chunks.length = 0; // accumulated data is no longer needed
      rejectTooLargeAfterDrain(req, res);
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (stopped) return;
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'empty body' }));
      return;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'invalid JSON' }));
      return;
    }

    callback(data);
  });

  // If the socket breaks midway, do not try to respond over a dead connection;
  // simply stop processing.
  req.on('error', () => {
    stopped = true;
  });
}

module.exports = { readJsonBody, MAX_BODY_BYTES };
