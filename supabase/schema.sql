-- ============================================================
-- ExamGuard — Supabase PostgreSQL Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: students
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  usn               TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  email             TEXT,
  branch            TEXT DEFAULT 'CS',
  password_hash     TEXT NOT NULL,
  is_active_session BOOLEAN DEFAULT FALSE,
  current_token     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_usn ON students(usn);

-- ============================================================
-- TABLE: questions
-- ============================================================
CREATE TABLE IF NOT EXISTS questions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  text           TEXT NOT NULL,
  options        JSONB NOT NULL,     -- ["A) ...", "B) ...", "C) ...", "D) ..."]
  branch         TEXT DEFAULT 'CS',
  correct_answer TEXT NOT NULL,      -- "A", "B", "C", or "D"
  marks          INTEGER DEFAULT 1,
  order_index    INTEGER NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_order ON questions(order_index);

-- ============================================================
-- TABLE: exam_status
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_status (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id   UUID UNIQUE NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status       TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'active', 'submitted')),
  warnings     INTEGER DEFAULT 0,
  last_active  TIMESTAMPTZ DEFAULT NOW(),
  started_at   TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_status_student ON exam_status(student_id);
CREATE INDEX IF NOT EXISTS idx_exam_status_status ON exam_status(status);

-- ============================================================
-- TABLE: exam_results
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_results (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id   UUID UNIQUE NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  answers      JSONB DEFAULT '{}',  -- { "question_id": "A", ... }
  score        INTEGER DEFAULT 0,
  total_marks  INTEGER DEFAULT 0,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exam_results_student ON exam_results(student_id);

-- ============================================================
-- TABLE: violations
-- ============================================================
CREATE TABLE IF NOT EXISTS violations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id   UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN (
                 'tab_switch', 'window_blur', 'fullscreen_exit',
                 'right_click', 'copy_attempt', 'paste_attempt',
                 'keyboard_shortcut', 'auto_submitted'
               )),
  timestamp    TIMESTAMPTZ DEFAULT NOW(),
  metadata     JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_violations_student ON violations(student_id);
CREATE INDEX IF NOT EXISTS idx_violations_timestamp ON violations(timestamp);

-- ============================================================
-- FUNCTION: update updated_at timestamp automatically
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_exam_status_updated_at
  BEFORE UPDATE ON exam_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exam_results_updated_at
  BEFORE UPDATE ON exam_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE violations ENABLE ROW LEVEL SECURITY;

-- Service role bypasses all RLS (backend uses this)
-- Anon/authenticated roles have restricted access

-- Questions: anyone can read (students need to fetch questions)
CREATE POLICY "Anyone can read questions"
  ON questions FOR SELECT
  USING (true);

-- exam_status: allow realtime reads for admin (via service key)
-- Students can only see their own status
CREATE POLICY "Students read own status"
  ON exam_status FOR SELECT
  USING (auth.uid()::text = student_id::text);

-- exam_results: students read only own results
CREATE POLICY "Students read own results"
  ON exam_results FOR SELECT
  USING (auth.uid()::text = student_id::text);

-- ============================================================
-- REALTIME: Enable for admin dashboard live updates
-- ============================================================
-- Run in Supabase Dashboard → Database → Replication
-- Enable realtime for: exam_status, violations

ALTER PUBLICATION supabase_realtime ADD TABLE exam_status;
ALTER PUBLICATION supabase_realtime ADD TABLE violations;
