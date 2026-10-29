import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase/server';

export const prerender = false;
const redirect = (context: Parameters<APIRoute>[0], status: string) => context.redirect(`/company/publishing?status=${status}`, 303);

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user || user.isLocalTestUser) return new Response('Authentication required.', { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
  if (context.request.headers.get('origin') !== new URL(context.request.url).origin) return new Response('Cross-origin form submission rejected.', { status: 403 });
  const client = createSupabaseServerClient(context);
  if (!client) return new Response('Company publishing is not configured.', { status: 503 });

  const form = await context.request.formData();
  const action = String(form.get('action') ?? '');
  const articleId = String(form.get('article_id') ?? '') || null;
  if (action === 'publish' || action === 'withdraw') {
    if (!articleId || !/^[0-9a-f-]{36}$/i.test(articleId)) return redirect(context, 'invalid');
    const { data, error } = await client.rpc(action === 'publish' ? 'publish_company_content' : 'withdraw_company_content', { target_article_id: articleId });
    if (error) return redirect(context, 'action-failed');
    if (action === 'publish' && data === 'review_required') return redirect(context, 'review-required');
    return redirect(context, action === 'publish' ? 'published' : 'withdrawn');
  }
  if (action !== 'save') return new Response('Unsupported company publishing action.', { status: 400 });

  const [providerId = '', rawProductId = ''] = String(form.get('scope') ?? '').split(':');
  const productId = rawProductId || null;
  const contentType = String(form.get('content_type') ?? '');
  const slug = String(form.get('slug') ?? '').trim();
  const title = String(form.get('title') ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(providerId) || (productId && !/^[0-9a-f-]{36}$/i.test(productId))) return redirect(context, 'invalid');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !title || !['company_insight', 'company_update'].includes(contentType)) return redirect(context, 'invalid');
  const { data, error } = await client.rpc('save_company_content', {
    target_article_id: articleId,
    target_slug: slug,
    target_title: title,
    target_deck: String(form.get('deck') ?? '').trim(),
    target_summary: String(form.get('summary') ?? '').trim(),
    target_body: String(form.get('body') ?? '').trim(),
    target_desk: String(form.get('desk') ?? 'Ecosystem'),
    target_format: String(form.get('format') ?? 'Brief'),
    target_content_type: contentType,
    target_provider_id: providerId,
    target_product_id: productId,
  });
  if (error || !data) return redirect(context, 'save-failed');
  return context.redirect(`/company/publishing?status=saved&edit=${encodeURIComponent(data)}`, 303);
};

export const GET: APIRoute = () => new Response('Method not allowed.', { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'private, no-store' } });