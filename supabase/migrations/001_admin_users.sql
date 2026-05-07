-- Admin users table for real admin auth (replaces hardcoded secret)
CREATE TABLE IF NOT EXISTS admin_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role          text DEFAULT 'proctor',
  created_at    timestamptz DEFAULT now()
);
-- Default admin: password = changeme123 (change in prod via /api/admin/auth/create_admin)
INSERT INTO admin_users (email, password_hash, role)
VALUES ('admin@examguard.local','$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBUYs5k9G.eGIm','admin')
ON CONFLICT (email) DO NOTHING;
