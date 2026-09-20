// server.js — agent-map HTTP server. RF-01: module construction
// (`createServer`) has no side effects: it does not listen, read runs from disk,
// or launch anything. Actual startup is a separate function (`startServer`),
// while the CLI remains a simple entry point at the end of the file
// (`require.main === module`).

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL, URLSearchParams } = require('url');
const { spawn } = require('child_process');
const { getRank } = require('./rank');
const { getActivityState } = require('./status');
const { createStateStore } = require('./state');
const { createProfilesStore } = require('./profiles');
const { createRunsStore } = require('./runs');
const { createLayoutStore } = require('./layout');
const { createSlotStore } = require('./slot-store');
const { groupProjects, pickAccent, profilesByProject, assignSlots } = require('./world');
const { allocateCells } = require('./hex-layout');
const { readJsonBody } = require('./body');
const { buildAllowedOrigins, checkOrigin, resolveStaticPath } = require('./server/http-guards');
const { pollClaudeCodeSessions } = require('./adapters/claude-code');
const { createPiIngestionStore } = require('./pi-ingestion');
const { projectPiKingdom } = require('./pi-kingdom');
const { projectPiMissionBoard } = require('./pi-mission-board');
const { scanPiSubagentsStatuses } = require('./adapters/pi-subagents-files');
const { scanPiSubagentsMissions } = require('./pi-missions');

const CONTENT_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
};

// A control byte, including \r/\n, cannot legitimately appear in sessionId.
// It indicates corrupt input or an injection attempt against the
// `claude://resume?session=...` URL constructed below.
const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

function defaultOpener(target) {
  const child = spawn('rundll32', ['url.dll,FileProtocolHandler', target], {
    stdio: 'ignore',
    detached: true,
  });
  child.on('error', () => {}); // opener may be unavailable; it must not stop the server
  child.unref();
}

function defaultIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

// Translates errors thrown by profiles.js into HTTP responses. `e.code` comes
// from the module ('VALIDATION' -> 400, 'NOT_FOUND' -> 404, 'CONFLICT' -> 409
// with `e.current` attached). An error without `code` is unexpected, such as a
// disk error, and is handled as 500 as in state.js rather than escaping the
// HTTP request callback.
function respondProfileError(res, e) {
  if (e && e.code === 'VALIDATION') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
    return;
  }
  if (e && e.code === 'NOT_FOUND') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
    return;
  }
  if (e && e.code === 'CONFLICT') {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message, current: e.current || null }));
    return;
  }
  console.error('server.js: unexpected profilesStore error:', e);
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'internal error' }));
}

// Like `respondProfileError`, but for errors from runs.js. On CONFLICT,
// `runsStore.associateProfile` may attach either `current` for revision
// mismatch or `activeRuns` for I24 runs blocking association. Forward either
// when present without assuming which one exists.
function respondRunError(res, e) {
  if (e && e.code === 'VALIDATION') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
    return;
  }
  if (e && e.code === 'NOT_FOUND') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
    return;
  }
  if (e && e.code === 'CONFLICT') {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: false,
        error: e.message,
        current: e.current || null,
        activeRuns: e.activeRuns || null,
      })
    );
    return;
  }
  console.error('server.js: unexpected runsStore error:', e);
  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'internal error' }));
}

function resolveFolder(folder) {
  if (typeof folder !== 'string' || !path.isAbsolute(folder)) return null;
  try {
    const stat = fs.statSync(folder);
    return stat.isDirectory() ? folder : null;
  } catch (e) {
    return null;
  }
}

// `sessionsDir` and `isAlive` are injected (D1/D12), preventing real disk
// reads or real process probes in tests. The rest (getRank/getActivityState
// and activity projection) remains unchanged and belongs to RF-03.
function readAgents(sessionsDir, isAlive) {
  let files = [];
  try {
    files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.json'));
  } catch (e) {
    return [];
  }

  return files
    .map((f) => {
      try {
        const raw = fs.readFileSync(path.join(sessionsDir, f), 'utf8');
        const data = JSON.parse(raw);
        const { rank, model } = getRank(data.cwd, data.sessionId);
        const { activity } = getActivityState(data.cwd, data.sessionId);
        return {
          pid: data.pid,
          sessionId: data.sessionId,
          name: data.name,
          cwd: data.cwd,
          status: data.status,
          kind: data.kind,
          updatedAt: data.updatedAt,
          alive: isAlive(data.pid),
          rank: rank,
          model: model,
          activity: activity,
        };
      } catch (e) {
        return null;
      }
    })
    .filter((a) => a && a.alive);
}

