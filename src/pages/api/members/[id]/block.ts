import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../../lib/supabase/server';

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return context.redirect('/sign-in', 303);
  if (user.isLocalTestUser) return context.redirect('/competence?status=preview-readonly', 303);
  const profileId = context.params.id ?? '';
  const origin = context.request.headers.get('origin');
  if (origin && origin !== new URL(context.request.url).origin) {
    return new Response('Cross-origin block action rejected.', { status: 403 });
  }

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return context.redirect('/sign-in?status=configuration', 303);
  const form = await context.request.formData();
  const shouldBlock = String(form.get('action') ?? '') === 'block';
  if (!shouldBlock && String(form.get('action') ?? '') !== 'unblock') {
    return context.redirect(`/profiles/${profileId}?status=block-action-unavailable`, 303);
  }
  const { error } = await supabase.rpc('block_member_from_introductions', {
    target_profile_id: profileId,
    should_block: shouldBlock,
  });
  return context.redirect(`/profiles/${profileId}?status=${error ? 'block-action-failed' : shouldBlock ? 'member-blocked' : 'member-unblocked'}`, 303);
};
