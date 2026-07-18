-- Migration: Add Device Fingerprinting

-- 1. Create the `device_fingerprints` table to track devices per user
CREATE TABLE IF NOT EXISTS public.device_fingerprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    fingerprint TEXT NOT NULL,
    device_label TEXT NOT NULL,
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    times_seen INTEGER DEFAULT 1,
    is_trusted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, fingerprint)
);

-- RLS for device_fingerprints
ALTER TABLE public.device_fingerprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own device fingerprints"
ON public.device_fingerprints FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert/update their own device fingerprints"
ON public.device_fingerprints FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own device fingerprints"
ON public.device_fingerprints FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins and coordinators can view all device fingerprints"
ON public.device_fingerprints FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.auth_user_id = auth.uid()
        AND profiles.account_type IN ('admin', 'coordinator')
    )
);

-- 2. Add device_fingerprint to audit_logs table
ALTER TABLE public.audit_logs 
ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;

-- 3. Update the RPC function `admin_get_security_alerts` to return the new column
CREATE OR REPLACE FUNCTION public.admin_get_security_alerts()
RETURNS TABLE (
    id UUID,
    user_id UUID,
    action TEXT,
    table_name TEXT,
    record_id UUID,
    details JSONB,
    ip_address TEXT,
    device_fingerprint TEXT,
    created_at TIMESTAMPTZ,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    distance_from_geofence DOUBLE PRECISION,
    location_address TEXT,
    map_url TEXT,
    profile_first_name TEXT,
    profile_last_name TEXT,
    profile_email TEXT,
    profile_account_type TEXT,
    profile_department_id UUID,
    profile_company_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        al.id,
        al.user_id,
        al.action,
        al.table_name,
        al.record_id,
        al.details,
        al.ip_address,
        al.device_fingerprint,
        al.created_at,
        al.latitude,
        al.longitude,
        al.accuracy,
        al.distance_from_geofence,
        al.location_address,
        al.map_url,
        p.first_name AS profile_first_name,
        p.last_name AS profile_last_name,
        p.email AS profile_email,
        p.account_type AS profile_account_type,
        p.department_id AS profile_department_id,
        p.company_id AS profile_company_id
    FROM 
        public.audit_logs al
    LEFT JOIN 
        public.profiles p ON al.user_id = p.auth_user_id
    WHERE 
        al.action = 'anti_cheat_flag'
    ORDER BY 
        al.created_at DESC;
END;
$$;

-- 4. Create an RPC to increment device seen count
CREATE OR REPLACE FUNCTION public.increment_device_seen_count(p_user_id UUID, p_fingerprint TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.device_fingerprints
    SET 
        times_seen = times_seen + 1,
        last_seen_at = NOW()
    WHERE user_id = p_user_id AND fingerprint = p_fingerprint;
END;
$$;
