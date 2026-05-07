-- Async grading queue — final_submit is ack-only, grading runs here
CREATE TABLE IF NOT EXISTS grading_queue (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL,
  user_id     uuid NOT NULL,
  created_at  timestamptz DEFAULT now(),
  status      text DEFAULT 'pending',   -- pending | processing | done | failed
  attempts    int DEFAULT 0,
  last_error  text,
  payload     jsonb,
  graded_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_gq_status_ts ON grading_queue (status, created_at);
CREATE INDEX IF NOT EXISTS idx_gq_session  ON grading_queue (session_id);
