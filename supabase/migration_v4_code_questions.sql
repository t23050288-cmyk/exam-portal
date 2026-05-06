-- ============================================================
-- Migration v4: Code Questions (Pyodide) + Batch Telemetry
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. Add question_type column to questions table
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS question_type TEXT DEFAULT 'mcq'
    CHECK (question_type IN ('mcq', 'code'));

-- 2. Add audio_url column (if not already present)
ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS audio_url TEXT;

-- 3. Create code_questions table for Pyodide test cases
CREATE TABLE IF NOT EXISTS code_questions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id     UUID UNIQUE NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  starter_code    TEXT DEFAULT '',
  language        TEXT DEFAULT 'python',
  test_cases      JSONB NOT NULL DEFAULT '[]',
  -- test_cases format:
  -- [{ "input": "...", "expected_output": "...", "is_hidden": false, "description": "..." }]
  time_limit_ms   INTEGER DEFAULT 10000,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_code_questions_question ON code_questions(question_id);

-- RLS for code_questions
ALTER TABLE code_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read code_questions"
  ON code_questions FOR SELECT
  USING (true);

-- 4. Create code_submissions table (stores Pyodide results)
CREATE TABLE IF NOT EXISTS code_submissions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  question_id     UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  language        TEXT DEFAULT 'python',
  test_results    JSONB DEFAULT '[]',
  -- test_results: [{ "input": "...", "expected": "...", "actual": "...", "passed": bool }]
  passed_count    INTEGER DEFAULT 0,
  total_count     INTEGER DEFAULT 0,
  is_final        BOOLEAN DEFAULT FALSE,
  submitted_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_code_sub_student ON code_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_code_sub_question ON code_submissions(question_id);

-- Unique per student+question (upsert pattern)
CREATE UNIQUE INDEX IF NOT EXISTS idx_code_sub_unique
  ON code_submissions(student_id, question_id);

ALTER TABLE code_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students read own code submissions"
  ON code_submissions FOR SELECT
  USING (auth.uid()::text = student_id::text);

-- 5. Create telemetry_batches table (replaces individual violation rows for batch events)
CREATE TABLE IF NOT EXISTS telemetry_batches (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  events      JSONB NOT NULL DEFAULT '[]',
  -- events: [{ "id": "uuid", "type": "...", "ts": "...", "payload": {} }]
  received_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_student ON telemetry_batches(student_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_received ON telemetry_batches(received_at);

ALTER TABLE telemetry_batches ENABLE ROW LEVEL SECURITY;

-- Trigger for code_submissions updated_at
CREATE TRIGGER update_code_submissions_updated_at
  BEFORE UPDATE ON code_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

