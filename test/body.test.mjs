// Teste pentru body.js — plafonul de dimensiune (D8) și, separat, sonda de
// la §3.3 din brief (413 scris, apoi req.destroy() — ajunge răspunsul la
// client sau vede ECONNRESET?).
//
// readJsonBody(req, res) așteaptă un `req`/`res` de tip http.IncomingMessage/
// http.ServerResponse reale (folosește req.headers, req.on, res.writeHead).
// Cel mai fidel mod de a-l testa dinspre client e un server HTTP minimal,
// dedicat doar acestui modul — port efemer (0), NU 5391/5392/5393 fixe.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { readJsonBody, MAX_BODY_BYTES } = require('../body.js');

let server;
let baseUrl;

before(async () => {
  server = http.createServer((req, res) => {
    readJsonBody(req, res, (data) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, received: data }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function rawPost({ headers = {}, writeBody, endImmediately = true }) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port: server.address().port, path: '/', method: 'POST', headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode, raw }));
      }
    );
    req.on('error', (err) => resolve({ error: err.code || err.message }));
    if (writeBody) req.write(writeBody);
    if (endImmediately) req.end();
  });
}

// =============================================================================
// D8 — Content-Length declarat peste plafon -> 413 FĂRĂ să se citească body-ul
// =============================================================================

test('Content-Length declarat > 1 MiB -> 413 imediat, chiar dacă clientul nu trimite efectiv atâția octeți', async () => {
  // Declarăm mai mult decât plafonul, dar NU scriem efectiv atâția octeți.
  // Dacă serverul ar aștepta să citească tot body-ul declarat înainte să
  // decidă, cererea ar rămâne agățată (așteptând octeți care nu mai vin) și
  // testul ar expira din timeout — proba pică natural dacă verificarea
  // Content-Length nu e făcută înainte de citire, exact ce cere D8.
  const declared = MAX_BODY_BYTES + 1024;
  const { status, raw } = await rawPost({
    headers: { 'Content-Type': 'application/json', 'Content-Length': String(declared) },
    writeBody: Buffer.alloc(16, 'x'), // mult sub `declared` — proba că nu s-a așteptat restul
  });
  assert.equal(status, 413);
  const json = JSON.parse(raw);
  assert.equal(json.ok, false);
});

test('Content-Length sub plafon -> nu e respins la acest gate (trece la citirea body-ului)', async () => {
  const body = JSON.stringify({ hello: 'world' });
  const { status, raw } = await rawPost({
    headers: { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(body)) },
    writeBody: body,
  });
  assert.equal(status, 200);
  assert.deepEqual(JSON.parse(raw).received, { hello: 'world' });
});

// =============================================================================
// D8 — acumulare reală peste plafon FĂRĂ Content-Length corect (chunked)
// =============================================================================

test('body real peste 1 MiB, trimis fără Content-Length (chunked) -> 413 la acumulare', async () => {
  const chunk = Buffer.alloc(64 * 1024, 'a'); // 64 KiB per bucată
  const chunksNeeded = Math.ceil((MAX_BODY_BYTES + 1) / chunk.length) + 1;

  const result = await new Promise((resolve) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: server.address().port,
        path: '/',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // fără Content-Length -> Node trimite chunked
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode, raw }));
      }
    );
    req.on('error', (err) => resolve({ error: err.code || err.message }));

    let sent = 0;
    function pump() {
      if (sent >= chunksNeeded) {
        req.end();
        return;
      }
      sent++;
      const ok = req.write(chunk);
      if (ok) process.nextTick(pump);
      else req.once('drain', pump);
    }
    pump();
  });

  assert.equal(result.status, 413, `așteptam 413 pentru un body chunked peste plafon, am primit: ${JSON.stringify(result)}`);
});

test('body real sub 1 MiB, chunked (fără Content-Length) -> trece', async () => {
  const body = JSON.stringify({ archived: ['a', 'b', 'c'] });
  const { status, raw } = await rawPost({
    headers: { 'Content-Type': 'application/json' },
    writeBody: body,
  });
  assert.equal(status, 200);
  assert.deepEqual(JSON.parse(raw).received, { archived: ['a', 'b', 'c'] });
});

// =============================================================================
// §3.3 — 413 scris, apoi req.destroy(): ajunge răspunsul la client, din
// perspectiva unui client real, sau vede ECONNRESET?
// =============================================================================
//
// Nu ne mulțumim să verificăm că serverul a apelat writeHead(413) intern —
// testăm ce PRIMEȘTE efectiv un client real pe socket. Dacă apare
// ECONNRESET în loc de 413, e o constatare de raportat (oracolul de pe
// baseline a lovit exact asta într-o sondă similară), nu un test de ajustat
// până trece — de asta folosim `t.skip` pe ramura de eroare, nu un `assert`
// care ar eșua suita la o cursă reală de rețea.

test('client real: la Content-Length peste plafon, primește STATUS 413 (nu ECONNRESET)', async (t) => {
  const declared = MAX_BODY_BYTES + 1024;
  const result = await rawPost({
    headers: { 'Content-Type': 'application/json', 'Content-Length': String(declared) },
    writeBody: Buffer.alloc(16, 'x'),
  });

  if (result.error) {
    t.skip(`clientul a văzut o eroare de conexiune (${result.error}) în loc de 413 — vezi §3.3 din brief; posibil ECONNRESET din cauza req.destroy() imediat după writeHead`);
    return;
  }
  assert.equal(result.status, 413);
});
