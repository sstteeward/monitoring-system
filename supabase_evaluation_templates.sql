-- ============================================================================
-- Company-based digital evaluation workflow
-- ============================================================================
--
-- The change this makes
--   The coordinator used to file an Evaluation / Annex B / Annex C for one
--   student at a time. Now the official document is uploaded once per company,
--   and the students assigned to that company each get their own evaluation to
--   be completed digitally by the company inside the portal.
--
--       ONE TEMPLATE  ->  MANY STUDENT EVALUATIONS  ->  ONE SET OF ANSWERS EACH
--
-- What this adds
--   1. public.evaluation_templates - the official PDF, held at company level and
--      versioned. Exactly one published row per company per document type; a
--      replacement archives the old row rather than overwriting it, so an
--      evaluation submitted against v1 still points at the v1 it was answered
--      from.
--   2. Columns on public.evaluations that turn it into the evaluation instance:
--      which template it came from, where it is in its lifecycle, when it was
--      started and submitted, and the computed score.
--   3. The RPCs the three portals call.
--
-- What this deliberately reuses
--   * public.evaluations and its existing 11-criterion rubric, its CHECK
--     constraints and its RLS. This is the institution's evaluation form and it
--     was already built; the digital form is that form, not a second one.
--   * The `company_documents` storage bucket, whose policies already let a
--     company account and its assigned students read that company's folder.
--   * public.profiles.company_id for the company roster and
--     public.adviser_sections for the adviser, exactly as the rest of the system
--     resolves them. No student, company or adviser data is copied.
--   * public.user_notifications, so the existing `notification_email` webhook
--     turns every notification raised here into an email. No new mailer.
--
-- What this removes
--   The student-level sil_documents tables, their RPCs and their storage
--   policies. They were the previous iteration of this feature and hold no data.
--
-- Safe to run more than once.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Retire the student-level document tables this supersedes
-- ----------------------------------------------------------------------------

-- CASCADE because the dependency runs both ways: the RPCs return these tables'
-- row types, and the tables' policies call can_read_sil_documents(). What it
-- takes with it is exactly this feature's own functions and policies — nothing
-- else in the schema references them.
DROP TABLE IF EXISTS public.sil_document_notifications CASCADE;
DROP TABLE IF EXISTS public.sil_document_versions CASCADE;
DROP TABLE IF EXISTS public.sil_documents CASCADE;

-- Whatever CASCADE did not already remove.
DROP FUNCTION IF EXISTS public.record_sil_document_upload(uuid, text, text, text, text, bigint);
DROP FUNCTION IF EXISTS public.get_sil_document_students(text);
DROP FUNCTION IF EXISTS public.get_sil_student_documents(uuid);
DROP FUNCTION IF EXISTS public.get_sil_document_notifications(uuid);
DROP FUNCTION IF EXISTS public.get_sil_document_versions(uuid);
DROP FUNCTION IF EXISTS public.retry_sil_document_notification(uuid);
DROP FUNCTION IF EXISTS public.sil_document_recipients(uuid);
DROP FUNCTION IF EXISTS public.can_read_sil_documents(uuid);

DROP POLICY IF EXISTS "Coordinators can upload SIL documents" ON storage.objects;
DROP POLICY IF EXISTS "Coordinators can update SIL documents" ON storage.objects;
DROP POLICY IF EXISTS "Coordinators can delete SIL documents" ON storage.objects;
DROP POLICY IF EXISTS "Companies can read hosted student SIL documents" ON storage.objects;


