// Teste unitare pentru server/http-guards.js (RF-01: D3, D4, D9-parțial,
// contractele §2.4 privind Origin, și pinuirea §3.4).
//
// Nu pornim niciun server aici — testăm funcțiile pure direct, ceea ce e
// mai rapid și mai determinist decât o probă HTTP completă pentru logica
// de decizie în sine. Comportamentul integrat (că server.js chiar aplică
// aceste funcții pe cereri reale) e verificat separat în server.test.mjs.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildAllowedOrigins, checkOrigin, resolveStaticPath } = require('../server/http-guards.js');

function req({ method = 'GET', host, origin } = {}) {
  const headers = {};
  if (host !== undefined) headers.host = host;
  if (origin !== undefined) headers.origin = origin;
  return { method, headers };
}

// =============================================================================
// D3 — Origin/Host validat pe host ȘI port, nu doar hostname (§2.3, §2.4)
// =============================================================================

test('checkOrigin: Host și Origin ambele corecte (port real) -> trece pentru PUT', () => {
  const allowed = buildAllowedOrigins(5555);
  const ok = checkOrigin(req({ method: 'PUT', host: 'localhost:5555', origin: 'http://localhost:5555' }), allowed);
  assert.equal(ok, true);
});

test('checkOrigin: Host corect, dar Origin cu ALT port (același hostname) -> respins pentru PUT (D3)', () => {
  // Aceasta e exact granița defectului confirmat pe baseline: hostnameOf()
  // arunca portul din Origin, deci un port diferit trecea pe nedrept.
  const allowed = buildAllowedOrigins(5555);
  const ok = checkOrigin(req({ method: 'PUT', host: 'localhost:5555', origin: 'http://localhost:9999' }), allowed);
  assert.equal(ok, false);
});

test('checkOrigin: Host cu port greșit (Origin altfel corect) -> respins pentru PUT', () => {
  const allowed = buildAllowedOrigins(5555);
  const ok = checkOrigin(req({ method: 'PUT', host: 'localhost:9999', origin: 'http://localhost:5555' }), allowed);
  assert.equal(ok, false);
});

test('checkOrigin: Host lipsă -> respins, indiferent de Origin', () => {
  const allowed = buildAllowedOrigins(5555);
  const ok = checkOrigin(req({ method: 'PUT', origin: 'http://localhost:5555' }), allowed);
  assert.equal(ok, false);
});

// --- Contract §2.4: regula diferă pe METODĂ, nu pe rută -------------------

test('checkOrigin: GET fără Origin, Host corect -> trece (navigare normală)', () => {
  const allowed = buildAllowedOrigins(5555);
  const ok = checkOrigin(req({ method: 'GET', host: 'localhost:5555' }), allowed);
  assert.equal(ok, true);
});

test('checkOrigin: PUT fără Origin, Host corect -> respins (mutațiile cer Origin explicit)', () => {
  const allowed = buildAllowedOrigins(5555);
  const ok = checkOrigin(req({ method: 'PUT', host: 'localhost:5555' }), allowed);
  assert.equal(ok, false);
});

test('checkOrigin: GET cu Origin prezent dar greșit, Host corect -> respins (dacă e prezent, trebuie să se potrivească)', () => {
  const allowed = buildAllowedOrigins(5555);
  const ok = checkOrigin(req({ method: 'GET', host: 'localhost:5555', origin: 'http://evil.com' }), allowed);
  assert.equal(ok, false);
});

// =============================================================================
// §3.4 — buildAllowedOrigins(null/0) construiește un set GOL (pinuit, intenționat)
// =============================================================================

test('buildAllowedOrigins(null) -> hosts și origins goale (sigur implicit înainte de listen)', () => {
  const allowed = buildAllowedOrigins(null);
  assert.equal(allowed.hosts.size, 0);
  assert.equal(allowed.origins.size, 0);
  // Consecință directă: NICIO cerere Host/Origin nu poate trece pe acest set.
  const ok = checkOrigin(req({ method: 'GET', host: 'localhost:5555' }), allowed);
  assert.equal(ok, false);
});

// =============================================================================
// D4 — containment real de fișiere statice (nu startsWith pe prefix de șir)
// =============================================================================

let fixtureRoot;
let publicDir;

before(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rf01-guards-'));
  publicDir = path.join(fixtureRoot, 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(path.join(publicDir, 'sprites'), { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<html>ok</html>');
  fs.writeFileSync(path.join(publicDir, 'sprites', 'pawn.png'), 'binary-fake');

  // director FRATE, nu copil — public-secret, nu public/secret
  const siblingDir = path.join(fixtureRoot, 'public-secret');
  fs.mkdirSync(siblingDir, { recursive: true });
  fs.writeFileSync(path.join(siblingDir, 'leak.txt'), 'SECRET-NU-TREBUIE-SA-APARA');
});

after(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test('resolveStaticPath: cale legitimă adâncă din public/ -> ok, rezolvă corect', () => {
  const r = resolveStaticPath(publicDir, '/sprites/pawn.png');
  assert.equal(r.ok, true);
  assert.equal(r.path, path.join(publicDir, 'sprites', 'pawn.png'));
});

test('resolveStaticPath: /../public-secret/leak.txt -> 403, NU 200 (D4 — prefixul de șir "public" nu mai e suficient)', () => {
  const r = resolveStaticPath(publicDir, '/../public-secret/leak.txt');
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  // conținutul secretului nu trebuie să ajungă nicăieri în rezultat
  assert.ok(!JSON.stringify(r).includes('SECRET-NU-TREBUIE-SA-APARA'));
});

test('resolveStaticPath: traversal cu slash codat (..%2F) -> 403', () => {
  // decodeURIComponent transformă %2F în '/', deci path.resolve vede
  // traversarea reală — dacă am fi comparat pe pathname brut, ar fi scăpat.
  const r = resolveStaticPath(publicDir, '/..%2Fpublic-secret%2Fleak.txt');
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test('resolveStaticPath: separatori Windows backslash în cale -> nu scapă din public/', () => {
  const r = resolveStaticPath(publicDir, '/..\\public-secret\\leak.txt');
  // Pe Windows, path.resolve tratează '\\' ca separator, deci fără fix ar
  // rezolva efectiv în afara root-ului. Cerem explicit ca rezultatul fie să
  // fie respins (403), fie, dacă e acceptat, să NU fi ieșit din publicDir.
  if (r.ok) {
    assert.ok(
      r.path === publicDir || r.path.startsWith(publicDir + path.sep),
      `calea rezolvată a ieșit din public/: ${r.path}`
    );
  } else {
    assert.equal(r.status, 403);
  }
});

test('resolveStaticPath: byte nul în cale -> 400, nu 403 și nu 200', () => {
  const r = resolveStaticPath(publicDir, '/index.html%00.png');
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test('resolveStaticPath: "/" -> rezolvă la index.html din interiorul public/', () => {
  const r = resolveStaticPath(publicDir, '/');
  assert.equal(r.ok, true);
  assert.equal(r.path, path.join(publicDir, 'index.html'));
});
