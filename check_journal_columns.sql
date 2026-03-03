-- ============================================================
-- DIAGNOSTIC: Check actual columns in the daily_journals table
-- Run this in Supabase SQL Editor FIRST and share the results
-- ============================================================

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'daily_journals'
ORDER BY ordinal_position;
