-- ── exam_config table ────────────────────────────────────────
-- Single-row configuration table for exam orbital control.
-- Run this in your Supabase SQL editor.

CREATE TABLE IF NOT EXISTS exam_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active       boolean NOT NULL DEFAULT true,
  scheduled_start timestamptz,
  scheduled_end   timestamptz,
  duration_minutes integer NOT NULL DEFAULT 60,
  exam_title      text NOT NULL UNIQUE,
  updated_at      timestamptz DEFAULT now()
);

-- Seed one default row (idempotent)
INSERT INTO exam_config (is_active, duration_minutes, exam_title)
  SELECT true, 60, 'ExamGuard Assessment'
  WHERE NOT EXISTS (SELECT 1 FROM exam_config LIMIT 1);

-- Allow public read (for student exam status check)
ALTER TABLE exam_config ENABLE ROW LEVEL SECURITY;

-- If policy exists it will error, so you might need to drop it if recreating
DROP POLICY IF EXISTS "public_read_exam_config" ON exam_config;
CREATE POLICY "public_read_exam_config" ON exam_config
  FOR SELECT USING (true);
  
-- Important! Enable realtime for this table so students seamlessly get the transition
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'exam_config'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE exam_config;
    END IF;
END $$;
