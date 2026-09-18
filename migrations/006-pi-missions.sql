-- 006-pi-missions.sql — proiecții publice Pi Mission și ținte proof interne.

CREATE TABLE pi_missions (
  id TEXT PRIMARY KEY NOT NULL CHECK (
    length(id) = 64 AND id NOT GLOB '*[^0-9a-f]*'
  ),
  projection_hash TEXT NOT NULL CHECK (
    length(projection_hash) = 64 AND projection_hash NOT GLOB '*[^0-9a-f]*'
  ),
  projection_json TEXT NOT NULL CHECK (json_valid(projection_json)),
  source_created_at INTEGER NOT NULL CHECK (source_created_at >= 0),
  source_updated_at INTEGER NOT NULL CHECK (source_updated_at >= 0),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
);

CREATE INDEX idx_pi_missions_updated_id
  ON pi_missions(source_updated_at DESC, id ASC);

CREATE TABLE pi_mission_proof_targets (
  proof_ref TEXT PRIMARY KEY NOT NULL CHECK (
    length(proof_ref) = 64 AND proof_ref NOT GLOB '*[^0-9a-f]*'
  ),
  mission_id TEXT NOT NULL REFERENCES pi_missions(id),
  source TEXT NOT NULL CHECK (source IN ('artifact', 'receipt')),
  kind TEXT NOT NULL CHECK (kind IN (
    'status', 'output', 'patch', 'manifest', 'review', 'note', 'other',
    'pull_request', 'ci', 'deployment', 'release'
  )),
  status TEXT CHECK (status IS NULL OR status IN ('pending', 'ready', 'succeeded', 'failed')),
  target_type TEXT NOT NULL CHECK (target_type IN ('path', 'url')),
  target_value TEXT NOT NULL CHECK (length(target_value) BETWEEN 1 AND 4096),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
);

CREATE INDEX idx_pi_mission_proof_targets_mission
  ON pi_mission_proof_targets(mission_id, proof_ref);
