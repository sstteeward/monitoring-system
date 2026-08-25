-- Company Schedule Management: normalized student assignments, secure RPCs, audit history.
-- The existing schedules.student_id remains populated with the first assignee for legacy readers.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS break_duration_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS supervisor_name text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'custom_weekdays',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS calendar_sync_status text NOT NULL DEFAULT 'not_connected',
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS last_calendar_sync_at timestamptz;

UPDATE public.schedules SET name = COALESCE(NULLIF(name, ''), initcap(shift_type) || ' shift') WHERE name IS NULL OR name = '';
ALTER TABLE public.schedules ALTER COLUMN name SET NOT NULL;
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_break_duration_minutes_check;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_break_duration_minutes_check CHECK (break_duration_minutes BETWEEN 0 AND 480);
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_recurrence_check;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_recurrence_check CHECK (recurrence IN ('none','daily','weekly','custom_weekdays'));
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_status_check;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_status_check CHECK (status IN ('upcoming','active','completed','cancelled'));
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_calendar_sync_status_check;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_calendar_sync_status_check CHECK (calendar_sync_status IN ('not_connected','pending','synced','failed'));
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_date_range_check;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_date_range_check CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);

CREATE TABLE IF NOT EXISTS public.schedule_students (
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (schedule_id, student_id)
);
INSERT INTO public.schedule_students(schedule_id, student_id)
SELECT id, student_id FROM public.schedules WHERE student_id IS NOT NULL ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS schedule_students_student_id_idx ON public.schedule_students(student_id, schedule_id);
CREATE INDEX IF NOT EXISTS schedules_company_status_dates_idx ON public.schedules(company_id, status, start_date, end_date);

CREATE TABLE IF NOT EXISTS public.schedule_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE, actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS schedule_audit_company_schedule_idx ON public.schedule_audit_logs(company_id, schedule_id, created_at DESC);

CREATE TABLE IF NOT EXISTS private.google_calendar_connections (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE, calendar_id text NOT NULL DEFAULT 'primary', calendar_name text,
  access_token text NOT NULL, refresh_token text NOT NULL, expires_at timestamptz, created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.company_calendar_settings (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE, automatic_sync boolean NOT NULL DEFAULT true,
  cancel_behavior text NOT NULL DEFAULT 'mark_cancelled' CHECK (cancel_behavior IN ('mark_cancelled','remove')), updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_calendar_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Company reads schedule students" ON public.schedule_students;
CREATE POLICY "Company reads schedule students" ON public.schedule_students FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.schedules s JOIN public.profiles p ON p.company_id=s.company_id WHERE s.id=schedule_id AND p.auth_user_id=auth.uid() AND p.account_type='company'));
DROP POLICY IF EXISTS "Company reads schedule audit" ON public.schedule_audit_logs;
CREATE POLICY "Company reads schedule audit" ON public.schedule_audit_logs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.company_id=schedule_audit_logs.company_id AND p.auth_user_id=auth.uid() AND p.account_type='company'));
DROP POLICY IF EXISTS "Company reads calendar settings" ON public.company_calendar_settings;
CREATE POLICY "Company reads calendar settings" ON public.company_calendar_settings FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.company_id=company_calendar_settings.company_id AND p.auth_user_id=auth.uid() AND p.account_type='company'));

