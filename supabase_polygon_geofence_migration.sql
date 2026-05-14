-- ==============================================================================
-- Polygon Geofencing Migration
-- Extends existing circular geofencing to support polygon boundaries
-- Run this in the Supabase SQL Editor
-- ==============================================================================

-- 1. Add polygon geofence column to companies table
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS geofence_polygon JSONB DEFAULT NULL;

-- 2. Add comment explaining the column
COMMENT ON COLUMN public.companies.geofence_polygon IS 
'Stores polygon boundary as GeoJSON FeatureCollection. 
Format: {"type": "FeatureCollection", "features": [{"type": "Feature", "geometry": {"type": "Polygon", "coordinates": [[[lng, lat], [lng, lat], ...]]}}]}
If set, polygon boundary check takes precedence over circular radius check.';

-- 3. Add geofence_mode column to track which mode is active
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS geofence_mode TEXT DEFAULT 'circular' CHECK (geofence_mode IN ('circular', 'polygon', 'hybrid'));

-- 4. Create index for faster geofence queries
CREATE INDEX IF NOT EXISTS idx_companies_geofence_polygon ON public.companies USING GIN (geofence_polygon);
CREATE INDEX IF NOT EXISTS idx_companies_geofence_mode ON public.companies (geofence_mode);

-- 5. Create function to validate geofence_polygon JSON structure
CREATE OR REPLACE FUNCTION validate_geofence_polygon()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.geofence_polygon IS NOT NULL THEN
    -- Validate that polygon is valid GeoJSON
    IF NOT (
      NEW.geofence_polygon ? 'type' AND
      NEW.geofence_polygon->>'type' = 'FeatureCollection' AND
      NEW.geofence_polygon ? 'features' AND
      jsonb_array_length(NEW.geofence_polygon->'features') > 0
    ) THEN
      RAISE EXCEPTION 'geofence_polygon must be a valid GeoJSON FeatureCollection with at least one feature';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Add validation trigger to companies table
DROP TRIGGER IF EXISTS validate_geofence_polygon_trigger ON public.companies;
CREATE TRIGGER validate_geofence_polygon_trigger
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW EXECUTE PROCEDURE validate_geofence_polygon();

-- 7. Create a function to extract polygon coordinates from GeoJSON
CREATE OR REPLACE FUNCTION extract_polygon_coords(geofence_jsonb JSONB)
RETURNS TABLE (lng DOUBLE PRECISION, lat DOUBLE PRECISION) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (coords->0)::DOUBLE PRECISION AS lng,
    (coords->1)::DOUBLE PRECISION AS lat
  FROM LATERAL (
    SELECT jsonb_array_elements(
      ((geofence_jsonb->'features'->0->'geometry'->'coordinates')->0)
    ) as coords
  ) as extracted;
END;
$$ LANGUAGE plpgsql;

-- 8. Create a migration function to help convert from old format if needed
CREATE OR REPLACE FUNCTION create_circle_polygon_from_geofence(
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_meters DOUBLE PRECISION,
  num_points INTEGER DEFAULT 32
)
RETURNS JSONB AS $$
DECLARE
  coords JSONB := '[]'::JSONB;
  i INTEGER;
  angle DOUBLE PRECISION;
  lat DOUBLE PRECISION;
  lng DOUBLE PRECISION;
  dlat DOUBLE PRECISION;
  dlng DOUBLE PRECISION;
BEGIN
  -- Earth's radius in meters
  FOR i IN 0..num_points LOOP
    angle := (i::DOUBLE PRECISION / num_points) * 2 * 3.14159265359;
    -- Calculate offset using haversine formula approximation
    dlat := (radius_meters / 111320) * COS(angle);
    dlng := (radius_meters / (111320 * COS(RADIANS(center_lat)))) * SIN(angle);
    lng := center_lng + dlng;
    lat := center_lat + dlat;
    coords := coords || jsonb_build_array(lng, lat);
  END LOOP;
  
  RETURN jsonb_build_object(
    'type', 'FeatureCollection',
    'features', jsonb_build_array(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', jsonb_build_object(
          'type', 'Polygon',
          'coordinates', jsonb_build_array(coords)
        )
      )
    )
  );
END;
$$ LANGUAGE plpgsql;

-- 9. Example: Comment out the line below to auto-convert existing circular geofences to polygons
-- UPDATE public.companies 
-- SET geofence_polygon = create_circle_polygon_from_geofence(latitude, longitude, geofence_radius, 32),
--     geofence_mode = 'hybrid'
-- WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND geofence_radius IS NOT NULL 
--   AND geofence_polygon IS NULL;

-- 10. Log migration completion
-- SELECT 'Polygon Geofencing Migration Complete' AS status;
