-- ============================================================
-- Migration v5 FIXED: Hardening — exam_sessions, responses, events_log
-- SAFE for your actual schema (no 'exams' table reference, no code_submissions)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- ── 1. exam_sessions ──────────────────────────────────────────
-- Uses exam_config_id (TEXT/UUID) instead of exams(id) foreign key
CREATE TABLE IF NOT EXISTS exam_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_config_id   UUID,                        -- references exam_config.id (no FK to avoid issues)
  exam_name        TEXT,                        -- e.g. 'cs exam'
  user_id          TEXT NOT NULL,               -- students.id (text USN-based)
  branch           TEXT,
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at         TIMESTAMPTZ,
  status           TEXT DEFAULT 'running'
    CHECK (status IN ('running','submitted','expired','flagged')),
  client_ts_start  BIGINT,
  UNIQUE (exam_config_id, user_id)              -- one session per student per exam
);

CREATE INDEX IF NOT EXISTS exam_sessions_exam_status_idx
  ON exam_sessions (exam_config_id, status);

CREATE INDEX IF NOT EXISTS exam_sessions_user_idx
  ON exam_sessions (user_id);

-- ── 2. responses ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS responses (
  session_id   UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  question_id  UUID NOT NULL REFERENCES questions(id)     ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  answer_json  JSONB,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  is_final     BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (session_id, question_id)
);

CREATE INDEX IF NOT EXISTS responses_session_idx
  ON responses (session_id);

-- ── 3. events_log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events_log (
  event_id     UUID PRIMARY KEY,
  session_id   UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  user_id      TEXT,
  event_type   TEXT NOT NULL,
  payload      JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS events_session_time_idx
  ON events_log (session_id, created_at DESC);

-- ── 4. media_resources ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_resources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id   UUID REFERENCES questions(id) ON DELETE SET NULL,
  uploader_id   TEXT,
  public_id     TEXT NOT NULL,
  url           TEXT NOT NULL,
  format        TEXT,
  resource_type TEXT DEFAULT 'image',
  bytes         INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 5. admin_settings (throttle control) ──────────────────────
CREATE TABLE IF NOT EXISTS admin_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO admin_settings (key, value)
  VALUES ('throttle_mode', '"normal"')
  ON CONFLICT (key) DO NOTHING;

INSERT INTO admin_settings (key, value)
  VALUES ('autosave_interval_override_ms', 'null')
  ON CONFLICT (key) DO NOTHING;

-- ── 6. Bulk upsert helper function ────────────────────────────
CREATE OR REPLACE FUNCTION bulk_upsert_responses(
  p_session_id UUID,
  p_user_id    TEXT,
  p_responses  JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec       JSONB;
  row_count INTEGER := 0;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(p_responses)
  LOOP
    INSERT INTO responses (session_id, question_id, user_id, answer_json, updated_at, is_final)
    VALUES (
      p_session_id,
      (rec->>'question_id')::UUID,
      p_user_id,
      rec->'answer_json',
      COALESCE((rec->>'updated_at')::TIMESTAMPTZ, NOW()),
      COALESCE((rec->>'is_final')::BOOLEAN, FALSE)
    )
    ON CONFLICT (session_id, question_id) DO UPDATE
      SET answer_json = EXCLUDED.answer_json,
          updated_at  = EXCLUDED.updated_at,
          is_final    = EXCLUDED.is_final
      WHERE responses.is_final = FALSE;
    row_count := row_count + 1;
  END LOOP;
  RETURN row_count;
END;
$$;