CREATE OR REPLACE FUNCTION public.save_company_schedule(p_schedule_id uuid, p_name text, p_start_date date, p_end_date date, p_start_time time, p_end_time time, p_break_duration_minutes integer, p_location text, p_supervisor_name text, p_notes text, p_recurrence text, p_working_days text[], p_student_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_company uuid; v_schedule public.schedules%ROWTYPE; v_student uuid; v_action text; v_conflict text;
BEGIN
  SELECT company_id INTO v_company FROM public.profiles WHERE auth_user_id=auth.uid() AND account_type='company';
  IF v_company IS NULL THEN RAISE EXCEPTION 'Not authorized to manage schedules'; END IF;
  IF p_name IS NULL OR btrim(p_name)='' OR p_start_date IS NULL OR p_start_time IS NULL OR p_end_time IS NULL THEN RAISE EXCEPTION 'Complete all required schedule fields'; END IF;
  IF p_end_time <= p_start_time THEN RAISE EXCEPTION 'End time must be later than start time'; END IF;
  IF p_end_date IS NOT NULL AND p_end_date < p_start_date THEN RAISE EXCEPTION 'End date cannot be earlier than start date'; END IF;
  IF COALESCE(array_length(p_student_ids,1),0)=0 THEN RAISE EXCEPTION 'Select at least one assigned student'; END IF;
  IF p_recurrence NOT IN ('none','daily','weekly','custom_weekdays') THEN RAISE EXCEPTION 'Invalid recurrence'; END IF;
  IF p_recurrence='custom_weekdays' AND COALESCE(array_length(p_working_days,1),0)=0 THEN RAISE EXCEPTION 'Choose at least one working day'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_student_ids) sid LEFT JOIN public.profiles p ON p.auth_user_id=sid AND p.company_id=v_company AND p.account_type='student' WHERE p.auth_user_id IS NULL) THEN RAISE EXCEPTION 'One or more students are no longer assigned to your company'; END IF;
  FOREACH v_student IN ARRAY p_student_ids LOOP
    SELECT s.name INTO v_conflict FROM public.schedules s JOIN public.schedule_students ss ON ss.schedule_id=s.id WHERE ss.student_id=v_student AND s.company_id=v_company AND s.id IS DISTINCT FROM p_schedule_id AND s.status<>'cancelled' AND s.start_time<p_end_time AND s.end_time>p_start_time AND (s.end_date IS NULL OR s.end_date>=p_start_date) AND (p_end_date IS NULL OR s.start_date IS NULL OR s.start_date<=p_end_date) AND (p_recurrence='none' OR s.recurrence='daily' OR p_recurrence='daily' OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.working_days, '[]'::jsonb)) d WHERE d=ANY(p_working_days))) LIMIT 1;
    IF v_conflict IS NOT NULL THEN RAISE EXCEPTION 'This student already has a conflicting schedule: %', v_conflict; END IF;
  END LOOP;
  IF p_schedule_id IS NULL THEN
    INSERT INTO public.schedules(company_id,student_id,name,start_date,end_date,start_time,end_time,break_duration_minutes,location,supervisor_name,notes,recurrence,working_days,status,calendar_sync_status) VALUES (v_company,p_student_ids[1],btrim(p_name),p_start_date,p_end_date,p_start_time,p_end_time,p_break_duration_minutes, NULLIF(btrim(p_location),''),NULLIF(btrim(p_supervisor_name),''),NULLIF(btrim(p_notes),''),p_recurrence,to_jsonb(p_working_days),CASE WHEN p_start_date>current_date THEN 'upcoming' ELSE 'active' END,CASE WHEN EXISTS(SELECT 1 FROM private.google_calendar_connections c WHERE c.company_id=v_company) THEN 'pending' ELSE 'not_connected' END) RETURNING * INTO v_schedule; v_action:='schedule_created';
  ELSE
    SELECT * INTO v_schedule FROM public.schedules WHERE id=p_schedule_id AND company_id=v_company FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Schedule not found'; END IF;
    UPDATE public.schedules SET student_id=p_student_ids[1],name=btrim(p_name),start_date=p_start_date,end_date=p_end_date,start_time=p_start_time,end_time=p_end_time,break_duration_minutes=p_break_duration_minutes,location=NULLIF(btrim(p_location),''),supervisor_name=NULLIF(btrim(p_supervisor_name),''),notes=NULLIF(btrim(p_notes),''),recurrence=p_recurrence,working_days=to_jsonb(p_working_days),status=CASE WHEN status='cancelled' THEN 'cancelled' WHEN p_start_date>current_date THEN 'upcoming' ELSE 'active' END,calendar_sync_status=CASE WHEN EXISTS(SELECT 1 FROM private.google_calendar_connections c WHERE c.company_id=v_company) THEN 'pending' ELSE 'not_connected' END,updated_at=now() WHERE id=p_schedule_id RETURNING * INTO v_schedule; DELETE FROM public.schedule_students WHERE schedule_id=p_schedule_id; v_action:='schedule_updated';
  END IF;
  INSERT INTO public.schedule_students(schedule_id,student_id) SELECT v_schedule.id, unnest(p_student_ids);
  INSERT INTO public.schedule_audit_logs(schedule_id,company_id,actor_id,action,details) VALUES(v_schedule.id,v_company,auth.uid(),v_action,jsonb_build_object('student_count',array_length(p_student_ids,1)));
  RETURN (SELECT jsonb_build_object('id',v_schedule.id));
