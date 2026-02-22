
-- Announcements table for school-wide updates
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'School Admin',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User notifications for personal status (e.g., document status)
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'danger')),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── RLS: announcements ──────────────────────────────────────────────────────
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Anyone logged in can read announcements
CREATE POLICY "Anyone can view announcements"
  ON public.announcements FOR SELECT USING (true);

-- Only coordinators can create announcements
CREATE POLICY "Coordinators can insert announcements"
  ON public.announcements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type = 'coordinator'
    )
  );

-- Only coordinators can update announcements
CREATE POLICY "Coordinators can update announcements"
  ON public.announcements FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type = 'coordinator'
    )
  );

-- Only coordinators can delete announcements
CREATE POLICY "Coordinators can delete announcements"
  ON public.announcements FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE auth_user_id = auth.uid()
        AND account_type = 'coordinator'
    )
  );

-- ── RLS: user_notifications ─────────────────────────────────────────────────
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own notifications"   ON public.user_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.user_notifications FOR UPDATE USING (auth.uid() = user_id);
