-- Run this once in the Supabase SQL Editor after the web-push setup.
-- Every new school announcement becomes a personal notification for every
-- account. That feeds both the notification bell and the browser-push webhook.

CREATE OR REPLACE FUNCTION public.create_announcement_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.user_notifications (user_id, title, message, type, is_read)
  SELECT
    profiles.auth_user_id,
    NEW.title,
    NEW.content,
    'info',
    false
  FROM public.profiles AS profiles
  WHERE profiles.auth_user_id IS NOT NULL;

  RETURN NEW;
END;
$$;

-- The function is only for the database trigger; clients cannot call it.
REVOKE ALL ON FUNCTION public.create_announcement_notifications() FROM PUBLIC;

DROP TRIGGER IF EXISTS create_announcement_notifications_after_insert ON public.announcements;
CREATE TRIGGER create_announcement_notifications_after_insert
  AFTER INSERT ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.create_announcement_notifications();

-- Lets open dashboards receive newly-created personal notifications immediately.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
  END IF;
END;
$$;
