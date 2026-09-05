-- ==============================================================================
-- OJT/SIL Requirements — Parent's Clearance & Waiver
-- Run this once in the Supabase SQL Editor, after supabase_notifications_system.sql.
--
-- Design notes
--   This does NOT introduce a new documents table or a new bucket. The existing
--   `public.student_documents` table and the private `documents` bucket already
--   carry student requirement uploads, with RLS for the owner, coordinators and
--   section advisers. This migration extends them with the fields a verifiable
--   requirement needs (type, size, submission and review metadata) and closes
--   two gaps found while wiring the feature up:
--
--     * `student_documents` had no policy for admins at all, so an admin could
--       not see or review any student requirement.
--     * The `documents` storage bucket only granted SELECT to the owner and to
--       coordinators, so an admin or a section adviser could read the database
--       row but never open the file it points at.
--
--   Statuses stay in the table's existing vocabulary so the current approvals
--   queue keeps working unchanged:
--     no row            = NOT SUBMITTED
--     'pending'         = FOR VERIFICATION
--     'approved'        = APPROVED
--     'revision_required' = REVISION REQUIRED   (new; 'rejected' stays valid for
--                                                legacy rows)
-- ==============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend student_documents
-- ----------------------------------------------------------------------------
ALTER TABLE public.student_documents
  ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewer_remarks TEXT;

ALTER TABLE public.student_documents
  DROP CONSTRAINT IF EXISTS student_documents_document_type_check;
ALTER TABLE public.student_documents
  ADD CONSTRAINT student_documents_document_type_check
  CHECK (document_type IN ('GENERAL', 'PARENT_CLEARANCE_WAIVER'));

ALTER TABLE public.student_documents
  DROP CONSTRAINT IF EXISTS student_documents_status_check;
ALTER TABLE public.student_documents
  ADD CONSTRAINT student_documents_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'revision_required'));

-- Existing rows predate submission tracking; they were submitted when created.
UPDATE public.student_documents
   SET submitted_at = COALESCE(submitted_at, created_at)
 WHERE submitted_at IS NULL;

-- A student holds exactly one row per typed requirement. Re-uploading replaces
-- that row rather than piling up a new one each time.
CREATE UNIQUE INDEX IF NOT EXISTS student_documents_one_per_requirement_idx
  ON public.student_documents (user_id, document_type)
  WHERE document_type <> 'GENERAL';

CREATE INDEX IF NOT EXISTS student_documents_type_status_idx
  ON public.student_documents (document_type, status);
CREATE INDEX IF NOT EXISTS student_documents_reviewed_by_idx
  ON public.student_documents (reviewed_by);

-- ----------------------------------------------------------------------------
-- 2. Server-side guards
--    The status, the reviewer and the review timestamps are the verification
--    record. A student may upload and replace their own file, but may never
--    write those fields, and may never touch a document once it is approved —
--    the UI hides those actions, and this makes it true.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_student_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT account_type INTO v_role
  FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;

  -- Reviewers go through review_student_document(), which runs as owner and is
  -- not subject to this guard's student branch.
  IF v_role IN ('coordinator', 'admin', 'adviser') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.user_id := auth.uid();
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.reviewer_remarks := NULL;
    NEW.submitted_at := COALESCE(NEW.submitted_at, now());
    RETURN NEW;
  END IF;

  -- An approved requirement is locked. Only a reviewer can reopen it by
  -- requesting a revision.
  IF OLD.status = 'approved' THEN
    RAISE EXCEPTION 'This document has been approved and can no longer be changed';
  END IF;

  NEW.user_id := OLD.user_id;
  NEW.document_type := OLD.document_type;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();

  -- Replacing the file puts it back in the verification queue and clears the
  -- previous review, so a stale "revision required" remark cannot linger.
  NEW.status := 'pending';
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  NEW.reviewer_remarks := NULL;
  NEW.submitted_at := now();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_student_document() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_student_document_before_write ON public.student_documents;
CREATE TRIGGER guard_student_document_before_write
  BEFORE INSERT OR UPDATE ON public.student_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_student_document();

