import { randomUUID } from 'node:crypto';

export type AuthCallbackBranch = 'code' | 'token_hash' | 'missing';
export type AuthCallbackOtpType = 'email' | 'magiclink' | 'invite' | 'invalid' | 'missing' | 'not_applicable';
export type AuthCallbackErrorCategory =
  | 'missing_parameters'
  | 'invalid_otp_type'
  | 'configuration_missing'
  | 'pkce_verifier_missing'
  | 'pkce_verifier_rejected'
  | 'flow_state_expired'
  | 'otp_expired'
  | 'invalid_token'
  | 'rate_limited'
  | 'auth_service_error'
  | 'auth_rejected'
  | 'auth_error'
  | 'unknown';

export type AuthCallbackDiagnostic = {
  event: 'auth_callback_diagnostic';
  request_id: string;
  branch: AuthCallbackBranch;
  otp_type: AuthCallbackOtpType;
  pkce_verifier_cookie_present: boolean;
  exchange_succeeded: boolean;
  error_category: AuthCallbackErrorCategory | null;
  session_cookie_write_attempted: boolean;
};

export type SessionCookieWrite = {
  name: string;
  value: string;
  options?: {
    maxAge?: number;
  };
};

const allowedOtpTypes = new Set(['email', 'magiclink', 'invite']);
const safeErrorCodes: Record<string, AuthCallbackErrorCategory> = {
  bad_code_verifier: 'pkce_verifier_rejected',
  flow_state_expired: 'flow_state_expired',
  invalid_grant: 'invalid_token',
  invalid_token: 'invalid_token',
  otp_expired: 'otp_expired',
};

export function getAuthCallbackInput(searchParams: URLSearchParams, cookieNames: readonly string[]) {
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const rawOtpType = searchParams.get('type');
  const branch: AuthCallbackBranch = code ? 'code' : tokenHash ? 'token_hash' : 'missing';
  const otpType: AuthCallbackOtpType =
    branch === 'code' && rawOtpType === null
      ? 'not_applicable'
      : rawOtpType === null
        ? 'missing'
        : allowedOtpTypes.has(rawOtpType)
          ? rawOtpType as 'email' | 'magiclink' | 'invite'
          : 'invalid';

  return {
    branch,
    otpType,
    code,
    tokenHash,
    pkceVerifierCookiePresent: cookieNames.some((name) =>
      /-auth-token(?:-flow-[A-Za-z0-9_-]{8,64})?-code-verifier$/.test(name),
    ),
  };
}

export function isAuthCallbackDiagnosticsEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (
    env.COMMONWORK_AUTH_CALLBACK_DIAGNOSTICS === 'enabled' &&
    env.VERCEL_ENV === 'preview' &&
    env.VERCEL_GIT_COMMIT_REF === 'build/pilot-hardening'
  );
}

export function isSessionAuthCookieName(name: string): boolean {
  return /-auth-token(?:\.\d+)?$/.test(name);
}

export function isSessionCookieWriteAttempt(cookies: readonly SessionCookieWrite[]): boolean {
  return cookies.some(
    ({ name, value, options }) =>
      isSessionAuthCookieName(name) && value !== '' && options?.maxAge !== 0,
  );
}

export function categorizeAuthCallbackError(error: unknown): AuthCallbackErrorCategory {
  if (!error || typeof error !== 'object') return 'unknown';

  const fields = error as { code?: unknown; name?: unknown; status?: unknown };
  if (
    typeof fields.code === 'string' &&
    Object.hasOwn(safeErrorCodes, fields.code)
  ) {
    return safeErrorCodes[fields.code];
  }
  if (fields.name === 'AuthPKCECodeVerifierMissingError') return 'pkce_verifier_missing';
  if (fields.name === 'AuthInvalidTokenResponseError') return 'invalid_token';
  if (fields.status === 429) return 'rate_limited';
  if (typeof fields.status === 'number' && fields.status >= 500) return 'auth_service_error';
  if (fields.name === 'AuthApiError') return 'auth_rejected';
  if (fields.name === 'AuthError') return 'auth_error';
  return 'unknown';
}

export function logAuthCallbackDiagnostic(
  enabled: boolean,
  input: Omit<AuthCallbackDiagnostic, 'event' | 'request_id'>,
  writeLog: (message: string) => void = (message) => console.info(message),
): void {
  if (!enabled) return;

  try {
    const diagnostic: AuthCallbackDiagnostic = {
      event: 'auth_callback_diagnostic',
      request_id: randomUUID(),
      ...input,
    };
    writeLog(JSON.stringify(diagnostic));
  } catch {
    // Observation must never change the callback outcome.
  }
}
