import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { insightArticleSlugs } from '../../../lib/insights-provenance';

function editorRedirect(context: Parameters<APIRoute>[0], status: string) {
  return context.redirect(`/insights/editor?status=${status}`, 303);
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user || user.isLocalTestUser) return new Response('Authentication required.', { status: 401 });

  const origin = context.request.headers.get('origin');
  if (origin !== new URL(context.request.url).origin) {
    return new Response('Cross-origin form submission rejected.', { status: 403 });
  }

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return new Response('Insights editorial tools are not configured.', { status: 503 });

  const { data: allowed } = await supabase.rpc('can_edit_insights');
  if (allowed !== true) return new Response('Insights editor access required.', { status: 403 });

  const form = await context.request.formData();
  const action = String(form.get('action') ?? '');
  const id = String(form.get('id') ?? '');

  if (action === 'save') {
    const slug = String(form.get('slug') ?? '').trim();
    if (!slug || insightArticleSlugs.includes(slug)) return editorRedirect(context, 'reserved-slug');

    const article = {
      slug,
      title: String(form.get('title') ?? '').trim(),
      deck: String(form.get('deck') ?? '').trim(),
      summary: String(form.get('summary') ?? '').trim(),
      body: String(form.get('body') ?? '').trim(),
      desk: String(form.get('desk') ?? ''),
      format: String(form.get('format') ?? ''),
      linked_product_slug: String(form.get('linked_product_slug') ?? '').trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (!article.slug || !article.title) return editorRedirect(context, 'invalid');

    const result = id
      ? await supabase
          .from('insight_articles')
          .update({ ...article, status: 'draft', published_at: null })
          .eq('id', id)
      : await supabase
          .from('insight_articles')
          .insert({ ...article, author_profile_id: user.id });
    return editorRedirect(context, result.error ? 'save-failed' : 'saved');
  }

  if ((action === 'publish' || action === 'unpublish') && id) {
    const publishing = action === 'publish';
    const { error } = await supabase
      .from('insight_articles')
      .update({
        status: publishing ? 'published' : 'draft',
        published_at: publishing ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    return editorRedirect(context, error ? 'status-failed' : publishing ? 'published' : 'unpublished');
  }

  return new Response('Unsupported editorial action.', { status: 400 });
};
