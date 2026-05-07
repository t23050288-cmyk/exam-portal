CREATE TABLE IF NOT EXISTS admin_settings (
  key text PRIMARY KEY, value text, updated_at timestamptz DEFAULT now()
);
INSERT INTO admin_settings (key, value) VALUES
  ('throttle_mode','\"normal\"'),
  ('grading_mode','\"auto\"'),
  ('face_proctoring','false'),
  ('video_capture_allowed','false')
ON CONFLICT (key) DO NOTHING;
