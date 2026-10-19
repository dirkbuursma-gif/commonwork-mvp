begin;

-- Preserve the view's author-only contract in RLS without requiring the caller
-- to SELECT the unexposed created_by column. Membership remains separately required.
CREATE POLICY match_feedback_author_required
ON public.match_feedback AS RESTRICTIVE FOR SELECT TO authenticated
USING (created_by = (SELECT auth.uid()));

CREATE OR REPLACE VIEW public.member_match_feedback
WITH (security_barrier = true, security_invoker = true) AS
SELECT f.id, f.match_id, f.feedback_type, f.note, f.created_at
FROM public.match_feedback f;

-- No column grants are expanded; both author and workspace RLS still apply.
commit;
