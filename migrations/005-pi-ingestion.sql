-- 005-pi-ingestion.sql — instantanee, evenimente și cursor Pi normalizate.

CREATE TABLE pi_run_snapshots (
  run_id TEXT PRIMARY KEY NOT NULL REFERENCES runs(id),
  snapshot_hash TEXT NOT NULL CHECK (
    length(snapshot_hash) = 64 AND snapshot_hash NOT GLOB '*[^0-9a-f]*'
  ),
  snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
  observed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE pi_run_events (
  event_id TEXT PRIMARY KEY NOT NULL CHECK (
    length(event_id) = 64 AND event_id NOT GLOB '*[^0-9a-f]*'
  ),
  run_id TEXT NOT NULL REFERENCES runs(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'source_truncated', 'run_started', 'run_completed', 'run_paused',
    'run_stopped', 'run_timed_out', 'run_repaired_stale',
    'run_process_terminal', 'step_started', 'step_completed', 'step_failed',
    'step_paused', 'step_stopped', 'control_attention', 'child_status'
  )),
  occurred_at INTEGER,
  event_json TEXT NOT NULL CHECK (json_valid(event_json)),
  stored_at INTEGER NOT NULL
);

CREATE INDEX idx_pi_run_events_run_time
  ON pi_run_events(run_id, occurred_at, event_id);

CREATE TABLE pi_run_cursors (
  run_id TEXT PRIMARY KEY NOT NULL REFERENCES runs(id),
  file_key TEXT NOT NULL CHECK (
    length(file_key) = 64 AND file_key NOT GLOB '*[^0-9a-f]*'
  ),
  offset INTEGER NOT NULL CHECK (offset >= 0),
  discarding_oversized_line INTEGER NOT NULL DEFAULT 0
    CHECK (discarding_oversized_line IN (0, 1)),
  updated_at INTEGER NOT NULL
);
