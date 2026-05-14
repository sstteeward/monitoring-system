-- Fix RLS policy so Coordinators can read Anti-Cheat security alerts

-- Drop the policy if it already exists to avoid errors on multiple runs
DROP POLICY IF EXISTS "Coordinators can read anti-cheat logs" ON public.audit_logs;

-- Create policy allowing coordinators to view audit logs specifically flagged by the anti-cheat system
CREATE POLICY "Coordinators can read anti-cheat logs" 
ON public.audit_logs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE auth_user_id = auth.uid() 
    AND account_type = 'coordinator'
  )
  AND action = 'anti_cheat_flag'
);
