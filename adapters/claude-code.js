// adapters/claude-code.js — RF-03a: first real adapter, polling Claude Code.
//
// PURE and testable: performs ONE polling cycle and contains no internal timer.
// Timer wiring belongs in server.js; RF-02 showed that separating logic from
// HTTP/timer wiring makes testing much simpler.
//
// Reads the exact same mechanism as `readAgents()` in server.js: lists `*.json`
// in `sessionsDir`, parses each file, and reads `sessionId`/`cwd`/`pid`.
// Do not reinvent it.
//
// Deliberate difference from `readAgents()`: that function filters dead runs
// (`.filter(a => a && a.alive)`) and stops reporting them. This adapter does
// NOT filter: it observes ALL discovered runs, alive or dead, so lifecycle in
// `runs` remains truthful (spec.md §4). A stopped run must become 'stopped',
// not silently disappear. Accepted limitation (documented, not fixed here):
// if a run file disappears entirely between polls because the process dies AND
// the file is removed before its dead state is observed, the `runs` row retains
// its last observed state.

const fs = require('fs');
const path = require('path');

// pollClaudeCodeSessions({ sessionsDir, isAlive, runsStore, now }) -> { observed, errors }
//
// `now` is not used directly here because runsStore/observeRun has its own
// construction-injected clock. It is accepted for symmetry with the project's
// other injectable options in case future diagnostics need it; currently unused.
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
