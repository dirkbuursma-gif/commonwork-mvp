import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user || user.isLocalTestUser) return new Response('Authentication required.', { status: 401 });

  const origin = context.request.headers.get('origin');
  if (origin !== new URL(context.request.url).origin) {
    return new Response('Cross-origin form submission rejected.', { status: 403 });
  }

  const form = await context.request.formData();
  const productId = String(form.get('product_id') ?? '');
  const slug = String(form.get('slug') ?? '');
  const roleTitle = String(form.get('role_title') ?? '').trim();
  if (!productId || !slug) return new Response('A product reference is required.', { status: 400 });

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return new Response('Product affiliations are not configured.', { status: 503 });
  const { error } = await supabase.from('profile_product_affiliations').insert({
    profile_id: user.id,
    provider_product_id: productId,
    role_title: roleTitle,
    consent_given: true,
    consented_at: new Date().toISOString(),
    verification_status: 'self_declared',
  });

  const target = new URL(`/intelligence/product/${slug}`, context.request.url);
  target.searchParams.set('affiliation', error ? 'failed' : 'declared');
  return context.redirect(target.pathname + target.search, 303);
};
