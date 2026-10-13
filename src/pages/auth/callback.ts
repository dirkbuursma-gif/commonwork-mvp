import type { APIRoute } from 'astro';
import { parseCookieHeader } from '@supabase/ssr';
import {
  categorizeAuthCallbackError,
  getAuthCallbackInput,
  isAuthCallbackDiagnosticsEnabled,
  logAuthCallbackDiagnostic,
} from '../../lib/auth-callback-diagnostics';
import { createSupabaseServerClient } from '../../lib/supabase/server';
import { validateIntelligenceReturnPath } from '../../lib/auth-return-path';

export const GET: APIRoute = async (context) => {
  const { searchParams } = new URL(context.request.url);
  const cookieNames = parseCookieHeader(context.request.headers.get('cookie') ?? '').map(({ name }) => name);
  const callbackInput = getAuthCallbackInput(searchParams, cookieNames);
  const diagnosticsEnabled = isAuthCallbackDiagnosticsEnabled();
  let sessionCookieWriteAttempted = false;
  const recordDiagnostic = (
    exchangeSucceeded: boolean,
    errorCategory: Parameters<typeof logAuthCallbackDiagnostic>[1]['error_category'],
  ) => {
    if (!diagnosticsEnabled) return;
    logAuthCallbackDiagnostic(diagnosticsEnabled, {
      branch: callbackInput.branch,
      otp_type: callbackInput.otpType,
      pkce_verifier_cookie_present: callbackInput.pkceVerifierCookiePresent,
      exchange_succeeded: exchangeSucceeded,
      error_category: errorCategory,
      session_cookie_write_attempted: sessionCookieWriteAttempted,
    });
  };

  const returnPath = validateIntelligenceReturnPath(searchParams.get('return_to'));
  const supabase = createSupabaseServerClient(context, {
    onSessionCookieWriteAttempt: () => {
      sessionCookieWriteAttempted = true;
    },
  });
  if (!supabase) {
    recordDiagnostic(false, 'configuration_missing');
    return context.redirect('/sign-in?status=configuration', 303);
  }

  if (callbackInput.branch === 'missing') {
    recordDiagnostic(false, 'missing_parameters');
    return context.redirect('/sign-in?status=invalid-link', 303);
  }
  if (
    callbackInput.branch === 'token_hash' &&
    callbackInput.otpType !== 'email' &&
    callbackInput.otpType !== 'magiclink'
  ) {
    recordDiagnostic(false, callbackInput.otpType === 'invalid' ? 'invalid_otp_type' : 'missing_parameters');
    return context.redirect('/sign-in?status=invalid-link', 303);
  }

  let error: unknown = null;
  try {
    if (callbackInput.branch === 'code') {
      const code = callbackInput.code;
      if (!code) {
        recordDiagnostic(false, 'missing_parameters');
        return context.redirect('/sign-in?status=invalid-link', 303);
      }
      ({ error } = await supabase.auth.exchangeCodeForSession(code));
    } else {
      const tokenHash = callbackInput.tokenHash;
      if (!tokenHash) {
        recordDiagnostic(false, 'missing_parameters');
        return context.redirect('/sign-in?status=invalid-link', 303);
      }
      ({ error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: callbackInput.otpType,
      }));
    }
  } catch (authError) {
    error = authError;
  }

  recordDiagnostic(!error, error ? categorizeAuthCallbackError(error) : null);
  const destination = error ? new URL('/sign-in', context.request.url) : null;
  if (destination) {
    destination.searchParams.set('status', 'invalid-link');
    if (returnPath) destination.searchParams.set('return_to', returnPath);
    return context.redirect(`${destination.pathname}${destination.search}`, 303);
  }
  return context.redirect(returnPath ?? '/today', 303);
};