-- ----------------------------------------------------------------------------
-- 1. The template — one official document per company, versioned
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.evaluation_templates (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    document_type  text NOT NULL CHECK (document_type IN ('evaluation', 'annex_b', 'annex_c')),
    title          text NOT NULL,

    file_path      text NOT NULL,
    file_name      text NOT NULL,
    file_type      text NOT NULL DEFAULT 'application/pdf',
    file_size      bigint,

    version        integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    -- 'published' is the live template students are evaluated against.
    -- 'archived' is a superseded version, kept so the evaluations answered from
    -- it still resolve to the document they were answered from.
    status         text NOT NULL DEFAULT 'published'
                   CHECK (status IN ('published', 'archived')),

    -- Only the evaluation is completed digitally. Annex B and Annex C are
    -- reference documents unless and until they are known to need company input,
    -- so nothing here assumes every PDF becomes a form.
    is_digital_form boolean NOT NULL DEFAULT false,

    evaluation_deadline date,

    uploaded_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    uploaded_at    timestamptz NOT NULL DEFAULT now(),
    archived_at    timestamptz,

    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

-- One live template per company per type. A replacement archives the previous
-- row first, which is what keeps this satisfiable while history accumulates.
CREATE UNIQUE INDEX IF NOT EXISTS evaluation_templates_live_uniq
    ON public.evaluation_templates (company_id, document_type)
    WHERE status = 'published';

CREATE INDEX IF NOT EXISTS evaluation_templates_company_idx
    ON public.evaluation_templates (company_id, document_type, version DESC);

DROP TRIGGER IF EXISTS evaluation_templates_set_updated_at ON public.evaluation_templates;
CREATE TRIGGER evaluation_templates_set_updated_at
    BEFORE UPDATE ON public.evaluation_templates
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ----------------------------------------------------------------------------
-- 2. public.evaluations becomes the evaluation instance
--
--    The 11 score columns already on this table are the answers. What is added
--    here is only what turns a free-standing evaluation record into one
--    instance of a template: where it came from, and where it is in its life.
-- ----------------------------------------------------------------------------

ALTER TABLE public.evaluations
    ADD COLUMN IF NOT EXISTS template_id  uuid REFERENCES public.evaluation_templates(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'not_started',
    ADD COLUMN IF NOT EXISTS started_at   timestamptz,
    ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
    -- overall_rating stays the 1-5 mean the existing form produced;
    -- total_score is the same result as a percentage, which is how the
    -- coordinator, adviser and student views report it.
    ADD COLUMN IF NOT EXISTS total_score  numeric(5,2),
    ADD COLUMN IF NOT EXISTS reviewed_at  timestamptz,
    ADD COLUMN IF NOT EXISTS reviewed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.evaluations'::regclass AND conname = 'evaluations_status_check'
    ) THEN
        ALTER TABLE public.evaluations
            ADD CONSTRAINT evaluations_status_check
            CHECK (status IN ('not_started', 'in_progress', 'submitted', 'reviewed'));
    END IF;
END;
$$;

-- One evaluation per student per company placement: this is what stops a second
-- visit, a refresh, a re-sync or a republished template from creating a
-- duplicate evaluation task for someone who already has one.
CREATE UNIQUE INDEX IF NOT EXISTS evaluations_company_student_uniq
    ON public.evaluations (company_id, student_id)
    WHERE template_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS evaluations_company_status_idx
    ON public.evaluations (company_id, status);

DROP TRIGGER IF EXISTS evaluations_set_updated_at ON public.evaluations;
CREATE TRIGGER evaluations_set_updated_at
    BEFORE UPDATE ON public.evaluations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ----------------------------------------------------------------------------
-- 3. Row level security
--
--    Templates are readable by everyone with a relationship to the company.
--    Evaluations keep the policies they already had; the one gap was the
--    adviser, who is expected to review their own students' results.
-- ----------------------------------------------------------------------------

ALTER TABLE public.evaluation_templates ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_read_company_templates(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_role       text;
    v_company_id uuid;
BEGIN
    IF auth.uid() IS NULL OR p_company_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT account_type, company_id INTO v_role, v_company_id
    FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;

    IF v_role IN ('coordinator', 'admin') THEN
        RETURN true;
    END IF;

    -- The company itself, and the students it hosts.
    IF v_role IN ('company', 'student') THEN
        RETURN v_company_id = p_company_id;
    END IF;

    -- An adviser, for any company hosting a student of their sections.
    IF v_role = 'adviser' THEN
        RETURN EXISTS (
            SELECT 1
            FROM public.profiles s
            JOIN public.adviser_sections a ON a.adviser_id = auth.uid() AND a.status = 'active'
            JOIN public.sections sec ON sec.id = a.section_id
             AND upper(btrim(sec.name)) = public.canonical_section_name(s.section, s.course, s.year_level)
            WHERE s.account_type = 'student' AND s.company_id = p_company_id
        );
    END IF;

    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_read_company_templates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_company_templates(uuid) TO authenticated;

DROP POLICY IF EXISTS "Related users can read evaluation templates" ON public.evaluation_templates;
CREATE POLICY "Related users can read evaluation templates"
    ON public.evaluation_templates FOR SELECT TO authenticated
    USING (public.can_read_company_templates(company_id));

-- Advisers review their own students' evaluations. The company, coordinator and
-- student policies already on this table are left exactly as they were.
DROP POLICY IF EXISTS "Advisers can view assigned student evaluations" ON public.evaluations;
CREATE POLICY "Advisers can view assigned student evaluations"
    ON public.evaluations FOR SELECT TO authenticated
    USING (
        public.is_adviser()
        AND EXISTS (
            SELECT 1
            FROM public.profiles s
            JOIN public.adviser_sections a ON a.adviser_id = auth.uid() AND a.status = 'active'
            JOIN public.sections sec ON sec.id = a.section_id
             AND upper(btrim(sec.name)) = public.canonical_section_name(s.section, s.course, s.year_level)
            WHERE s.auth_user_id = evaluations.student_id
        )
    );


-- ----------------------------------------------------------------------------
-- 4. Storage — templates live in the company's own folder
--
--    Path: <company_id>/sil-templates/<document_type>/<uuid>.pdf in the existing
--    `company_documents` bucket. Its policies already grant read to the company
--    account and to every profile assigned to that company, which is the company
--    and its students. Added below: coordinator write and read, and adviser read.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Coordinators can upload SIL templates" ON storage.objects;
CREATE POLICY "Coordinators can upload SIL templates"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'company_documents'
        AND (storage.foldername(objects.name))[2] = 'sil-templates'
        AND (public.is_coordinator() OR public.is_admin())
    );

DROP POLICY IF EXISTS "Coordinators can delete SIL templates" ON storage.objects;
CREATE POLICY "Coordinators can delete SIL templates"
    ON storage.objects FOR DELETE TO authenticated
    USING (
        bucket_id = 'company_documents'
        AND (storage.foldername(objects.name))[2] = 'sil-templates'
        AND (public.is_coordinator() OR public.is_admin())
    );

DROP POLICY IF EXISTS "Coordinators can read company documents" ON storage.objects;
CREATE POLICY "Coordinators can read company documents"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'company_documents'
        AND (public.is_coordinator() OR public.is_admin())
    );

