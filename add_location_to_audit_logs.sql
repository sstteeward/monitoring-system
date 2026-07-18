-- 1. Add location tracking columns to audit_logs
ALTER TABLE public.audit_logs
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8),
ADD COLUMN IF NOT EXISTS accuracy FLOAT,
ADD COLUMN IF NOT EXISTS distance_from_geofence FLOAT,
ADD COLUMN IF NOT EXISTS location_address TEXT,
ADD COLUMN IF NOT EXISTS map_url TEXT;

-- 2. Update the RPC function to return the new columns and fetch all clock-in/out attempts
DROP FUNCTION IF EXISTS public.admin_get_security_alerts(uuid);

CREATE OR REPLACE FUNCTION public.admin_get_security_alerts(p_department_id uuid DEFAULT NULL)
RETURNS TABLE (
    id uuid,
    user_id uuid,
    action text,
    table_name text,
    record_id uuid,
    details jsonb,
    ip_address text,
    created_at timestamptz,
    latitude decimal,
    longitude decimal,
    accuracy float,
    distance_from_geofence float,
    location_address text,
    map_url text,
    profile_first_name text,
    profile_last_name text,
    profile_email text,
    profile_account_type text,
    profile_department_id uuid,
    profile_company_id uuid
) AS $$
BEGIN
    -- Basic authorization: must be admin or coordinator
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE auth_user_id = auth.uid() 
        AND account_type IN ('admin', 'coordinator')
    ) THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    RETURN QUERY
    SELECT 
        a.id,
        a.user_id,
        a.action,
        a.table_name,
        a.record_id,
        a.details,
        a.ip_address,
        a.created_at,
        a.latitude,
        a.longitude,
        a.accuracy,
        a.distance_from_geofence,
        a.location_address,
        a.map_url,
        p.first_name AS profile_first_name,
        p.last_name AS profile_last_name,
        p.email AS profile_email,
        p.account_type AS profile_account_type,
        p.department_id AS profile_department_id,
        p.company_id AS profile_company_id
    FROM public.audit_logs a
    LEFT JOIN public.profiles p ON a.user_id = p.auth_user_id
    WHERE a.action IN ('anti_cheat_flag', 'successful_clock_in', 'successful_clock_out')
    ORDER BY a.created_at DESC
    LIMIT 200;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
