ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS question_order jsonb;
ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS ended_at timestamptz;
