import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { validateIntelligenceReturnPath } from '../../../lib/auth-return-path';
import { logPilotFailure } from '../../../lib/observability';

function signInRedirect(context: Parameters<APIRoute>[0], status: string, returnPath: string | null) {
  const url = new URL('/sign-in', context.request.url);
  url.searchParams.set('status', status);
  if (returnPath) url.searchParams.set('return_to', returnPath);
  return context.redirect(`${url.pathname}${url.search}`, 303);
}

export const POST: APIRoute = async (context) => {
  const formData = await context.request.formData();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const returnPath = validateIntelligenceReturnPath(formData.get('return_to'));

  if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
    return signInRedirect(context, 'invalid', returnPath);
  }

  const supabase = createSupabaseServerClient(context);
  if (!supabase) {
    return signInRedirect(context, 'configuration', returnPath);
  }

  const callbackUrl = new URL('/auth/callback', context.request.url);
  if (returnPath) callbackUrl.searchParams.set('return_to', returnPath);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) logPilotFailure('magic_link_send_failed', error, { action: 'magic_link' });
  return signInRedirect(context, error ? 'unavailable' : 'sent', returnPath);
};
