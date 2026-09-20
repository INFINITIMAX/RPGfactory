// server/http-guards.js — origin validation (D2/D3) and static-file
// containment (D4/D9). Kept separate from server.js so these security rules
// can be read and tested independently from dispatch.

const path = require('path');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

// Builds allowed origins/hosts from the port on which the server ACTUALLY
// listens, known only after listen() and essential for ephemeral test port 0.
// `port` may be null when unknown; then nothing passes, a safe default.
function buildAllowedOrigins(port) {
  if (!port) return { hosts: new Set(), origins: new Set() };

  const hosts = new Set(['localhost:' + port, '127.0.0.1:' + port, '[::1]:' + port]);
  const origins = new Set();
  for (const host of hosts) origins.add('http://' + host);
  return { hosts, origins };
}

// Checks Host + Origin for a request under /api/. Host must exactly match both
// host AND port of an allowed address; hostname alone is insufficient (D3).
// Origin is required for mutations. GET/HEAD may omit it for normal navigation,
// but when present it must match.
function checkOrigin(req, allowed) {
  const hostHeader = req.headers.host;
  if (!hostHeader || !allowed.hosts.has(hostHeader)) return false;

  const origin = req.headers.origin;
  if (MUTATING_METHODS.has(req.method)) {
    return typeof origin === 'string' && allowed.origins.has(origin);
  }

  if (origin === undefined) return true;
  return allowed.origins.has(origin);
}

// Resolves a pathname (already without a query string) to an absolute path
// beneath `publicDir`, using real directory containment rather than string-
// prefix `startsWith`. D4 allowed `public-secret` because "public" matched
// literally even though it was a sibling directory, not a child.
function resolveStaticPath(publicDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (e) {
    return { ok: false, status: 400, message: 'invalid path encoding' };
  }

  // A null byte cannot belong in a legitimate file path. It indicates either
  // a path-truncation attempt or corrupt input.
  if (decoded.indexOf('\0') !== -1) {
    return { ok: false, status: 400, message: 'invalid path' };
  }

  const rel = decoded === '/' ? '/index.html' : decoded;
  const root = path.resolve(publicDir);
  const resolved = path.resolve(root, '.' + rel);

  // Real containment: `resolved` must be *under* the root, not merely start
  // with its string. The trailing `path.sep` excludes `public-secret`.
  const contained = resolved === root || resolved.startsWith(root + path.sep);
  if (!contained) {
    return { ok: false, status: 403, message: 'forbidden' };
  }

  return { ok: true, path: resolved };
}

module.exports = { buildAllowedOrigins, checkOrigin, resolveStaticPath };