// Constructs, but does NOT start, the HTTP server. No side effects: it listens
// on no ports and touches `sessionsDir` only for an actual request.
function createServer(options = {}) {
  const publicDir = options.publicDir || path.join(__dirname, 'public');
  const sessionsDir = options.sessionsDir || path.join(os.homedir(), '.claude', 'sessions');
  const dataDir = options.dataDir || path.join(__dirname, 'data');
  const now = options.now || (() => Date.now());
  const opener = options.opener || defaultOpener;
  const isAlive = options.isAlive || defaultIsAlive;
  // RF-03a: Claude Code run polling interval, injectable like the other
  // options (D1/D12). The five-second default catches lifecycle transitions
  // without needlessly hitting disk.
  const pollIntervalMs = options.pollIntervalMs || 5000;
  // Pi roots are opt-in and must be supplied explicitly by the caller. Never
  // infer home/temp; invalid values disable live reading.
  const piRoots = Array.isArray(options.piRoots) && options.piRoots.every((root) =>
    typeof root === 'string' && root.trim() && path.isAbsolute(root)
  ) ? options.piRoots : [];
  // The mission root is separate from kingdom observations and is never
  // inferred from home, temp, or other Pi roots.
  const piMissionRoot = typeof options.piMissionRoot === 'string' && options.piMissionRoot.trim() && path.isAbsolute(options.piMissionRoot)
    ? options.piMissionRoot : null;

  const stateStore = createStateStore({ dataDir, now });
  // As with stateStore, constructing the store does not open the database
  // (RF-02b §2.1). profiles.js opens it lazily on the first real request that
  // reaches /api/profiles.
  const profilesStore = createProfilesStore({ dbPath: options.dbPath, migrationsDir: options.migrationsDir, now });
  // RF-02c: independently owned SQLite handle, separate from profilesStore,
  // opened just as lazily (see runs.js) without shared close ownership.
  const runsStore = createRunsStore({ dbPath: options.dbPath, migrationsDir: options.migrationsDir, now });
  // RF-05b: independently owned SQLite handle, separate from profilesStore/
  // runsStore, opened just as lazily (see layout.js). Reuses `options.dbPath`/
  // `options.migrationsDir`, NOT a separate configuration path.
  const layoutStore = createLayoutStore({ dbPath: options.dbPath, migrationsDir: options.migrationsDir, now });
  // RF-05c: independently owned SQLite handle, separate from other stores and
  // opened just as lazily (see slot-store.js). Reuses `options.dbPath`/
  // `options.migrationsDir`.
  const slotStore = createSlotStore({ dbPath: options.dbPath, migrationsDir: options.migrationsDir, now });
  // The ledger remains the opt-in fallback when no live Pi roots are configured.
  const piIngestionStore = createPiIngestionStore({ dbPath: options.dbPath, migrationsDir: options.migrationsDir, now });

  // Allowed origins are unknown until the server actually listens, when
  // ephemeral port 0 becomes a real port. Initialize empty/restrictive here;
  // `startServer` fills the set through `server.setAllowedOrigins` immediately
  // after `listen`.
  let allowedOrigins = buildAllowedOrigins(options.port && options.port !== 0 ? options.port : null);

  const server = http.createServer((req, res) => {
    let url;
    try {
      // Route and serve by `url.pathname`, never raw `req.url` (D9), or
      // `?v=1` would become part of the file path.
      url = new URL(req.url, 'http://localhost');
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'invalid URL' }));
      return;
    }
    const pathname = url.pathname;
    const isApi = pathname.startsWith('/api/');

    if (isApi && !checkOrigin(req, allowedOrigins)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'forbidden' }));
      return;
    }

    if (pathname === '/api/agents') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(readAgents(sessionsDir, isAlive)));
      return;
    }

    if (pathname === '/api/open') {
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' });
        res.end();
        return;
      }
      readJsonBody(req, res, (data) => {
        const sessionId = data && data.sessionId;
        if (typeof sessionId !== 'string' || !sessionId || CONTROL_CHARS.test(sessionId)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'missing sessionId' }));
          return;
        }
        opener('claude://resume?session=' + sessionId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    if (pathname === '/api/reveal') {
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' });
        res.end();
        return;
      }
      readJsonBody(req, res, (data) => {
        const folder = resolveFolder(data && data.folder);
        if (!folder) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'folder is invalid or does not exist' }));
          return;
        }
        opener(folder);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    if (pathname === '/api/new-session') {
      if (req.method !== 'POST') {
        res.writeHead(405, { Allow: 'POST' });
        res.end();
        return;
      }
      readJsonBody(req, res, (data) => {
        const folder = resolveFolder(data && data.folder);
        if (!folder) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'folder is invalid or does not exist' }));
          return;
        }
        opener('claude://code/new?' + new URLSearchParams({ folder }).toString());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    if (pathname === '/api/state') {
      if (req.method === 'GET') {
        stateStore.handleGetState(req, res);
        return;
      }
      if (req.method === 'PUT') {
        stateStore.handlePutState(req, res);
        return;
      }
      res.writeHead(405, { Allow: 'GET, PUT' });
      res.end();
      return;
    }

    // RF-02b: /api/profiles and its subpaths. server.js has no router; use
    // `pathname.split('/')` to obtain segments as for every other route here,
    // except this route needs an optional path `id`.
    if (pathname === '/api/profiles' || pathname.startsWith('/api/profiles/')) {
      const segments = pathname.split('/').filter(Boolean); // ['api', 'profiles', id?, sub?]
      const id = segments[2];
      const sub = segments[3];

      if (
        segments.length > 4 ||
        (sub !== undefined && sub !== 'history' && sub !== 'configurations' && sub !== 'runs')
      ) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'not found' }));
        return;
      }

      if (id !== undefined && CONTROL_CHARS.test(id)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid id' }));
        return;
      }

      // /api/profiles
      if (id === undefined) {
        if (req.method === 'POST') {
          readJsonBody(req, res, (data) => {
            try {
              const profile = profilesStore.createProfile({
                name: data && data.name,
                primarySpecialization: data && data.primarySpecialization,
              });
              res.writeHead(201, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(profile));
            } catch (e) {
              respondProfileError(res, e);
            }
          });
          return;
        }
        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(profilesStore.listProfiles()));
          return;
        }
        res.writeHead(405, { Allow: 'GET, POST' });
        res.end();
        return;
      }

      // /api/profiles/{id}/history
      if (sub === 'history') {
        if (req.method !== 'GET') {
          res.writeHead(405, { Allow: 'GET' });
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(profilesStore.getProfileHistory(id)));
        return;
      }

      // /api/profiles/{id}/configurations
      if (sub === 'configurations') {
        if (req.method === 'POST') {
          readJsonBody(req, res, (data) => {
            try {
              const configuration = profilesStore.createConfigurationVersion(id, {
                harness: data && data.harness,
                provider: data && data.provider,
                model: data && data.model,
                instructionsRef: data && data.instructionsRef,
                skillsRef: data && data.skillsRef,
                memoryRef: data && data.memoryRef,
              });
              res.writeHead(201, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(configuration));
            } catch (e) {
              respondProfileError(res, e);
            }
          });
          return;
        }
        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(profilesStore.listConfigurationVersions(id)));
          return;
        }
        res.writeHead(405, { Allow: 'GET, POST' });
        res.end();
        return;
      }

      // /api/profiles/{id}/runs — analogous to /api/profiles/{id}/configurations.
      if (sub === 'runs') {
        if (req.method !== 'GET') {
          res.writeHead(405, { Allow: 'GET' });
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(runsStore.listRunsForProfile(id)));
        return;
      }

      // /api/profiles/{id}
      if (req.method === 'GET') {
        const profile = profilesStore.getProfile(id);
        if (!profile) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'profile ' + id + ' does not exist' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(profile));
        return;
      }
      if (req.method === 'PATCH') {
        readJsonBody(req, res, (data) => {
          try {
            const profile = profilesStore.updateProfile(id, {
              expectedRevision: data && data.expectedRevision,
              changes: data && data.changes,
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(profile));
          } catch (e) {
            respondProfileError(res, e);
          }
        });
        return;
      }
      res.writeHead(405, { Allow: 'GET, PATCH' });
      res.end();
      return;
    }

    // RF-02c: /api/runs and its subpaths. A run `id` may contain ':' using the
    // `sourceHarness:nativeId` formula, which is harmless to
    // `pathname.split('/')` because ':' is not a path separator.
    if (pathname === '/api/runs' || pathname.startsWith('/api/runs/')) {
      const segments = pathname.split('/').filter(Boolean); // ['api', 'runs', 'observe'|id?, sub?]

      // POST /api/runs/observe is a fixed action checked before ID routing so
      // it does not depend on collision with a run literally identified as
      // "observe".
      if (segments.length === 3 && segments[2] === 'observe') {
        if (req.method !== 'POST') {
          res.writeHead(405, { Allow: 'POST' });
          res.end();
          return;
        }
        readJsonBody(req, res, (data) => {
          try {
            const run = runsStore.observeRun({
              sourceHarness: data && data.sourceHarness,
              nativeId: data && data.nativeId,
              project: data && data.project,
              lifecycle: data && data.lifecycle,
            });
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(run));
          } catch (e) {
            respondRunError(res, e);
          }
        });
        return;
      }

      const id = segments[2];
      const sub = segments[3];

      if (segments.length > 4 || (sub !== undefined && sub !== 'associate' && sub !== 'dissociate')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'not found' }));
        return;
      }

      if (id !== undefined && CONTROL_CHARS.test(id)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'invalid id' }));
        return;
      }

      // /api/runs
      if (id === undefined) {
        if (req.method !== 'GET') {
          res.writeHead(405, { Allow: 'GET' });
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(runsStore.listRuns()));
        return;
      }

      // /api/runs/{id}/associate
      if (sub === 'associate') {
        if (req.method !== 'POST') {
          res.writeHead(405, { Allow: 'POST' });
          res.end();
          return;
        }
        readJsonBody(req, res, (data) => {
          try {
            const run = runsStore.associateProfile(id, {
              profileId: data && data.profileId,
              expectedRevision: data && data.expectedRevision,
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(run));
          } catch (e) {
            respondRunError(res, e);
          }
        });
        return;
      }

      // /api/runs/{id}/dissociate
      if (sub === 'dissociate') {
        if (req.method !== 'POST') {
          res.writeHead(405, { Allow: 'POST' });
          res.end();
          return;
        }
        readJsonBody(req, res, (data) => {
          try {
            const run = runsStore.dissociateProfile(id, {
              expectedRevision: data && data.expectedRevision,
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(run));
          } catch (e) {
            respondRunError(res, e);
          }
        });
        return;
      }

      // /api/runs/{id}
      if (req.method === 'GET') {
        const run = runsStore.getRun(id);
        if (!run) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'run ' + id + ' does not exist' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(run));
        return;
      }
      res.writeHead(405, { Allow: 'GET' });
      res.end();
      return;
    }

    function readPiKingdom({ allowLedgerFallback = true } = {}) {
      let observations;
      if (piRoots.length > 0) {
        const scan = scanPiSubagentsStatuses({ roots: piRoots, maxRoots: 8, maxRuns: 1000, maxStatusBytes: 1024 * 1024 });
        if (!scan || scan.ok !== true || !scan.value || !Array.isArray(scan.value.runs)) observations = null;
        else observations = scan.value.runs.map((snapshot) => {
          const timestamps = [snapshot.root, ...(Array.isArray(snapshot.children) ? snapshot.children : [])]
            .flatMap((node) => [node && node.startedAt, node && node.lastActivityAt])
            .filter((timestamp) => typeof timestamp === 'number' && Number.isFinite(timestamp));
          return { snapshot, storedAt: timestamps.length ? Math.max(...timestamps) : null };
        });
      } else if (allowLedgerFallback) {
        observations = runsStore.listRuns().filter((run) => run.source_harness === 'pi-subagents')
          .map((run) => ({ snapshot: piIngestionStore.getSnapshot(run.native_id), storedAt: run.updated_at }));
      } else {
        observations = null;
      }
      return projectPiKingdom(observations, { now: now() });
    }

    if (pathname === '/api/pi/kingdom') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end();
        return;
      }
      try {
        const body = JSON.stringify(readPiKingdom());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(req.method === 'HEAD' ? undefined : body);
      } catch (_) {
        const body = JSON.stringify(projectPiKingdom(null, { now: now() }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(req.method === 'HEAD' ? undefined : body);
      }
      return;
    }

    if (pathname === '/api/pi/mission-board') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end();
        return;
      }
      let kingdom;
      try { kingdom = readPiKingdom({ allowLedgerFallback: false }); } catch (_) { kingdom = projectPiKingdom(null, { now: now() }); }
      let missionScan = null;
      if (piMissionRoot) {
        try {
          missionScan = scanPiSubagentsMissions({ root: piMissionRoot, maxMissions: 200, maxRunsPerMission: 200, maxProofsPerMission: 200, maxMissionBytes: 1024 * 1024, observedAt: now() });
        } catch (_) { missionScan = null; }
      }
      const body = JSON.stringify(projectPiMissionBoard(kingdom, missionScan, { configured: !!piMissionRoot }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }

    // RF-05b: /api/world map zones are recalculated every time, with no
    // separate cache or manual invalidation. GET only; no layout mutation is
    // exposed (see layout.js for why it has no CAS).
    // RF-05c extends the SAME response with `pawns`: each specialist's
    // persistent station and whether they are actively working now (see
    // slot-store.js, which has no CAS for the same reason as layout.js).
    if (pathname === '/api/world') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end();
        return;
      }
      const profiles = profilesStore.listProfiles();
      const projects = groupProjects(profiles);
      const previous = layoutStore.getLayout();
      const laid = allocateCells(projects, previous);
      // Persist immediately so the next request starts from this `previous`;
      // `allocateCells` memory survives a restart.
      layoutStore.saveLayout(laid);
      const zones = projects.map(({ id }) => ({
        project: id,
        cells: laid.get(id) || [],
        accent: pickAccent(id),
      }));

      // RF-05c: persistent stations and Pawns. Calculate AFTER zones so each
      // project already knows `cells.length` (capacity = cells.length * 7,
      // using RF-05b geometry).
      const profileNames = new Map(profiles.map((p) => [p.id, p.name]));
      // 'running' means confirmed work now; 'queued'/'paused' do NOT because
      // they are waiting rather than actively executing.
      const workingIds = new Set(
        runsStore
          .listRuns()
          .filter((run) => run.lifecycle === 'running')
          .map((run) => run.profile_id)
      );
      const projectProfiles = profilesByProject(profiles);
      const pawns = [];
      for (const zone of zones) {
        const capacity = zone.cells.length * 7;
        const previousForProject = slotStore.getSlots().get(zone.project) || new Map();
        const assignment = assignSlots(
          projectProfiles.get(zone.project) || [],
          previousForProject,
          capacity
        );
        slotStore.saveSlots(zone.project, assignment);
        for (const [profileId, slotIndex] of assignment) {
          pawns.push({
            profileId,
            name: profileNames.get(profileId) || profileId,
            project: zone.project,
            slotIndex,
            working: workingIds.has(profileId),
            // RF-06 (not handled here): actual size will come from recent own
            // usage. Fixed at 1 in this batch; spec.md §7 explicitly requires
            // missing consumption data not to produce maximum size.
            sizeFactor: 1,
          });
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ zones, pawns }));
      return;
    }

    if (isApi) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'not found' }));
      return;
    }

    // Treat every other request as a static file under public/.
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end();
      return;
    }

    const resolved = resolveStaticPath(publicDir, pathname);
    if (!resolved.ok) {
      if (resolved.status === 400) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: resolved.message }));
      } else {
        res.writeHead(resolved.status);
        res.end(resolved.message);
      }
      return;
    }

    let content;
    try {
      const stat = fs.statSync(resolved.path);
      if (stat.isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      content = fs.readFileSync(resolved.path);
    } catch (e) {
      res.writeHead(404);
      res.end('not found');
      return;
    }

    const contentType = CONTENT_TYPES[path.extname(resolved.path)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(req.method === 'HEAD' ? undefined : content);
  });

  // Internal wiring used only by `startServer` after the real port is known;
  // not part of the module's public contract.
  server.setAllowedOrigins = (allowed) => {
    allowedOrigins = allowed;
  };

  // RF-02b-b: expose profile-database closing or the memoized SQLite handle,
  // opened lazily by profiles.js, remains open after the HTTP server stops.
  // Internal `close()` is safe to call unconditionally; profiles.js does not
  // open the database merely to close it. Keep this separately available to a
  // caller that explicitly wants only the database closed without stopping HTTP.
  server.closeProfilesStore = profilesStore.close;
  // RF-02c: likewise for runsStore, with separate SQLite handle ownership.
  server.closeRunsStore = runsStore.close;
  // RF-05b: likewise for layoutStore, with separate SQLite handle ownership.
  server.closeLayoutStore = layoutStore.close;
  // RF-05c: likewise for slotStore, with separate SQLite handle ownership.
  server.closeSlotStore = slotStore.close;
  server.closePiIngestionStore = piIngestionStore.close;

  // RF-03a: periodic Claude Code run polling. `createServer` does NOT start
  // the timer during construction (D1); doing so would read real runs from
  // disk merely because someone CONSTRUCTED the server even if it never
  // started. `startPolling`/`stopPolling` are idempotent. Closure-held
  // `pollTimer` guards against a second timer, and `stopPolling()` is safe even
  // if polling never started (`clearInterval(null)` does not throw).
  let pollTimer = null;
  server.startPolling = () => {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      pollClaudeCodeSessions({ sessionsDir, isAlive, runsStore });
    }, pollIntervalMs);
    // The timer must not keep the Node process alive BY ITSELF. If the rest of
    // the server closed (HTTP stopped, databases closed), a `setInterval`
    // without `.unref()` would be the only reason the process remained.
    // `unref()` removes that reason without affecting `stopPolling()`; polling
    // can still be explicitly stopped at any time.
    pollTimer.unref();
  };
  server.stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  // RF-02b-c: `closeProfilesStore` above does not help when a caller stops the
  // raw server directly with `.close()` rather than going through
  // `startServer(...)`; nobody would call it and the database would remain
  // open. Wrap the native method so EVERY `close()` caller also closes the
  // database automatically. `nativeClose` preserves native behavior: if the
  // server never listened, the callback receives `ERR_SERVER_NOT_RUNNING`
  // exactly as before. Propagate rather than swallow or transform it.
  // RF-02c extends the SAME wrapper, rather than creating a parallel one, so
  // every server close also closes runsStore alongside profilesStore.
  const nativeClose = server.close.bind(server);
  server.close = (callback) => nativeClose((err) => {
    // RF-03a extends the SAME wrapper rather than creating a parallel one;
    // every server close also stops background polling alongside
    // profilesStore/runsStore.
    server.stopPolling();
    profilesStore.close();
    runsStore.close();
    // RF-05b extends the SAME wrapper rather than creating a parallel one;
    // every server close also closes layoutStore.
    layoutStore.close();
    // RF-05c: likewise for slotStore.
    slotStore.close();
    piIngestionStore.close();
    if (callback) callback(err);
  });

  return server;
}

