// adapters/claude-code.js — RF-03a: primul adaptor real, sondare Claude Code.
//
// Funcție PURĂ, testabilă: face UN ciclu de sondare, nu conține niciun timer
// intern (timer-ul e wiring, în server.js — lecția RF-02: logica separată de
// wiring-ul HTTP/timer se testează mult mai simplu).
//
// Citește exact același mecanism ca `readAgents()` din server.js: listează
// `*.json` din `sessionsDir`, parsează fiecare, ia `sessionId`/`cwd`/`pid`.
// Nu-l reinventăm.
//
// Diferență deliberată față de `readAgents()`: `readAgents()` filtrează
// sesiunile moarte (`.filter(a => a && a.alive)`) — nu le mai raportează
// deloc. Acest adaptor NU filtrează: observă TOATE sesiunile găsite, vii sau
// moarte, ca lifecycle-ul din `runs` să rămână onest (spec.md §4) — o
// sesiune oprită trebuie să ajungă 'stopped', nu să dispară tăcut din
// citiri. Limitare acceptată (documentată, nu reparată în acest lot): dacă
// fișierul de sesiune dispare complet de pe disc între două sondări
// (procesul moare ȘI fișierul se șterge înainte să apucăm să-l vedem mort),
// rândul din `runs` rămâne la ultima stare observată.

const fs = require('fs');
const path = require('path');

// pollClaudeCodeSessions({ sessionsDir, isAlive, runsStore, now }) -> { observed, errors }
//
// `now` nu e folosit direct aici (runsStore/observeRun își are propriul
// `now` injectat la construcție) — primit din simetrie cu restul opțiunilor
// injectabile ale proiectului, în caz că un apel viitor are nevoie de el
// pentru diagnosticare; neutilizat momentan.
function pollClaudeCodeSessions({ sessionsDir, isAlive, runsStore } = {}) {
  let files = [];
  try {
    files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.json'));
  } catch (e) {
    return { observed: 0, errors: 0 };
  }

  let observed = 0;
  let errors = 0;

  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(sessionsDir, f), 'utf8');
      const data = JSON.parse(raw);
      const lifecycle = isAlive(data.pid) ? 'running' : 'stopped';
      runsStore.observeRun({
        sourceHarness: 'claude-code',
        nativeId: data.sessionId,
        project: data.cwd,
        lifecycle,
      });
      observed += 1;
    } catch (e) {
      errors += 1;
    }
  }

  return { observed, errors };
}

module.exports = { pollClaudeCodeSessions };
