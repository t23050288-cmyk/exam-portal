-- Migration: Add detailed score columns to exam_results for better reporting
-- 1. Add missing columns to exam_results
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS correct_count INTEGER DEFAULT 0;
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS wrong_count INTEGER DEFAULT 0;
ALTER TABLE exam_results ADD COLUMN IF NOT EXISTS total_questions INTEGER DEFAULT 0;

-- 2. Optional: Backfill total_questions from total_marks if they are 1:1, or leave as 0
-- (Many exams use 1 mark per question, so this is a reasonable starting point)
UPDATE exam_results SET total_questions = total_marks WHERE total_questions = 0;
UPDATE exam_results SET correct_count = score WHERE correct_count = 0;
