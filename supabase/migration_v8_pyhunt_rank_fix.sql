-- ============================================================
-- Migration v8: PyHunt Rank Atomicity & Sequential Distribution
-- This fixes the race condition where multiple students get the same clueRank.
-- ============================================================

-- 1. Ensure pyhunt_progress table exists and has necessary columns
CREATE TABLE IF NOT EXISTS pyhunt_progress (
  student_id    UUID PRIMARY KEY,
  student_name  TEXT,
  usn           TEXT,
  current_round INTEGER DEFAULT 0,
  round1_score  TEXT,
  round1_time   TEXT,
  round1_rank   INTEGER,
  total_time    TEXT,
  status        TEXT DEFAULT 'active',
  warnings      INTEGER DEFAULT 0,
  last_violation TEXT,
  last_active   TIMESTAMPTZ DEFAULT NOW(),
  turtle_image  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create the atomic rank assignment function
-- This function uses a lock-free or locked approach to ensure sequential assignment.
-- In Postgres, calling this in a transaction (which Supabase RPC does) ensures atomicity.
CREATE OR REPLACE FUNCTION get_pyhunt_round_rank(target_student_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  assigned_rank INTEGER;
BEGIN
  -- First, check if the student already has a rank
  SELECT round1_rank INTO assigned_rank
  FROM pyhunt_progress
  WHERE student_id = target_student_id;

  -- If already assigned, return it
  IF assigned_rank IS NOT NULL THEN
    RETURN assigned_rank;
  END IF;

  -- If not assigned, find the current max rank and increment
  -- We use a subquery to ensure we get the latest value even with concurrent calls
  -- Note: In high-concurrency, this could still have a small window.
  -- To be truly safe, we could use a SEQUENCE, but since we are within pyhunt_progress,
  -- we can just use the table count or max.
  
  -- LOCK the table for the duration of this assignment to prevent overlaps
  -- This is slightly heavy but guaranteed unique
  LOCK TABLE pyhunt_progress IN EXCLUSIVE MODE;

  SELECT COALESCE(MAX(round1_rank), 0) + 1 INTO assigned_rank
  FROM pyhunt_progress;

  -- Update the student's record with the new rank
  -- If the row doesn't exist yet, we create it (happens if they finish round 1 very fast)
  INSERT INTO pyhunt_progress (student_id, round1_rank, status, last_active)
  VALUES (target_student_id, assigned_rank, 'active', NOW())
  ON CONFLICT (student_id) DO UPDATE
  SET round1_rank = assigned_rank,
      last_active = NOW();

  RETURN assigned_rank;
END;
$$;
