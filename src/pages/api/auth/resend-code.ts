import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { validateIntelligenceReturnPath } from '../../../lib/auth-return-path';
import { logPilotFailure } from '../../../lib/observability';
import {
  readPendingSignIn,
  requestEmailCode,
  resendSecondsRemaining,
  signInPath,
  writePendingSignIn,
} from '../../../lib/email-code-auth';

export const POST: APIRoute = async (context) => {
  const formData = await context.request.formData();
  const returnPath = validateIntelligenceReturnPath(formData.get('return_to'));
  const pending = readPendingSignIn(context.cookies);
  if (!pending) return context.redirect(signInPath('/sign-in', 'expired', returnPath), 303);
  // UX guard against accidental double requests only; the cookie is client-controlled (see email-code-auth.ts).
  if (resendSecondsRemaining(pending) > 0) {
    return context.redirect(signInPath('/sign-in/code', 'wait', returnPath), 303);
  }

  const supabase = createSupabaseServerClient(context);
  if (!supabase) return context.redirect(signInPath('/sign-in', 'configuration', returnPath), 303);

  const outcome = await requestEmailCode(supabase, pending.email, (error) =>
    logPilotFailure('email_code_send_failed', error, { action: 'email_code' }),
  );
  if (outcome === 'unavailable') return context.redirect(signInPath('/sign-in/code', 'unavailable', returnPath), 303);

  // A rate-limited attempt also restarts the cooldown so the page never invites an immediate repeat.
  writePendingSignIn(context.cookies, { email: pending.email, sentAt: Date.now() }, context.request.url);
  return context.redirect(
    signInPath('/sign-in/code', outcome === 'rate_limited' ? 'rate-limited' : 'sent', returnPath),
    303,
  );
};
