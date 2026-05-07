ALTER TABLE questions    ADD COLUMN IF NOT EXISTS negative_marks numeric DEFAULT 0;
ALTER TABLE exam_config  ADD COLUMN IF NOT EXISTS enable_face_proctoring boolean DEFAULT false;
ALTER TABLE exam_config  ADD COLUMN IF NOT EXISTS negative_marking boolean DEFAULT true;
