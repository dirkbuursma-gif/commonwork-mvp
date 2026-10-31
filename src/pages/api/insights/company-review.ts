import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user || user.isLocalTestUser) return new Response('Authentication required.', { status: 401 });
  if (context.request.headers.get('origin') !== new URL(context.request.url).origin) return new Response('Cross-origin form submission rejected.', { status: 403 });
  const client = createSupabaseServerClient(context);
  if (!client) return new Response('Insights editorial tools are not configured.', { status: 503 });
  const form = await context.request.formData();
  const articleId = String(form.get('article_id') ?? '');
  const action = String(form.get('action') ?? '');
  const feedback = String(form.get('feedback') ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(articleId) || !['approve', 'reject'].includes(action) || feedback.length > 1200 || (action === 'reject' && feedback.length < 8)) return context.redirect('/insights/editor?status=review-invalid', 303);
  const { error } = await client.rpc('review_company_first_publication', { target_article_id: articleId, target_action: action, target_feedback: feedback });
  return context.redirect(`/insights/editor?status=${error ? 'review-failed' : action === 'approve' ? 'review-approved' : 'review-rejected'}`, 303);
};

export const GET: APIRoute = () => new Response('Method not allowed.', { status: 405, headers: { Allow: 'POST' } });