-- ----------------------------------------------------------------------------
-- 3. RLS — add the missing admin policies, and let a student withdraw a
--    submission that has not been approved yet.
-- ----------------------------------------------------------------------------
ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all documents" ON public.student_documents;
CREATE POLICY "Admins can view all documents"
  ON public.student_documents FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update all documents" ON public.student_documents;
CREATE POLICY "Admins can update all documents"
  ON public.student_documents FOR UPDATE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Users can delete own unapproved documents" ON public.student_documents;
CREATE POLICY "Users can delete own unapproved documents"
  ON public.student_documents FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND status <> 'approved');

-- ----------------------------------------------------------------------------
-- 4. Storage — a reviewer must be able to open what they are reviewing.
--    The bucket stays private; these only add SELECT for the roles that already
--    have SELECT on the matching database rows.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can select all documents" ON storage.objects;
CREATE POLICY "Admins can select all documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND public.is_admin());

DROP POLICY IF EXISTS "Advisers can select assigned student documents" ON storage.objects;
CREATE POLICY "Advisers can select assigned student documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND public.is_adviser()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.auth_user_id::text = (storage.foldername(storage.objects.name))[1]
        AND p.section IN (
          SELECT section_name FROM public.get_adviser_assigned_section_names(auth.uid())
        )
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Notify reviewers when a requirement is submitted
--    Runs as owner so it can write into other people's inboxes, exactly like
--    the announcement fan-out.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_requirement_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_student_name text;
  v_label text;
  v_department uuid;
BEGIN
  IF NEW.document_type = 'GENERAL' OR NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  -- Only a new submission or a genuine re-submission notifies anyone.
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND OLD.file_path = NEW.file_path THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(trim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''), department_id
    INTO v_student_name, v_department
  FROM public.profiles WHERE auth_user_id = NEW.user_id LIMIT 1;

  v_label := CASE NEW.document_type
               WHEN 'PARENT_CLEARANCE_WAIVER' THEN 'Parent''s Clearance & Waiver'
               ELSE 'OJT requirement'
             END;

  INSERT INTO public.user_notifications (
    user_id, title, message, type, is_read,
    notification_type, related_type, related_id, created_by
  )
  SELECT
    p.auth_user_id,
    v_label || ' Submitted',
    'New ' || v_label || ' submitted by ' || COALESCE(v_student_name, 'a student') || '.',
    'info',
    false,
    'assignment',
    'requirement',
    NEW.id,
    NEW.user_id
  FROM public.profiles p
  WHERE p.auth_user_id IS NOT NULL
    AND (
      p.account_type = 'admin'
      OR (p.account_type = 'coordinator' AND (v_department IS NULL OR p.department_id = v_department OR p.department_id IS NULL))
    );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_requirement_submitted() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_requirement_submitted_after_write ON public.student_documents;
CREATE TRIGGER notify_requirement_submitted_after_write
  AFTER INSERT OR UPDATE ON public.student_documents
  FOR EACH ROW EXECUTE FUNCTION public.notify_requirement_submitted();

