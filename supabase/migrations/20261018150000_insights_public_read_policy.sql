begin;

-- Anonymous readers must not invoke the restricted editor predicate.
-- Keep can_edit_insights() restricted to authenticated callers.
drop policy insight_articles_published_read on public.insight_articles;

create policy insight_articles_public_read
on public.insight_articles for select to anon
using (status = 'published');

create policy insight_articles_member_read
on public.insight_articles for select to authenticated
using (status = 'published' or public.can_edit_insights());

commit;
