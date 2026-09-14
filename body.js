// body.js — citește body-ul unei cereri și îl parsează ca JSON, cu plafon de
// dimensiune (D8). Partajat între server.js (rutele /api/open, /api/reveal,
// /api/new-session) și state.js (PUT /api/state), ca limita și
// comportamentul 413/400 să nu se dubleze în patru locuri diferite.

const MAX_BODY_BYTES = 1024 * 1024; // 1 MiB
// Limitare cunoscută (RF-01f, închide D8 prin decizie de scop, nu tehnică):
// plafonul de mai sus protejează memoria în toate cazurile. Dar un client
// care declară Content-Length corect ȘI trimite integral un body peste
// ~1.1 MiB poate primi ECONNRESET în loc de 413 (măsurat: 1.05 MiB -> 413;
// de la 1.2 MiB în sus -> nu). E comportamentul standard al serverelor HTTP
// în această situație (nginx face la fel). Nu e o problemă în practică aici:
// singurul client e public/app.js, iar `plots` e deja limitat la 512 KiB de
// schemă (state.js), sub jumătate din acest plafon. Dacă RPG Factory capătă
// vreodată clienți care trimit body-uri mari, limitarea trebuie reevaluată.
const DRAIN_TIMEOUT_MS = 2000; // plafon de timp: client ostil care nu mai trimite nimic

// Cele două căi de refuz (Content-Length declarat peste plafon vs.
// acumulare peste plafon fără Content-Length) folosesc strategii diferite,
// pentru că au nevoie reală de comportamente diferite.
function rejectTooLargeImmediate(req, res) {
  // Content-Length declarat peste plafon: nu mai există niciun octet „în
  // zbor" de așteptat cu folos — clientul a spus câți trimite, iar dacă am
  // mai drena înainte de a răspunde, am aștepta octeți care, la un client
  // care a declarat mult și a trimis puțin, nu mai vin niciodată (asta era
  // regresia măsurată la o variantă cu drenaj pe această cale: 2051 ms
  // determinist, apoi nimic). req.pause() oprește orice acumulare a ce a
  // ajuns deja în buffer, fără să-l citească/proceseze; scriem răspunsul pe
  // loc.
  req.pause();
  if (res.writableEnded || (res.socket && res.socket.destroyed)) return;
  res.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' });
  res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
}

function rejectTooLargeAfterDrain(req, res) {
  // Calea de acumulare: golim întâi ce mai vine pe `req`, apoi răspundem —
  // în ordinea asta, nu invers. Dacă am răspunde întâi (cu Connection:
  // close), Node însuși pornește propriul mecanism de închidere a
  // socketului la 'finish', independent de drenajul nostru; dacă mai erau
  // octeți necitiți în bufferul de kernel în acel moment, acel destroy
  // intern trimite RST peste răspunsul nostru. Drenând întâi, nu mai rămân
  // octeți necitiți când scriem — orice închidere ulterioară e un FIN curat.
  drain(req, res, () => {
    if (res.writableEnded || (res.socket && res.socket.destroyed)) return;
    res.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' });
    res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
  });
}

// Golește `req` (citește și aruncă tot ce mai vine), apoi cheamă
// `callback`. Pe calea normală (clientul termină de trimis sau conexiunea
// pică), nu distrugem nimic — drenajul complet e suficient. Pe calea de
// timeout (client ostil, nu mai trimite nimic în DRAIN_TIMEOUT_MS), scriem
// întâi răspunsul (`callback()`), și abia după aceea, dacă socketul mai e
// viu, îl distrugem — legat de evenimentul 'finish' al lui `res`, ca să nu
// riscăm să tăiem chiar răspunsul pe care tocmai l-am scris (res.end() doar
// pune datele în coada de scriere, nu garantează că au ajuns pe fir în
// același tick).
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

  req.on('data', () => {}); // aruncă tot ce mai vine, fără procesare
  req.once('end', finish);
  req.once('error', finish);
  req.resume();
}

// Citește body-ul cerut de `req`, respectă `MAX_BODY_BYTES` și cheamă
// `callback(data)` doar dacă totul a mers bine (JSON valid, nevid, sub
// plafon). La orice eroare (413/400) scrie direct răspunsul pe `res` și nu
// mai cheamă callback-ul — apelantul nu trebuie să mai trateze cazurile de
// eroare separat.
function readJsonBody(req, res, callback) {
  // Content-Length e disponibil imediat — dacă depășește plafonul, refuzăm
  // fără să mai fi procesat vreun octet din body.
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
    // Măsurăm pe octeți acumulați (chunk.length e în bytes pentru Buffer),
    // nu pe lungimea unui șir deja decodat — un caracter multi-byte ar
    // trece pe sub limită dacă am număra caractere.
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      stopped = true;
      chunks.length = 0; // nu mai avem nevoie de ce am acumulat până acum
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

  // dacă socket-ul se rupe la mijloc, nu mai încercăm să răspundem pe o
  // conexiune moartă — doar oprim procesarea.
  req.on('error', () => {
    stopped = true;
  });
}

module.exports = { readJsonBody, MAX_BODY_BYTES };
