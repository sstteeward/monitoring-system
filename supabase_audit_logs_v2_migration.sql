-- ============================================================
-- AUDIT LOGS V2 MIGRATION
-- Enhances the existing audit_logs table with richer metadata
-- for the Audit Trail & Activity Tracking system.
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

-- 6. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
