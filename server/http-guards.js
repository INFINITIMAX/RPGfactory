// server/http-guards.js — validare de origine (D2/D3) și containment de
// fișiere statice (D4/D9). Separat de server.js pentru că sunt reguli de
// securitate care trebuie citite (și, ulterior, testate) izolat de dispatch.

const path = require('path');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

// Construiește setul de origini/host-uri permise din portul pe care
// serverul CHIAR ascultă (aflat abia după listen() — esențial pentru portul
// efemer 0 folosit de teste). `port` poate fi null dacă încă nu se știe;
// în acel caz nimic nu trece verificarea, ceea ce e sigur implicit.
function buildAllowedOrigins(port) {
  if (!port) return { hosts: new Set(), origins: new Set() };

  const hosts = new Set(['localhost:' + port, '127.0.0.1:' + port, '[::1]:' + port]);
  const origins = new Set();
  for (const host of hosts) origins.add('http://' + host);
  return { hosts, origins };
}

// Verifică Host + Origin pentru o cerere sub /api/. Host trebuie să se
// potrivească exact (host ȘI port) cu una dintre adresele permise —
// hostname-ul singur nu mai e suficient (asta era D3). Pentru mutații,
// Origin e obligatoriu; pentru GET/HEAD, absența lui e acceptată (navigare
// normală), dar dacă e prezent trebuie să se potrivească.
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

// Rezolvă un pathname (deja fără query string) la o cale absolută sub
// `publicDir`, cu containment real de director — nu `startsWith` pe prefix
// de șir (asta era D4: `public-secret` trecea pentru că prefixul „public”
// se potrivea literal, deși e un director frate, nu un copil).
function resolveStaticPath(publicDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (e) {
    return { ok: false, status: 400, message: 'invalid path encoding' };
  }

  // un byte nul în cale nu are ce căuta într-un nume de fișier legitim —
  // e fie o încercare de truncare a căii, fie input corupt.
  if (decoded.indexOf('\0') !== -1) {
    return { ok: false, status: 400, message: 'invalid path' };
  }

  const rel = decoded === '/' ? '/index.html' : decoded;
  const root = path.resolve(publicDir);
  const resolved = path.resolve(root, '.' + rel);

  // containment real: `resolved` trebuie să fie *sub* rădăcină, nu doar să
  // înceapă cu șirul ei — `path.sep` la final elimină cazul `public-secret`.
  const contained = resolved === root || resolved.startsWith(root + path.sep);
  if (!contained) {
    return { ok: false, status: 403, message: 'forbidden' };
  }

  return { ok: true, path: resolved };
}

module.exports = { buildAllowedOrigins, checkOrigin, resolveStaticPath };