-- ----------------------------------------------------------------------------
-- 6. Review a submitted requirement
--    The only supported way to approve or send a requirement back. Authorization
--    is re-checked here, a revision always carries a reason, and the student is
--    notified with the reviewer's remarks.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_student_document(
  p_document_id uuid,
  p_decision text,
  p_remarks text DEFAULT NULL
)
RETURNS public.student_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_role text;
  v_reviewer_name text;
  v_doc public.student_documents%ROWTYPE;
  v_label text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT account_type, NULLIF(trim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), '')
    INTO v_role, v_reviewer_name
  FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;

  IF v_role NOT IN ('coordinator', 'admin') THEN
    RAISE EXCEPTION 'Not authorized to review student requirements';
  END IF;

  IF p_decision NOT IN ('approved', 'revision_required') THEN
    RAISE EXCEPTION 'Unknown review decision';
  END IF;

  IF p_decision = 'revision_required'
     AND COALESCE(NULLIF(trim(p_remarks), ''), '') = '' THEN
    RAISE EXCEPTION 'A revision request must explain what needs to change';
  END IF;

  SELECT * INTO v_doc FROM public.student_documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  UPDATE public.student_documents
     SET status = p_decision,
         reviewer_remarks = NULLIF(trim(COALESCE(p_remarks, '')), ''),
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   WHERE id = p_document_id
  RETURNING * INTO v_doc;

  v_label := CASE v_doc.document_type
               WHEN 'PARENT_CLEARANCE_WAIVER' THEN 'Parent''s Clearance & Waiver'
               ELSE COALESCE(v_doc.title, 'OJT requirement')
             END;

  INSERT INTO public.user_notifications (
    user_id, title, message, type, is_read,
    notification_type, related_type, related_id, created_by
  )
  VALUES (
    v_doc.user_id,
    CASE WHEN p_decision = 'approved'
         THEN v_label || ' Approved'
         ELSE v_label || ' Requires Revision' END,
    CASE WHEN p_decision = 'approved'
         THEN 'Your ' || v_label || ' has been verified and approved by '
              || COALESCE(v_reviewer_name, 'the coordinator') || '.'
         ELSE 'Your ' || v_label || ' needs to be re-uploaded.' || E'\n\nRemarks: '
              || COALESCE(v_doc.reviewer_remarks, 'Please review and submit again.') END,
    CASE WHEN p_decision = 'approved' THEN 'success' ELSE 'warning' END,
    false,
    'assignment',
    'requirement',
    v_doc.id,
    auth.uid()
  );

  RETURN v_doc;
END;
$$;

REVOKE ALL ON FUNCTION public.review_student_document(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_student_document(uuid, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. The reviewer's worklist
--    One row per student for a requirement type, including the students who have
--    not submitted at all — which a plain select over student_documents cannot
--    express. Restricted to reviewers, and to an adviser's own sections.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_student_requirements(text);
CREATE FUNCTION public.get_student_requirements(p_document_type text DEFAULT 'PARENT_CLEARANCE_WAIVER')
RETURNS TABLE (
  document_id uuid,
  student_user_id uuid,
  student_name text,
  student_email text,
  course text,
  section text,
  company_name text,
  document_type text,
  file_name text,
  file_path text,
  file_type text,
  file_size bigint,
  status text,
  submitted_at timestamptz,
  reviewed_by uuid,
  reviewer_name text,
  reviewed_at timestamptz,
  reviewer_remarks text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT account_type INTO v_role
  FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;

  IF v_role NOT IN ('coordinator', 'admin', 'adviser') THEN
    RAISE EXCEPTION 'Not authorized to view student requirements';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    s.auth_user_id,
    COALESCE(NULLIF(trim(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')), ''), s.email),
    -- `profiles` has no student-number column; the school email is the identifier
    -- the rest of the system uses, so that is what the reviewer sees.
    s.email,
    s.course,
    s.section,
    c.name,
    COALESCE(d.document_type, p_document_type),
    d.file_name,
    d.file_path,
    d.file_type,
    d.file_size,
    COALESCE(d.status, 'not_submitted'),
    d.submitted_at,
    d.reviewed_by,
    NULLIF(trim(COALESCE(r.first_name, '') || ' ' || COALESCE(r.last_name, '')), ''),
    d.reviewed_at,
    d.reviewer_remarks
  FROM public.profiles s
  LEFT JOIN public.student_documents d
         ON d.user_id = s.auth_user_id AND d.document_type = p_document_type
  LEFT JOIN public.companies c ON c.id = s.company_id
  LEFT JOIN public.profiles r ON r.auth_user_id = d.reviewed_by
  WHERE s.account_type = 'student'
    AND s.auth_user_id IS NOT NULL
    AND (
      v_role IN ('coordinator', 'admin')
      OR s.section IN (
        SELECT section_name FROM public.get_adviser_assigned_section_names(auth.uid())
      )
    )
  ORDER BY
    CASE COALESCE(d.status, 'not_submitted')
      WHEN 'pending' THEN 0
      WHEN 'revision_required' THEN 1
      WHEN 'not_submitted' THEN 2
      ELSE 3
    END,
    d.submitted_at DESC NULLS LAST,
    s.last_name NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_requirements(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_requirements(text) TO authenticated;
