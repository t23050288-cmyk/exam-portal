-- ── exam_config table ────────────────────────────────────────
-- Single-row configuration table for exam orbital control.
-- Run this in your Supabase SQL editor.

CREATE TABLE IF NOT EXISTS exam_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active       boolean NOT NULL DEFAULT true,
  scheduled_start timestamptz,
  duration_minutes integer NOT NULL DEFAULT 60,
  exam_title      text NOT NULL DEFAULT 'ExamGuard Assessment',
  updated_at      timestamptz DEFAULT now()
);

-- Seed one default row (idempotent)
INSERT INTO exam_config (is_active, duration_minutes, exam_title)
  VALUES (true, 60, 'ExamGuard Assessment')
  ON CONFLICT DO NOTHING;

-- Allow public read (for student exam status check)
ALTER TABLE exam_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_exam_config" ON exam_config
  FOR SELECT USING (true);
