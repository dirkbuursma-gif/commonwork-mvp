import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

export const POST: APIRoute = async (context) => {
  const formData = await context.request.formData();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();

  if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
    return context.redirect('/sign-in?status=invalid', 303);
  }

  const supabase = createSupabaseServerClient(context);
  if (!supabase) {
    return context.redirect('/sign-in?status=configuration', 303);
  }

  const callbackUrl = new URL('/auth/callback', context.request.url).toString();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: callbackUrl,
    },
  });

  return context.redirect(
    error ? '/sign-in?status=unavailable' : '/sign-in?status=sent',
    303,
  );
};