// Constructs AND starts the server. Resolves after it is actually listening,
// with the allocated real port (`server.address().port`), which is essential
// for ephemeral test port `0`.
function startServer(options = {}) {
  const host = options.host || '127.0.0.1'; // default loopback, never an accidental wildcard (D2)
  const port = options.port !== undefined ? options.port : (process.env.PORT || 5311);
  const sessionsDir = options.sessionsDir || path.join(os.homedir(), '.claude', 'sessions');

  const server = createServer({ ...options, host, port });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      server.setAllowedOrigins(buildAllowedOrigins(address.port));
      // RF-03a: background polling starts only here after `listen()`, never
      // in `createServer()` (D1).
      server.startPolling();
      console.log('agent-map skeleton running at http://' + host + ':' + address.port + '/');
      console.log('reading sessions from ' + sessionsDir);
      resolve({
        server,
        address,
        port: address.port,
        // RF-02b-c/RF-02c/RF-05b/RF-05c: `server.close()` automatically closes
        // profilesStore, runsStore, layoutStore, AND slotStore through the
        // createServer wrapper. HTTP stops first, waiting for active requests
        // as http.Server#close() normally does, and only then closes databases.
        // No window exists in which database closing can cut off a request.
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

if (require.main === module) {
  const piRoots = (process.env.PI_SUBAGENTS_ROOTS || '')
    .split(path.delimiter)
    .filter((root) => root.trim() && path.isAbsolute(root));
  const piMissionRoot = typeof process.env.PI_SUBAGENTS_MISSION_ROOT === 'string' && path.isAbsolute(process.env.PI_SUBAGENTS_MISSION_ROOT)
    ? process.env.PI_SUBAGENTS_MISSION_ROOT : undefined;
  startServer({ piRoots, piMissionRoot }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { createServer, startServer };