DROP POLICY IF EXISTS "Advisers can read SIL templates" ON storage.objects;
CREATE POLICY "Advisers can read SIL templates"
    ON storage.objects FOR SELECT TO authenticated
    USING (
        bucket_id = 'company_documents'
        AND (storage.foldername(objects.name))[2] = 'sil-templates'
        AND public.is_adviser()
        AND EXISTS (
            SELECT 1
            FROM public.profiles s
            JOIN public.adviser_sections a ON a.adviser_id = auth.uid() AND a.status = 'active'
            JOIN public.sections sec ON sec.id = a.section_id
             AND upper(btrim(sec.name)) = public.canonical_section_name(s.section, s.course, s.year_level)
            WHERE s.account_type = 'student'
              AND (s.company_id)::text = (storage.foldername(objects.name))[1]
        )
    );


-- ----------------------------------------------------------------------------
-- 5. Creating the evaluation tasks
--
--    One task per student currently assigned to the company, generated from the
--    published evaluation template. Called when a template is published and
--    again whenever a portal loads the worklist, so a student assigned to the
--    company later still gets their evaluation without anyone re-publishing.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_company_evaluations(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_template public.evaluation_templates%ROWTYPE;
    v_role     text;
    v_company  uuid;
    v_created  integer := 0;
BEGIN
    SELECT account_type, company_id INTO v_role, v_company
    FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;

    -- Creating evaluation tasks is a staff or host-company action. A student
    -- reading their own status must never be the thing that generates them.
    IF NOT (
        v_role IN ('coordinator', 'admin')
        OR (v_role = 'company' AND v_company = p_company_id)
    ) THEN
        RAISE EXCEPTION 'Not authorized to generate evaluations for this company';
    END IF;

    SELECT * INTO v_template
    FROM public.evaluation_templates
    WHERE company_id = p_company_id AND document_type = 'evaluation' AND status = 'published'
    LIMIT 1;

    -- No published evaluation means there is nothing for the company to fill in
    -- yet. That is a normal state, not an error.
    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    -- A student who already has an evaluation at this company keeps it, whatever
    -- template it came from. That is what makes republishing safe: a student
    -- already evaluated against v1 is not handed a second, empty v2 task, and
    -- only students who have never been evaluated here pick up the new version.
    WITH inserted AS (
        INSERT INTO public.evaluations (template_id, student_id, company_id, status)
        SELECT v_template.id, s.auth_user_id, p_company_id, 'not_started'
        FROM public.profiles s
        WHERE s.account_type = 'student'
          AND s.company_id = p_company_id
          AND s.auth_user_id IS NOT NULL
          AND s.is_active IS DISTINCT FROM false
          AND NOT EXISTS (
              SELECT 1 FROM public.evaluations e
              WHERE e.student_id = s.auth_user_id AND e.company_id = p_company_id
          )
        ON CONFLICT DO NOTHING
        RETURNING 1
    )
    SELECT count(*)::integer INTO v_created FROM inserted;

    RETURN v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_company_evaluations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_company_evaluations(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 6. Publishing a template
--
--    Uploading is the coordinator's only action: the file goes to storage, this
--    records it, archives whatever it replaces, generates the evaluation tasks
--    and tells the company and its students. No student is ever chosen by hand.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_evaluation_template(
    p_company_id    uuid,
    p_document_type text,
    p_file_path     text,
    p_file_name     text,
    p_file_type     text,
    p_file_size     bigint,
    p_deadline      date DEFAULT NULL
)
RETURNS public.evaluation_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_actor_role  text;
    v_company     public.companies%ROWTYPE;
    v_previous    public.evaluation_templates%ROWTYPE;
    v_template    public.evaluation_templates%ROWTYPE;
    v_version     integer := 1;
    v_title       text;
    v_safe_name   text;
    v_students    integer := 0;
    v_created     integer := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT account_type INTO v_actor_role
    FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;

    IF v_actor_role IS DISTINCT FROM 'coordinator' AND v_actor_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Only a coordinator may publish evaluation templates';
    END IF;

    IF p_document_type NOT IN ('evaluation', 'annex_b', 'annex_c') THEN
        RAISE EXCEPTION 'Unknown document type: %', p_document_type;
    END IF;

    SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That company does not exist';
    END IF;

    IF COALESCE(p_file_type, '') <> 'application/pdf' THEN
        RAISE EXCEPTION 'Templates must be PDF files';
    END IF;

    -- The path is generated by the caller and matched here against exactly the
    -- shape this function issues, so nothing derived from the uploaded filename
    -- can appear in it.
    IF p_file_path IS NULL
       OR p_file_path !~ ('^' || p_company_id::text || '/sil-templates/' || p_document_type
                          || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$') THEN
        RAISE EXCEPTION 'Refusing a storage path outside this company''s template folder';
    END IF;

    IF p_file_size IS NOT NULL AND p_file_size > 15 * 1024 * 1024 THEN
        RAISE EXCEPTION 'That file is larger than the 15 MB limit';
    END IF;

    v_title := CASE p_document_type
        WHEN 'evaluation' THEN 'Evaluation'
        WHEN 'annex_b'    THEN 'Annex B'
        WHEN 'annex_c'    THEN 'Annex C'
    END;

    v_safe_name := left(regexp_replace(COALESCE(NULLIF(btrim(p_file_name), ''), v_title || '.pdf'),
                                       '[\\/\r\n\t]', '_', 'g'), 200);

    -- Archive the version being replaced instead of overwriting it: evaluations
    -- already answered stay attached to the document they were answered from.
    SELECT * INTO v_previous
    FROM public.evaluation_templates
    WHERE company_id = p_company_id AND document_type = p_document_type AND status = 'published';

    IF FOUND THEN
        v_version := v_previous.version + 1;
        UPDATE public.evaluation_templates
           SET status = 'archived', archived_at = now()
         WHERE id = v_previous.id;
    END IF;

    INSERT INTO public.evaluation_templates (
        company_id, document_type, title,
        file_path, file_name, file_type, file_size,
        version, status, is_digital_form, evaluation_deadline, uploaded_by
    ) VALUES (
        p_company_id, p_document_type, v_title,
        p_file_path, v_safe_name, p_file_type, p_file_size,
        v_version, 'published', p_document_type = 'evaluation', p_deadline, auth.uid()
    )
    RETURNING * INTO v_template;

    IF p_document_type = 'evaluation' THEN
        v_created := public.sync_company_evaluations(p_company_id);
    END IF;

    SELECT count(*)::integer INTO v_students
    FROM public.profiles
    WHERE account_type = 'student' AND company_id = p_company_id AND is_active IS DISTINCT FROM false;

    -- Notifications are written straight into user_notifications rather than
    -- through notify_users(): this function is already the authority on who
    -- should be told, and the recipients include students, whom notify_users
    -- deliberately does not let one another write to. The existing
    -- `notification_email` webhook turns each row into an email.
    INSERT INTO public.user_notifications (
        user_id, title, message, type, notification_type,
        related_type, related_id, created_by, action_path, action_label
    )
    SELECT
        p.auth_user_id,
        CASE WHEN p_document_type = 'evaluation'
             THEN 'Student evaluations are ready'
             ELSE v_title || ' is now available' END,
        CASE WHEN p_document_type = 'evaluation'
             THEN format('An evaluation is now available for your assigned SIL/OJT students at %s. %s student%s require%s evaluation.',
                         v_company.name, v_students, CASE WHEN v_students = 1 THEN '' ELSE 's' END,
                         CASE WHEN v_students = 1 THEN 's' ELSE '' END)
             ELSE format('The SIL Coordinator published the official %s for %s. You can view it in your portal.',
                         v_title, v_company.name) END,
        'info', 'assignment',
        'evaluation_template', v_template.id, auth.uid(),
        CASE WHEN p_document_type = 'evaluation' THEN '/company/evaluations' ELSE '/company/documents' END,
        CASE WHEN p_document_type = 'evaluation' THEN 'Start evaluating' ELSE 'View the document' END
    FROM public.profiles p
    WHERE p.account_type = 'company'
      AND p.company_id = p_company_id
      AND p.auth_user_id IS NOT NULL;

    IF p_document_type = 'evaluation' THEN
        INSERT INTO public.user_notifications (
            user_id, title, message, type, notification_type,
            related_type, related_id, created_by, action_path, action_label
        )
        SELECT
            s.auth_user_id,
            'Your SIL/OJT evaluation is available',
            format('Your company, %s, has been notified that your SIL/OJT evaluation is now available. They will complete it in the SIL/OJT Monitoring System.',
                   v_company.name),
            'info', 'assignment',
            'evaluation_template', v_template.id, auth.uid(),
            '/student/performance', 'View my evaluation'
        FROM public.profiles s
        WHERE s.account_type = 'student'
          AND s.company_id = p_company_id
          AND s.auth_user_id IS NOT NULL
          AND s.is_active IS DISTINCT FROM false;
    END IF;

    RETURN v_template;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_evaluation_template(uuid, text, text, text, text, bigint, date)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_evaluation_template(uuid, text, text, text, text, bigint, date)
    TO authenticated;


-- ----------------------------------------------------------------------------
-- 7. Reading — the coordinator's company picker and one company's templates
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_evaluation_companies()
RETURNS TABLE (
    company_id        uuid,
    company_name      text,
    student_count     integer,
    templates_on_file integer,
    has_evaluation    boolean,
    has_portal_account boolean,
    evaluation_deadline date,
    submitted_count   integer,
    total_evaluations integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_role          text;
    v_department_id uuid;
BEGIN
    SELECT account_type, department_id INTO v_role, v_department_id
    FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;

    IF v_role IS DISTINCT FROM 'coordinator' AND v_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Only a coordinator may browse company evaluations';
    END IF;

    RETURN QUERY
    SELECT
        c.id,
        c.name,
        (SELECT count(*)::integer FROM public.profiles s
          WHERE s.account_type = 'student' AND s.company_id = c.id AND s.is_active IS DISTINCT FROM false),
        (SELECT count(*)::integer FROM public.evaluation_templates t
          WHERE t.company_id = c.id AND t.status = 'published'),
        EXISTS (SELECT 1 FROM public.evaluation_templates t
                 WHERE t.company_id = c.id AND t.document_type = 'evaluation' AND t.status = 'published'),
        EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.account_type = 'company' AND p.company_id = c.id AND p.auth_user_id IS NOT NULL),
        (SELECT t.evaluation_deadline FROM public.evaluation_templates t
          WHERE t.company_id = c.id AND t.document_type = 'evaluation' AND t.status = 'published' LIMIT 1),
        (SELECT count(*)::integer FROM public.evaluations e
          WHERE e.company_id = c.id AND e.status IN ('submitted', 'reviewed')),
        (SELECT count(*)::integer FROM public.evaluations e WHERE e.company_id = c.id)
    FROM public.companies c
    WHERE (v_role = 'admin' OR v_department_id IS NULL OR c.department_id = v_department_id
           OR EXISTS (SELECT 1 FROM public.profiles s
                       WHERE s.account_type = 'student' AND s.company_id = c.id
                         AND s.department_id = v_department_id))
    ORDER BY c.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_evaluation_companies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_evaluation_companies() TO authenticated;


-- The three document slots for one company, filed or not.
CREATE OR REPLACE FUNCTION public.get_company_templates(p_company_id uuid)
RETURNS TABLE (
    document_type    text,
    title            text,
    template_id      uuid,
    file_name        text,
    file_path        text,
    file_size        bigint,
    version          integer,
    is_digital_form  boolean,
    evaluation_deadline date,
    uploaded_at      timestamptz,
    uploaded_by_name text,
    previous_versions integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    IF NOT public.can_read_company_templates(p_company_id) THEN
        RAISE EXCEPTION 'Not authorized to view this company''s documents';
    END IF;

    RETURN QUERY
    SELECT
        slot.document_type::text,
        (CASE slot.document_type
            WHEN 'evaluation' THEN 'Evaluation'
            WHEN 'annex_b'    THEN 'Annex B'
            WHEN 'annex_c'    THEN 'Annex C'
        END)::text,
        t.id,
        t.file_name,
        t.file_path,
        t.file_size,
        t.version,
        COALESCE(t.is_digital_form, false),
        t.evaluation_deadline,
        t.uploaded_at,
        NULLIF(btrim(concat_ws(' ', up.first_name, up.last_name)), ''),
        (SELECT count(*)::integer FROM public.evaluation_templates old
          WHERE old.company_id = p_company_id
            AND old.document_type = slot.document_type
            AND old.status = 'archived')
    FROM (VALUES ('evaluation'), ('annex_b'), ('annex_c')) AS slot(document_type)
    LEFT JOIN public.evaluation_templates t
           ON t.company_id = p_company_id
          AND t.document_type = slot.document_type
          AND t.status = 'published'
    LEFT JOIN public.profiles up ON up.auth_user_id = t.uploaded_by;
END;
$$;

REVOKE ALL ON FUNCTION public.get_company_templates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_templates(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 8. The worklist
--
--    One row per student assigned to the company: who they are and where their
--    evaluation stands. Drives the company's Evaluations page and the
--    coordinator's monitoring view from the same definition, so the two can
--    never disagree about how many are outstanding.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_company_evaluation_worklist(p_company_id uuid)
RETURNS TABLE (
    evaluation_id    uuid,
    student_id       uuid,
    student_name     text,
    student_email    text,
    course           text,
    section          text,
    status           text,
    started_at       timestamptz,
    submitted_at     timestamptz,
    total_score      numeric,
    overall_rating   numeric,
    evaluator_name   text,
    template_id      uuid,
    evaluation_deadline date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_role    text;
    v_company uuid;
    v_ignored integer;
BEGIN
    SELECT account_type, company_id INTO v_role, v_company
    FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;

    -- Deliberately narrower than can_read_company_templates(): the template is
    -- readable by the students too, but this roster names every intern at the
    -- company and how they scored, which is for the company and the programme
    -- staff only.
    IF NOT (
        v_role IN ('coordinator', 'admin')
        OR (v_role = 'company' AND v_company = p_company_id)
    ) THEN
        RAISE EXCEPTION 'Not authorized to view this company''s evaluation list';
    END IF;

    -- A student assigned to the company after the template was published still
    -- needs their evaluation, so the list materialises what is missing before
    -- it reports. This is why no one has to re-publish to pick up a new intern.
    v_ignored := public.sync_company_evaluations(p_company_id);

    RETURN QUERY
    SELECT
        e.id,
        s.auth_user_id,
        NULLIF(btrim(concat_ws(' ', s.first_name, s.last_name)), ''),
        s.email,
        s.course,
        public.canonical_section_name(s.section, s.course, s.year_level),
        COALESCE(e.status, 'not_started')::text,
        e.started_at,
        e.submitted_at,
        e.total_score,
        e.overall_rating,
        NULLIF(btrim(concat_ws(' ', ev.first_name, ev.last_name)), ''),
        e.template_id,
        t.evaluation_deadline
    FROM public.profiles s
    LEFT JOIN public.evaluations e
           ON e.student_id = s.auth_user_id AND e.company_id = p_company_id
    LEFT JOIN public.evaluation_templates t ON t.id = e.template_id
    LEFT JOIN public.profiles ev ON ev.auth_user_id = e.evaluator_id
    WHERE s.account_type = 'student'
      AND s.company_id = p_company_id
      AND s.is_active IS DISTINCT FROM false
    ORDER BY s.last_name NULLS LAST, s.first_name NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_company_evaluation_worklist(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_evaluation_worklist(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 9. Completing an evaluation
--
--    A draft may be saved as often as the company likes. Submitting is final:
--    it requires every criterion to be rated, computes the score, and is the
--    point at which the student, their adviser and the coordinators are told.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_evaluation_draft(
    p_evaluation_id uuid,
    p_scores        jsonb,
    p_comments      text DEFAULT NULL,
    p_strengths     text DEFAULT NULL,
    p_weaknesses    text DEFAULT NULL,
    p_recommendations text DEFAULT NULL,
    p_submit        boolean DEFAULT false
)
RETURNS public.evaluations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_actor_role  text;
    v_actor_company uuid;
    v_evaluation  public.evaluations%ROWTYPE;
    v_student     public.profiles%ROWTYPE;
    v_company     public.companies%ROWTYPE;
    v_adviser_id  uuid;
    v_mean        numeric;
    v_criteria    text[] := ARRAY[
        'attendance_score', 'punctuality_score', 'communication_score',
        'professionalism_score', 'technical_skills_score', 'problem_solving_score',
        'teamwork_score', 'initiative_score', 'adaptability_score',
        'work_quality_score', 'responsibility_score'];
    v_key         text;
    v_value       integer;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT account_type, company_id INTO v_actor_role, v_actor_company
    FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;

    IF v_actor_role IS DISTINCT FROM 'company' THEN
        RAISE EXCEPTION 'Only the host company may complete a student evaluation';
    END IF;

    SELECT * INTO v_evaluation FROM public.evaluations WHERE id = p_evaluation_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That evaluation does not exist';
    END IF;

    IF v_evaluation.company_id IS DISTINCT FROM v_actor_company THEN
        RAISE EXCEPTION 'That evaluation belongs to another company';
    END IF;

    -- A submitted evaluation is the company's final answer. The student and the
    -- adviser have already been told what it says, so it does not change.
    IF v_evaluation.status IN ('submitted', 'reviewed') THEN
        RAISE EXCEPTION 'This evaluation has already been submitted';
    END IF;

    -- Each score is validated here as well as by the column CHECK, so a bad
    -- value produces a message the evaluator can act on.
    FOREACH v_key IN ARRAY v_criteria LOOP
        IF p_scores ? v_key AND jsonb_typeof(p_scores -> v_key) <> 'null' THEN
            v_value := (p_scores ->> v_key)::integer;
            IF v_value < 1 OR v_value > 5 THEN
                RAISE EXCEPTION 'Every rating must be between 1 and 5';
            END IF;
        ELSIF p_submit THEN
            RAISE EXCEPTION 'Please rate every criterion before submitting';
        END IF;
    END LOOP;

    UPDATE public.evaluations
       SET attendance_score        = COALESCE((p_scores ->> 'attendance_score')::integer, attendance_score),
           punctuality_score       = COALESCE((p_scores ->> 'punctuality_score')::integer, punctuality_score),
           communication_score     = COALESCE((p_scores ->> 'communication_score')::integer, communication_score),
           professionalism_score   = COALESCE((p_scores ->> 'professionalism_score')::integer, professionalism_score),
           technical_skills_score  = COALESCE((p_scores ->> 'technical_skills_score')::integer, technical_skills_score),
           problem_solving_score   = COALESCE((p_scores ->> 'problem_solving_score')::integer, problem_solving_score),
           teamwork_score          = COALESCE((p_scores ->> 'teamwork_score')::integer, teamwork_score),
           initiative_score        = COALESCE((p_scores ->> 'initiative_score')::integer, initiative_score),
           adaptability_score      = COALESCE((p_scores ->> 'adaptability_score')::integer, adaptability_score),
           work_quality_score      = COALESCE((p_scores ->> 'work_quality_score')::integer, work_quality_score),
           responsibility_score    = COALESCE((p_scores ->> 'responsibility_score')::integer, responsibility_score),
           comments        = COALESCE(p_comments, comments),
           strengths       = COALESCE(p_strengths, strengths),
           weaknesses      = COALESCE(p_weaknesses, weaknesses),
           recommendations = COALESCE(p_recommendations, recommendations),
           evaluator_id    = auth.uid(),
           started_at      = COALESCE(started_at, now()),
           status          = CASE WHEN p_submit THEN 'submitted' ELSE 'in_progress' END,
           submitted_at    = CASE WHEN p_submit THEN now() ELSE submitted_at END
     WHERE id = p_evaluation_id
    RETURNING * INTO v_evaluation;

    -- The rubric is 11 criteria scored 1-5. overall_rating keeps the 1-5 mean the
    -- existing form produced; total_score is the same figure as a percentage.
    v_mean := (
        v_evaluation.attendance_score + v_evaluation.punctuality_score
      + v_evaluation.communication_score + v_evaluation.professionalism_score
      + v_evaluation.technical_skills_score + v_evaluation.problem_solving_score
      + v_evaluation.teamwork_score + v_evaluation.initiative_score
      + v_evaluation.adaptability_score + v_evaluation.work_quality_score
      + v_evaluation.responsibility_score
    )::numeric / array_length(v_criteria, 1);

    IF v_mean IS NOT NULL THEN
        UPDATE public.evaluations
           SET overall_rating = round(v_mean, 2),
               total_score    = round(v_mean / 5 * 100, 2)
         WHERE id = p_evaluation_id
        RETURNING * INTO v_evaluation;
    END IF;

    IF NOT p_submit THEN
        RETURN v_evaluation;
    END IF;

    -- ── Submitted: tell the people who are waiting on it ────────────────────
    SELECT * INTO v_student FROM public.profiles WHERE auth_user_id = v_evaluation.student_id;
    SELECT * INTO v_company FROM public.companies WHERE id = v_evaluation.company_id;

    SELECT a.adviser_id INTO v_adviser_id
    FROM public.adviser_sections a
    JOIN public.sections sec ON sec.id = a.section_id
    WHERE a.status = 'active'
      AND upper(btrim(sec.name)) = public.canonical_section_name(
              v_student.section, v_student.course, v_student.year_level)
    ORDER BY a.assigned_at DESC NULLS LAST
    LIMIT 1;

    -- Written directly rather than through notify_users(), which by design does
    -- not let a company account write into a student's inbox. This function is
    -- the authority on who should hear about a submission. The existing
    -- `notification_email` webhook turns each row into an email.
    INSERT INTO public.user_notifications (
        user_id, title, message, type, notification_type,
        related_type, related_id, created_by, action_path, action_label
    )
    SELECT * FROM (
        VALUES
        (v_evaluation.student_id,
         'Your SIL/OJT evaluation is complete',
         format('Your SIL/OJT evaluation has been completed by %s. You can now view the result from your SIL/OJT portal.',
                COALESCE(v_company.name, 'your company')),
         'success', 'assignment', 'evaluation', v_evaluation.id, auth.uid(),
         '/student/performance', 'View my evaluation'),
        (v_adviser_id,
         'SIL/OJT evaluation completed',
         format('%s submitted the SIL/OJT evaluation for your assigned student %s. Overall score: %s%%.',
                COALESCE(v_company.name, 'The company'),
                COALESCE(NULLIF(btrim(concat_ws(' ', v_student.first_name, v_student.last_name)), ''), 'a student'),
                COALESCE(v_evaluation.total_score::text, '-')),
         'info', 'assignment', 'evaluation', v_evaluation.id, auth.uid(),
         '/adviser/students', 'Review the evaluation')
    ) AS n(user_id, title, message, type, notification_type, related_type, related_id, created_by, action_path, action_label)
    WHERE n.user_id IS NOT NULL;

    -- The coordinators who own this student's department.
    INSERT INTO public.user_notifications (
        user_id, title, message, type, notification_type,
        related_type, related_id, created_by, action_path, action_label
    )
    SELECT
        p.auth_user_id,
        'SIL/OJT evaluation submitted',
        format('%s submitted the SIL/OJT evaluation for %s.',
               COALESCE(v_company.name, 'A company'),
               COALESCE(NULLIF(btrim(concat_ws(' ', v_student.first_name, v_student.last_name)), ''), 'a student')),
        'info', 'assignment', 'evaluation', v_evaluation.id, auth.uid(),
        '/coordinator/evaluations', 'Open evaluation monitoring'
    FROM public.profiles p
    WHERE p.account_type = 'coordinator'
      AND p.auth_user_id IS NOT NULL
      AND (v_student.department_id IS NULL OR p.department_id IS NULL OR p.department_id = v_student.department_id);

    RETURN v_evaluation;
END;
$$;

REVOKE ALL ON FUNCTION public.save_evaluation_draft(uuid, jsonb, text, text, text, text, boolean)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_evaluation_draft(uuid, jsonb, text, text, text, text, boolean)
    TO authenticated;


-- Acknowledging a result. Deliberately the only write a coordinator or adviser
-- has on an evaluation: neither of them can change what the company answered.
CREATE OR REPLACE FUNCTION public.mark_evaluation_reviewed(p_evaluation_id uuid)
RETURNS public.evaluations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_role       text;
    v_evaluation public.evaluations%ROWTYPE;
BEGIN
    SELECT account_type INTO v_role FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;

    IF v_role NOT IN ('coordinator', 'admin', 'adviser') THEN
        RAISE EXCEPTION 'Only a coordinator or adviser may mark an evaluation reviewed';
    END IF;

    UPDATE public.evaluations
       SET status = 'reviewed', reviewed_at = now(), reviewed_by = auth.uid()
     WHERE id = p_evaluation_id AND status = 'submitted'
    RETURNING * INTO v_evaluation;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Only a submitted evaluation can be marked reviewed';
    END IF;

    RETURN v_evaluation;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_evaluation_reviewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_evaluation_reviewed(uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 10. One student's evaluation — for the student themselves and their adviser
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_student_evaluation(p_student_id uuid)
RETURNS TABLE (
    evaluation_id  uuid,
    student_id     uuid,
    student_name   text,
    company_id     uuid,
    company_name   text,
    evaluator_name text,
    status         text,
    submitted_at   timestamptz,
    total_score    numeric,
    overall_rating numeric,
    scores         jsonb,
    comments       text,
    strengths      text,
    weaknesses     text,
    recommendations text,
    template_id    uuid,
    template_file_path text,
    evaluation_deadline date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_role text;
BEGIN
    SELECT account_type INTO v_role FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;

    -- The student themselves, staff, or an adviser who holds their section. A
    -- company cannot read another company's student through this.
    IF NOT (
        p_student_id = auth.uid()
        OR v_role IN ('coordinator', 'admin')
        OR (v_role = 'adviser' AND EXISTS (
              SELECT 1
              FROM public.profiles s
              JOIN public.adviser_sections a ON a.adviser_id = auth.uid() AND a.status = 'active'
              JOIN public.sections sec ON sec.id = a.section_id
               AND upper(btrim(sec.name)) = public.canonical_section_name(s.section, s.course, s.year_level)
              WHERE s.auth_user_id = p_student_id))
        OR (v_role = 'company' AND EXISTS (
              SELECT 1 FROM public.profiles me
              JOIN public.profiles s ON s.auth_user_id = p_student_id
              WHERE me.auth_user_id = auth.uid() AND me.company_id = s.company_id))
    ) THEN
        RAISE EXCEPTION 'Not authorized to view this evaluation';
    END IF;

    RETURN QUERY
    SELECT
        e.id,
        s.auth_user_id,
        NULLIF(btrim(concat_ws(' ', s.first_name, s.last_name)), ''),
        c.id,
        c.name,
        NULLIF(btrim(concat_ws(' ', ev.first_name, ev.last_name)), ''),
        COALESCE(e.status, 'not_started')::text,
        e.submitted_at,
        e.total_score,
        e.overall_rating,
        -- Only released once the company has actually submitted: a half-filled
        -- draft is not something the student or the adviser should be reading.
        CASE WHEN e.status IN ('submitted', 'reviewed') THEN jsonb_build_object(
            'attendance_score', e.attendance_score,
            'punctuality_score', e.punctuality_score,
            'communication_score', e.communication_score,
            'professionalism_score', e.professionalism_score,
            'technical_skills_score', e.technical_skills_score,
            'problem_solving_score', e.problem_solving_score,
            'teamwork_score', e.teamwork_score,
            'initiative_score', e.initiative_score,
            'adaptability_score', e.adaptability_score,
            'work_quality_score', e.work_quality_score,
            'responsibility_score', e.responsibility_score
        ) END,
        CASE WHEN e.status IN ('submitted', 'reviewed') THEN e.comments END,
        CASE WHEN e.status IN ('submitted', 'reviewed') THEN e.strengths END,
        CASE WHEN e.status IN ('submitted', 'reviewed') THEN e.weaknesses END,
        CASE WHEN e.status IN ('submitted', 'reviewed') THEN e.recommendations END,
        t.id,
        t.file_path,
        t.evaluation_deadline
    FROM public.profiles s
    LEFT JOIN public.companies c ON c.id = s.company_id
    LEFT JOIN public.evaluations e ON e.student_id = s.auth_user_id AND e.company_id = s.company_id
    LEFT JOIN public.evaluation_templates t ON t.id = e.template_id
    LEFT JOIN public.profiles ev ON ev.auth_user_id = e.evaluator_id
    WHERE s.auth_user_id = p_student_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_evaluation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_evaluation(uuid) TO authenticated;


-- Every evaluation for the sections an adviser holds.
CREATE OR REPLACE FUNCTION public.get_adviser_evaluations()
RETURNS TABLE (
    evaluation_id  uuid,
    student_id     uuid,
    student_name   text,
    section        text,
    company_name   text,
    evaluator_name text,
    status         text,
    submitted_at   timestamptz,
    total_score    numeric,
    comments       text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    IF NOT public.is_adviser() THEN
        RAISE EXCEPTION 'Only an adviser may load their own evaluation list';
    END IF;

    RETURN QUERY
    SELECT
        e.id,
        s.auth_user_id,
        NULLIF(btrim(concat_ws(' ', s.first_name, s.last_name)), ''),
        public.canonical_section_name(s.section, s.course, s.year_level),
        c.name,
        NULLIF(btrim(concat_ws(' ', ev.first_name, ev.last_name)), ''),
        COALESCE(e.status, 'not_started')::text,
        e.submitted_at,
        e.total_score,
        CASE WHEN e.status IN ('submitted', 'reviewed') THEN e.comments END
    FROM public.profiles s
    LEFT JOIN public.companies c ON c.id = s.company_id
    LEFT JOIN public.evaluations e ON e.student_id = s.auth_user_id AND e.company_id = s.company_id
    LEFT JOIN public.profiles ev ON ev.auth_user_id = e.evaluator_id
    WHERE s.account_type = 'student'
      AND public.canonical_section_name(s.section, s.course, s.year_level) IN (
            SELECT upper(btrim(sec.name))
            FROM public.adviser_sections a
            JOIN public.sections sec ON sec.id = a.section_id
            WHERE a.adviser_id = auth.uid() AND a.status = 'active')
    ORDER BY s.last_name NULLS LAST, s.first_name NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_adviser_evaluations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_adviser_evaluations() TO authenticated;


GRANT SELECT ON public.evaluation_templates TO authenticated;

COMMENT ON TABLE public.evaluation_templates IS
    'The official Evaluation / Annex B / Annex C PDF, held once per company and versioned. Publishing an evaluation generates one row in public.evaluations per assigned student; replacing it archives this row so submitted evaluations still point at the document they were answered from.';
COMMENT ON COLUMN public.evaluations.template_id IS
    'The evaluation_templates row this evaluation instance was generated from. NULL for evaluations recorded before the template model existed.';


-- ----------------------------------------------------------------------------
-- 11. Nothing else to deploy
--
--    Every notification raised here is a row in public.user_notifications, so
--    the `notification_email` webhook and Edge Function that are already running
--    send the emails. There is no new function and no new webhook.
-- ----------------------------------------------------------------------------