END; $$;

CREATE OR REPLACE FUNCTION public.get_company_schedules() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'company_id',s.company_id,'student_id',s.student_id,'name',s.name,'shift_type',s.shift_type,'working_days',s.working_days,'start_time',s.start_time,'end_time',s.end_time,'break_start',s.break_start,'break_end',s.break_end,'break_duration_minutes',s.break_duration_minutes,'start_date',s.start_date,'end_date',s.end_date,'location',s.location,'supervisor_name',s.supervisor_name,'notes',s.notes,'recurrence',s.recurrence,'status',s.status,'calendar_sync_status',s.calendar_sync_status,'google_event_id',s.google_event_id,'created_at',s.created_at,'updated_at',s.updated_at,'assigned_students',COALESCE(a.students,'[]'::jsonb)) ORDER BY s.start_date DESC NULLS LAST,s.created_at DESC),'[]'::jsonb) FROM public.schedules s CROSS JOIN LATERAL (SELECT p.company_id FROM public.profiles p WHERE p.auth_user_id=auth.uid() AND p.account_type='company') actor LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('student_id',p.auth_user_id,'first_name',p.first_name,'last_name',p.last_name,'email',p.email,'course',p.course,'department',p.department) ORDER BY p.first_name,p.last_name) students FROM public.schedule_students ss JOIN public.profiles p ON p.auth_user_id=ss.student_id WHERE ss.schedule_id=s.id) a ON true WHERE s.company_id=actor.company_id;
$$;
CREATE OR REPLACE FUNCTION public.delete_company_schedule(p_schedule_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE v_company uuid; BEGIN SELECT company_id INTO v_company FROM public.profiles WHERE auth_user_id=auth.uid() AND account_type='company'; DELETE FROM public.schedules WHERE id=p_schedule_id AND company_id=v_company; IF NOT FOUND THEN RAISE EXCEPTION 'Schedule not found'; END IF; INSERT INTO public.schedule_audit_logs(company_id,actor_id,action,details) VALUES(v_company,auth.uid(),'schedule_deleted',jsonb_build_object('schedule_id',p_schedule_id)); END; $$;
CREATE OR REPLACE FUNCTION public.get_company_schedule_audit(p_schedule_id uuid) RETURNS TABLE(id uuid,action text,details jsonb,created_at timestamptz,actor_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT a.id,a.action,a.details,a.created_at,concat_ws(' ',p.first_name,p.last_name) FROM public.schedule_audit_logs a JOIN public.schedules s ON s.id=a.schedule_id JOIN public.profiles owner ON owner.company_id=s.company_id AND owner.auth_user_id=auth.uid() AND owner.account_type='company' LEFT JOIN public.profiles p ON p.auth_user_id=a.actor_id WHERE a.schedule_id=p_schedule_id ORDER BY a.created_at DESC; $$;
CREATE OR REPLACE FUNCTION public.get_company_calendar_integration() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT jsonb_build_object('connected',c.company_id IS NOT NULL,'calendar_id',c.calendar_id,'calendar_name',c.calendar_name,'automatic_sync',COALESCE(s.automatic_sync,true),'cancel_behavior',COALESCE(s.cancel_behavior,'mark_cancelled'),'last_synced_at',c.updated_at) FROM public.profiles p LEFT JOIN private.google_calendar_connections c ON c.company_id=p.company_id LEFT JOIN public.company_calendar_settings s ON s.company_id=p.company_id WHERE p.auth_user_id=auth.uid() AND p.account_type='company'; $$;
REVOKE ALL ON FUNCTION public.save_company_schedule(uuid,text,date,date,time,time,integer,text,text,text,text,text[],uuid[]) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.save_company_schedule(uuid,text,date,date,time,time,integer,text,text,text,text,text[],uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.get_company_schedules() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.get_company_schedules() TO authenticated;
REVOKE ALL ON FUNCTION public.delete_company_schedule(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.delete_company_schedule(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_company_schedule_audit(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.get_company_schedule_audit(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_company_calendar_integration() FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.get_company_calendar_integration() TO authenticated;
