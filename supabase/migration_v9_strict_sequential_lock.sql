-- ============================================================
-- Migration v9: Strict Sequential Lock & Time-Based Ranking
-- ============================================================

-- 1. Create a table to track round completions with high precision
CREATE TABLE IF NOT EXISTS round_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    round_id INT NOT NULL,
    user_id UUID NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(round_id, user_id)
);

-- 2. Strict Rank Assignment Function
-- This calculates the rank based on the exact microsecond the code was submitted.
CREATE OR REPLACE FUNCTION get_strict_rank(p_round_id INT, p_user_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    final_rank INT;
BEGIN
    -- 1. Insert the submission. 
    -- If already submitted, it does nothing (prevents rank skipping).
    INSERT INTO round_submissions (round_id, user_id, completed_at)
    VALUES (p_round_id, p_user_id, NOW())
    ON CONFLICT (round_id, user_id) DO NOTHING;

    -- 2. Calculate rank based on the order of 'completed_at'
    -- This ensures that even 1ms difference results in a different rank.
    SELECT r.rank_count INTO final_rank
    FROM (
        SELECT user_id, ROW_NUMBER() OVER (ORDER BY completed_at ASC) as rank_count
        FROM round_submissions
        WHERE round_id = p_round_id
    ) r
    WHERE r.user_id = p_user_id;

    RETURN final_rank;
END;
$$;
