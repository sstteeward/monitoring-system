-- ============================================================
-- AUDIT LOGS V2 MIGRATION
-- Enhances the existing audit_logs table with richer metadata
-- and per-admin unread/seen notification indicators.
--
-- Run this in the Supabase SQL Editor.
-- This migration is SAFE to re-run (all statements are idempotent).
-- ============================================================

-- 1. Add new columns to the existing audit_logs table
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS user_name TEXT,
  ADD COLUMN IF NOT EXISTS user_role TEXT,
  ADD COLUMN IF NOT EXISTS module TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS target_type TEXT,
  ADD COLUMN IF NOT EXISTS target_id TEXT,
  ADD COLUMN IF NOT EXISTS target_name TEXT,
  ADD COLUMN IF NOT EXISTS old_values JSONB,
  ADD COLUMN IF NOT EXISTS new_values JSONB,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'success';

-- 2. Performance indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON public.audit_logs (module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_id ON public.audit_logs (target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON public.audit_logs (status);

-- 3. Composite index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_audit_logs_module_action ON public.audit_logs (module, action);

-- 4. RPC function for server-side paginated querying with filters
-- Returns audit log rows plus a total_count for pagination metadata.
DROP FUNCTION IF EXISTS public.get_audit_logs_paginated(TEXT, TEXT, TEXT, UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT);

CREATE OR REPLACE FUNCTION public.get_audit_logs_paginated(
  p_search TEXT DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_module TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_name TEXT,
  user_role TEXT,
  action TEXT,
  module TEXT,
  description TEXT,
  target_type TEXT,
  target_id TEXT,
  target_name TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  total_count BIGINT
) AS $$
DECLARE
  v_total BIGINT;
BEGIN
  -- Authorization: only admins can query audit logs
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid()
    AND account_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only admins can access audit logs';
  END IF;

  -- Count total matching rows for pagination
  SELECT COUNT(*) INTO v_total
  FROM public.audit_logs a
  WHERE
    (p_action IS NULL OR a.action = p_action)
    AND (p_module IS NULL OR a.module = p_module)
    AND (p_user_id IS NULL OR a.user_id = p_user_id)
    AND (p_status IS NULL OR a.status = p_status)
    AND (p_date_from IS NULL OR a.created_at >= p_date_from)
    AND (p_date_to IS NULL OR a.created_at <= p_date_to)
    AND (
      p_search IS NULL
      OR a.user_name ILIKE '%' || p_search || '%'
      OR a.description ILIKE '%' || p_search || '%'
      OR a.target_name ILIKE '%' || p_search || '%'
      OR a.target_id ILIKE '%' || p_search || '%'
    );

  RETURN QUERY
  SELECT
    a.id,
    a.user_id,
    a.user_name,
    a.user_role,
    a.action,
    a.module,
    a.description,
    a.target_type,
    a.target_id,
    a.target_name,
    a.old_values,
    a.new_values,
    a.ip_address,
    a.user_agent,
    a.status,
    a.created_at,
    v_total AS total_count
  FROM public.audit_logs a
  WHERE
    (p_action IS NULL OR a.action = p_action)
    AND (p_module IS NULL OR a.module = p_module)
    AND (p_user_id IS NULL OR a.user_id = p_user_id)
    AND (p_status IS NULL OR a.status = p_status)
    AND (p_date_from IS NULL OR a.created_at >= p_date_from)
    AND (p_date_to IS NULL OR a.created_at <= p_date_to)
    AND (
      p_search IS NULL
      OR a.user_name ILIKE '%' || p_search || '%'
      OR a.description ILIKE '%' || p_search || '%'
      OR a.target_name ILIKE '%' || p_search || '%'
      OR a.target_id ILIKE '%' || p_search || '%'
    )
  ORDER BY a.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC function to get unique users who have audit log entries (for filter dropdown)
DROP FUNCTION IF EXISTS public.get_audit_log_users();

CREATE OR REPLACE FUNCTION public.get_audit_log_users()
RETURNS TABLE (
  user_id UUID,
  user_name TEXT,
  user_role TEXT
) AS $$
BEGIN
  -- Authorization: only admins
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid()
    AND account_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (a.user_id)
    a.user_id,
    a.user_name,
    a.user_role
  FROM public.audit_logs a
  WHERE a.user_id IS NOT NULL AND a.user_name IS NOT NULL
  ORDER BY a.user_id, a.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Table to track seen/read state of audit logs per administrator
CREATE TABLE IF NOT EXISTS public.audit_log_reads (
  user_id UUID PRIMARY KEY,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on audit_log_reads
ALTER TABLE public.audit_log_reads ENABLE ROW LEVEL SECURITY;

-- Policies: Admins can view and update their own read record
DROP POLICY IF EXISTS "Admins can view own audit_log_reads" ON public.audit_log_reads;
CREATE POLICY "Admins can view own audit_log_reads"
  ON public.audit_log_reads
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can insert/update own audit_log_reads" ON public.audit_log_reads;
CREATE POLICY "Admins can insert/update own audit_log_reads"
  ON public.audit_log_reads
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. RPC to get unread audit logs count for the current administrator
DROP FUNCTION IF EXISTS public.get_unread_audit_logs_count();

CREATE OR REPLACE FUNCTION public.get_unread_audit_logs_count()
RETURNS BIGINT AS $$
DECLARE
  v_last_seen TIMESTAMPTZ;
  v_unread_count BIGINT;
BEGIN
  -- Authorization check: only admins
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid()
    AND account_type = 'admin'
  ) THEN
    RETURN 0;
  END IF;

  -- Get admin's last_seen timestamp
  SELECT last_seen_at INTO v_last_seen
  FROM public.audit_log_reads
  WHERE user_id = auth.uid();

  -- If admin has never viewed, default to 7 days ago
  IF v_last_seen IS NULL THEN
    v_last_seen := NOW() - INTERVAL '7 days';
  END IF;

  -- Count unseen logs
  SELECT COUNT(*) INTO v_unread_count
  FROM public.audit_logs
  WHERE created_at > v_last_seen;

  RETURN v_unread_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. RPC to mark audit logs as seen for the current administrator
DROP FUNCTION IF EXISTS public.mark_audit_logs_as_seen();

CREATE OR REPLACE FUNCTION public.mark_audit_logs_as_seen()
RETURNS VOID AS $$
BEGIN
  -- Authorization check: only admins
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE auth_user_id = auth.uid()
    AND account_type = 'admin'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.audit_log_reads (user_id, last_seen_at, updated_at)
  VALUES (auth.uid(), NOW(), NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    last_seen_at = NOW(),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
