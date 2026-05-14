-- Migration: Add code storage for Round 3 and 4
-- This allows admins to view student submissions in the live status dashboard.

ALTER TABLE pyhunt_progress 
ADD COLUMN IF NOT EXISTS round3_code TEXT,
ADD COLUMN IF NOT EXISTS round3b_code TEXT,
ADD COLUMN IF NOT EXISTS round4_code TEXT;
