-- Allow student company requests to include an optional map/geofence.
-- Without these columns, Complete Profile / Submit Request fails when the
-- onboarding form sends latitude, longitude, or geofence_polygon.

ALTER TABLE public.company_requests
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS geofence_radius integer,
  ADD COLUMN IF NOT EXISTS geofence_polygon jsonb;

NOTIFY pgrst, 'reload schema';
