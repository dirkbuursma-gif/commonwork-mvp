import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { isValidUsername, MEMBER_AVATARS, normalizeUsername, saveMyIdentity } from '../../lib/member-identity';

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user || user.isLocalTestUser) return context.redirect('/sign-in', 303);
  const origin = context.request.headers.get('origin');
  if (origin && origin !== new URL(context.request.url).origin) {
    return new Response('Cross-origin identity update rejected.', { status: 403 });
  }
  const client = createSupabaseServerClient(context);
  if (!client) return context.redirect('/sign-in?status=configuration', 303);

  const form = await context.request.formData();
  const displayName = String(form.get('display_name') ?? '').trim();
  const avatarId = String(form.get('avatar_id') ?? 'initials');
  const usernameInput = String(form.get('username') ?? '').trim();
  const username = usernameInput ? normalizeUsername(usernameInput) : null;
  const target = '/profiles/me';
  if (!displayName || displayName.length > 120 || !MEMBER_AVATARS.some((avatar) => avatar.id === avatarId)) {
    return context.redirect(`${target}?status=identity-invalid#identity`, 303);
  }
  if (username && !isValidUsername(username)) {
    return context.redirect(`${target}?status=username-invalid#identity`, 303);
  }

  try {
    const saved = await saveMyIdentity(client, {
      displayName,
      avatarId: avatarId as (typeof MEMBER_AVATARS)[number]['id'],
      username,
    });
    return context.redirect(`${target}?status=${saved ? 'identity-saved' : 'identity-save-failed'}#identity`, 303);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    const status = code === '23505'
      ? 'username-unavailable'
      : code === '22023' || code === '23514'
        ? 'identity-invalid'
        : 'identity-save-failed';
    return context.redirect(`${target}?status=${status}#identity`, 303);
  }
};