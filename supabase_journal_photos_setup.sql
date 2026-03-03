-- ============================================================
-- JOURNAL PHOTOS SETUP (FIXED)
-- Run this script in the Supabase SQL Editor.
-- ============================================================

-- 1. Fix existing 'content' column to allow empty values
ALTER TABLE public.daily_journals
ALTER COLUMN content SET DEFAULT '';

-- 2. Add missing columns: tasks, learnings, photo_urls
ALTER TABLE public.daily_journals
ADD COLUMN IF NOT EXISTS tasks TEXT NOT NULL DEFAULT '';

ALTER TABLE public.daily_journals
ADD COLUMN IF NOT EXISTS learnings TEXT NOT NULL DEFAULT '';

ALTER TABLE public.daily_journals
ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}';

-- 3. Migrate existing data from 'content' column to 'tasks' (if content has data)
UPDATE public.daily_journals
SET tasks = content
WHERE content IS NOT NULL AND content != '' AND tasks = '';

-- 4. Create Storage Bucket for Journal Photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('journal-photos', 'journal-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 5. Storage Policies
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'journal-photos' );

DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload photos"
ON storage.objects FOR INSERT
WITH CHECK (
    auth.role() = 'authenticated' AND
    bucket_id = 'journal-photos'
);

DROP POLICY IF EXISTS "Users can update their own photos" ON storage.objects;
CREATE POLICY "Users can update their own photos"
ON storage.objects FOR UPDATE
USING (
    auth.uid() = owner AND
    bucket_id = 'journal-photos'
);

DROP POLICY IF EXISTS "Users can delete their own photos" ON storage.objects;
CREATE POLICY "Users can delete their own photos"
ON storage.objects FOR DELETE
USING (
    auth.uid() = owner AND
    bucket_id = 'journal-photos'
);

-- 6. RPC to upsert journal (includes 'content' column to satisfy NOT NULL constraint)
CREATE OR REPLACE FUNCTION upsert_journal(
    p_entry_date DATE,
    p_tasks TEXT,
    p_learnings TEXT,
    p_photo_urls TEXT[] DEFAULT '{}'
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    INSERT INTO public.daily_journals (user_id, entry_date, content, tasks, learnings, photo_urls, updated_at)
    VALUES (auth.uid(), p_entry_date, '', p_tasks, p_learnings, p_photo_urls, NOW())
    ON CONFLICT (user_id, entry_date)
    DO UPDATE SET
        content = '',
        tasks = EXCLUDED.tasks,
        learnings = EXCLUDED.learnings,
        photo_urls = EXCLUDED.photo_urls,
        updated_at = NOW()
    RETURNING row_to_json(daily_journals.*) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
