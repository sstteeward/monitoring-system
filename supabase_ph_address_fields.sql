ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Philippines',
  ADD COLUMN IF NOT EXISTS region text,
  ADD COLUMN IF NOT EXISTS region_code text,
  ADD COLUMN IF NOT EXISTS province text,
  ADD COLUMN IF NOT EXISTS province_code text,
  ADD COLUMN IF NOT EXISTS city_municipality text,
  ADD COLUMN IF NOT EXISTS city_municipality_code text,
  ADD COLUMN IF NOT EXISTS barangay text,
  ADD COLUMN IF NOT EXISTS barangay_code text,
  ADD COLUMN IF NOT EXISTS house_street text;

UPDATE public.profiles
SET country = 'Philippines'
WHERE country IS NULL;

-- Keep address as the formatted human-readable value for compatibility with existing screens.
UPDATE public.profiles
SET address = COALESCE(
  CASE
    WHEN house_street IS NOT NULL OR barangay IS NOT NULL OR city_municipality IS NOT NULL OR province IS NOT NULL THEN
      array_to_string(
        array_remove(
          ARRAY[
            house_street,
            CASE WHEN barangay IS NOT NULL THEN 'Barangay ' || barangay ELSE NULL END,
            city_municipality,
            province,
            country
          ],
          NULL
        ),
        ', '
      )
    ELSE address
  END,
  address
)
WHERE address IS NULL OR address = '';