// The pending cookie is unsigned and client-controlled: a modified cookie can change the resend target
// and its send time. The resend cooldown only prevents ordinary accidental retries; it is not an
// abuse-prevention boundary. Supabase enforces the upstream rate limits, and the initial sign-in
// endpoint has no application-level cooldown.
export const PENDING_SIGN_IN_COOKIE = 'cw_signin_pending';
export const PENDING_SIGN_IN_MAX_AGE_SECONDS = 15 * 60;
export const RESEND_COOLDOWN_SECONDS = 60;

export type PendingSignIn = { email: string; sentAt: number };
export type EmailCodeRequestOutcome = 'sent' | 'rate_limited' | 'unavailable';
export type EmailCodeVerifyOutcome = 'verified' | 'invalid_code' | 'rate_limited' | 'unavailable';

type AuthErrorLike = { status?: unknown; code?: unknown } | null | undefined;
type AuthResult = { error: AuthErrorLike };
export type EmailCodeAuthClient = {
  auth: {
    signInWithOtp(credentials: {
      email: string;
      options: { shouldCreateUser: false; emailRedirectTo: string };
    }): PromiseLike<AuthResult>;
    verifyOtp(params: { email: string; token: string; type: 'email' }): PromiseLike<AuthResult>;
  };
};

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) return null;
  return email;
}

// Codes stay strings so leading zeros survive. Pasted spaces or hyphens are stripped; the exact length
// is left to Supabase's configured OTP length (8 on staging), so a 6-10 digit range is accepted.
export function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 32) return null;
  const code = value.replace(/[\s-]/g, '');
  return /^\d{6,10}$/.test(code) ? code : null;
}

export function encodePendingSignIn(pending: PendingSignIn): string {
  return Buffer.from(JSON.stringify(pending), 'utf8').toString('base64url');
}

export function decodePendingSignIn(value: unknown): PendingSignIn | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<PendingSignIn>;
    const email = normalizeEmail(parsed.email);
    if (!email || typeof parsed.sentAt !== 'number' || !Number.isFinite(parsed.sentAt)) return null;
    return { email, sentAt: parsed.sentAt };
  } catch {
    return null;
  }
}

export function resendSecondsRemaining(pending: PendingSignIn, now = Date.now()): number {
  const elapsed = Math.floor((now - pending.sentAt) / 1000);
  if (elapsed < 0) return RESEND_COOLDOWN_SECONDS;
  return Math.max(0, RESEND_COOLDOWN_SECONDS - elapsed);
}

function isRateLimited(error: NonNullable<AuthErrorLike>): boolean {
  return (
    error.status === 429 ||
    error.code === 'over_email_send_rate_limit' ||
    error.code === 'over_request_rate_limit' ||
    error.code === 'over_sms_send_rate_limit'
  );
}

function isClientError(error: NonNullable<AuthErrorLike>): boolean {
  return typeof error.status === 'number' && error.status >= 400 && error.status < 500;
}

export async function requestEmailCode(
  supabase: EmailCodeAuthClient,
  email: string,
  emailRedirectTo: string,
  onFailure?: (error: unknown) => void,
): Promise<EmailCodeRequestOutcome> {
  let error: AuthErrorLike;
  try {
    ({ error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo } }));
  } catch (thrown) {
    onFailure?.(thrown);
    return 'unavailable';
  }
  if (!error) return 'sent';
  if (isRateLimited(error)) return 'rate_limited';
  // Client errors such as "signups not allowed" must look like a normal send so account existence stays hidden.
  if (isClientError(error)) return 'sent';
  onFailure?.(error);
  return 'unavailable';
}

export async function verifyEmailCode(
  supabase: EmailCodeAuthClient,
  email: string,
  code: string,
  onFailure?: (error: unknown) => void,
): Promise<EmailCodeVerifyOutcome> {
  let error: AuthErrorLike;
  try {
    ({ error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' }));
  } catch (thrown) {
    onFailure?.(thrown);
    return 'unavailable';
  }
  if (!error) return 'verified';
  if (isRateLimited(error)) return 'rate_limited';
  if (isClientError(error)) return 'invalid_code';
  onFailure?.(error);
  return 'unavailable';
}

type CookieJar = {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options: Record<string, unknown>): void;
  delete(name: string, options: Record<string, unknown>): void;
};

export function readPendingSignIn(cookies: CookieJar): PendingSignIn | null {
  return decodePendingSignIn(cookies.get(PENDING_SIGN_IN_COOKIE)?.value);
}

export function writePendingSignIn(cookies: CookieJar, pending: PendingSignIn, requestUrl: string) {
  cookies.set(PENDING_SIGN_IN_COOKIE, encodePendingSignIn(pending), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(requestUrl).protocol === 'https:',
    maxAge: PENDING_SIGN_IN_MAX_AGE_SECONDS,
  });
}

export function clearPendingSignIn(cookies: CookieJar) {
  cookies.delete(PENDING_SIGN_IN_COOKIE, { path: '/' });
}

export function signInPath(path: '/sign-in' | '/sign-in/code', status: string, returnPath: string | null) {
  const params = new URLSearchParams({ status });
  if (returnPath) params.set('return_to', returnPath);
  return `${path}?${params.toString()}`;
}
