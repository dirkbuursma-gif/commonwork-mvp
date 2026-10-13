import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { validateIntelligenceReturnPath } from '../../../lib/auth-return-path';
import { logPilotFailure } from '../../../lib/observability';
import {
  clearPendingSignIn,
  normalizeCode,
  readPendingSignIn,
  signInPath,
  verifyEmailCode,
} from '../../../lib/email-code-auth';

export const POST: APIRoute = async (context) => {
  const formData = await context.request.formData();
  const returnPath = validateIntelligenceReturnPath(formData.get('return_to'));
  const pending = readPendingSignIn(context.cookies);
  if (!pending) return context.redirect(signInPath('/sign-in', 'expired', returnPath), 303);

  const code = normalizeCode(formData.get('code'));
  if (!code) return context.redirect(signInPath('/sign-in/code', 'invalid-format', returnPath), 303);

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return context.redirect(signInPath('/sign-in', 'configuration', returnPath), 303);

  const outcome = await verifyEmailCode(supabase, pending.email, code, (error) =>
    logPilotFailure('email_code_verify_failed', error, { action: 'email_code' }),
  );
  if (outcome === 'verified') {
    clearPendingSignIn(context.cookies);
    return context.redirect(returnPath ?? '/today', 303);
  }
  const status = outcome === 'invalid_code' ? 'invalid-code' : outcome === 'rate_limited' ? 'rate-limited' : 'unavailable';
  return context.redirect(signInPath('/sign-in/code', status, returnPath), 303);
};
