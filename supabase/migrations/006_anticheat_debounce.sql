-- Migration 006: Add server-side debounce + auto_submitted columns to exam_status
-- Run this in your Supabase SQL editor

ALTER TABLE exam_status
  ADD COLUMN IF NOT EXISTS last_violation_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_submitted BOOLEAN DEFAULT FALSE;

-- Index for fast lookups by violation time
CREATE INDEX IF NOT EXISTS idx_exam_status_last_violation ON exam_status(last_violation_at);
