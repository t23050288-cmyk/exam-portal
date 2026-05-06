-- ============================================================
-- Migration v5: Hardening — responses, events_log, exam_sessions
-- RLS policies, indexes, dedup constraints
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ── 1. exam_sessions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id          UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL,                     -- Supabase auth.users.id
  branch           TEXT,
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at         TIMESTAMPTZ,
  status           TEXT DEFAULT 'running'
    CHECK (status IN ('running','submitted','expired','flagged')),
  client_ts_start  BIGINT,
  UNIQUE (exam_id, user_id)                           -- one active session per student per exam
);

CREATE INDEX IF NOT EXISTS exam_sessions_exam_status_idx
  ON exam_sessions (exam_id, status);

CREATE INDEX IF NOT EXISTS exam_sessions_user_idx
  ON exam_sessions (user_id);

ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;

-- Students can only read/update their own session
CREATE POLICY exam_sessions_student_select ON exam_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY exam_sessions_student_insert ON exam_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY exam_sessions_student_update ON exam_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Admins see everything (role = 'admin' stored in profiles table)
CREATE POLICY exam_sessions_admin ON exam_sessions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = auth.uid() AND s.role = 'admin'
    )
  );

-- ── 2. responses ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS responses (
  session_id   UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  question_id  UUID NOT NULL REFERENCES questions(id)    ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  answer_json  JSONB,                   -- {selected_option: 'A'} or {code: '...', results: [...]}
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  is_final     BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (session_id, question_id)
);

CREATE INDEX IF NOT EXISTS responses_session_idx
  ON responses (session_id);

ALTER TABLE responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY responses_owner_insert ON responses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY responses_owner_update ON responses
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY responses_owner_select ON responses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY responses_admin ON responses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = auth.uid() AND s.role = 'admin'
    )
  );

-- ── 3. events_log ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events_log (
  event_id     UUID PRIMARY KEY,          -- client-generated UUID (dedup key)
  session_id   UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  user_id      UUID,
  event_type   TEXT NOT NULL,             -- 'tab_switch','window_blur','copy','paste', etc.
  payload      JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS events_session_time_idx
  ON events_log (session_id, created_at DESC);

ALTER TABLE events_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_student_insert ON events_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY events_student_select ON events_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY events_admin ON events_log
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = auth.uid() AND s.role = 'admin'
    )
  );

-- ── 4. violations (aggregated flags) ──────────────────────────
CREATE TABLE IF NOT EXISTS violations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  severity     TEXT DEFAULT 'low' CHECK (severity IN ('low','medium','high')),
  violation_type TEXT NOT NULL,
  count        INTEGER DEFAULT 1,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (session_id, violation_type)     -- upsert-friendly
);

CREATE INDEX IF NOT EXISTS violations_session_idx
  ON violations (session_id);

CREATE INDEX IF NOT EXISTS violations_severity_idx
  ON violations (severity, last_seen_at DESC);

ALTER TABLE violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY violations_admin_only ON violations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.id = auth.uid() AND s.role = 'admin'
    )
  );

-- ── 5. media_resources ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media_resources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  UUID REFERENCES questions(id) ON DELETE SET NULL,
  uploader_id  UUID,
  public_id    TEXT NOT NULL,           -- Cloudinary public_id
  url          TEXT NOT NULL,           -- CDN URL
  format       TEXT,                   -- 'webp', 'mp4', etc.
  resource_type TEXT DEFAULT 'image',  -- 'image','video','raw'
  bytes        INTEGER,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. admin_settings (throttle control) ──────────────────────
CREATE TABLE IF NOT EXISTS admin_settings (
  key    TEXT PRIMARY KEY,
  value  JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default throttle mode: normal
INSERT INTO admin_settings (key, value)
  VALUES ('throttle_mode', '"normal"')
  ON CONFLICT (key) DO NOTHING;

INSERT INTO admin_settings (key, value)
  VALUES ('autosave_interval_override_ms', 'null')
  ON CONFLICT (key) DO NOTHING;

-- ── 7. code_submissions (Pyodide results) ─────────────────────
-- Only stores final submitted code + results (not per-keystroke)
ALTER TABLE code_submissions
  ADD COLUMN IF NOT EXISTS is_final BOOLEAN DEFAULT FALSE;

ALTER TABLE code_submissions
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES exam_sessions(id) ON DELETE CASCADE;

-- ── 8. Useful helper views ────────────────────────────────────
CREATE OR REPLACE VIEW active_sessions_summary AS
  SELECT
    e.id         AS exam_id,
    e.title      AS exam_title,
    COUNT(es.id) FILTER (WHERE es.status = 'running')    AS active_count,
    COUNT(es.id) FILTER (WHERE es.status = 'submitted')  AS submitted_count,
    COUNT(es.id) FILTER (WHERE es.status = 'flagged')    AS flagged_count,
    COUNT(v.id)  FILTER (WHERE v.severity = 'high')      AS high_violations,
    MAX(es.last_activity_at)                              AS last_activity
  FROM exams e
  LEFT JOIN exam_sessions es ON es.exam_id = e.id
  LEFT JOIN violations v     ON v.session_id = es.id
  GROUP BY e.id, e.title;

-- ── 9. Function: bulk upsert responses (used by /api/autosave) ─
CREATE OR REPLACE FUNCTION bulk_upsert_responses(
  p_session_id UUID,
  p_user_id    UUID,
  p_responses  JSONB    -- array of {question_id, answer_json, updated_at, is_final}
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
      WHERE responses.is_final = FALSE;  -- never overwrite a final answer
    row_count := row_count + 1;
  END LOOP;
  RETURN row_count;
END;
$$;

