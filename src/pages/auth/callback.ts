import type { APIRoute } from 'astro';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { validateIntelligenceReturnPath } from '../../lib/auth-return-path';

const allowedOtpTypes: EmailOtpType[] = ['email', 'magiclink'];

export const GET: APIRoute = async (context) => {
  const supabase = createSupabaseServerClient(context);
  if (!supabase) {
    return context.redirect('/sign-in?status=configuration', 303);
  }

  const { searchParams } = new URL(context.request.url);
  const returnPath = validateIntelligenceReturnPath(searchParams.get('return_to'));
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const otpType = searchParams.get('type') as EmailOtpType | null;

  let error: Error | null = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && otpType && allowedOtpTypes.includes(otpType)) {
    ({ error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    }));
  } else {
    return context.redirect('/sign-in?status=invalid-link', 303);
  }

  const destination = error ? new URL('/sign-in', context.request.url) : null;
  if (destination) {
    destination.searchParams.set('status', 'invalid-link');
    if (returnPath) destination.searchParams.set('return_to', returnPath);
    return context.redirect(`${destination.pathname}${destination.search}`, 303);
  }
  return context.redirect(returnPath ?? '/today', 303);
};
