import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return context.redirect('/sign-in', 303);
  if (user.isLocalTestUser) return context.redirect('/find?status=preview-readonly', 303);

  if (context.request.headers.get('origin') !== new URL(context.request.url).origin) {
    return new Response('Cross-origin form submission rejected.', { status: 403 });
  }

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return context.redirect('/sign-in?status=configuration', 303);

  const form = await context.request.formData();
  const action = String(form.get('action') ?? '');
  const status = action === 'save' ? 'saved' : action === 'dismiss' ? 'dismissed' : null;
  if (!status) return context.redirect('/find?status=invalid', 303);

  const { data: match, error } = await supabase
    .from('matches')
    .update({ status })
    .eq('id', context.params.id ?? '')
    .select('id, need_id')
    .maybeSingle();

  if (error || !match) return context.redirect('/find?status=match-unavailable', 303);
  return context.redirect(`/find/${match.need_id}?status=${status}`, 303);
};
