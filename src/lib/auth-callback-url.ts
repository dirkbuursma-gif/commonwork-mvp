type AuthCallbackUrlOptions = {
  appBaseUrl?: string;
  isDevelopment?: boolean;
};

const localHosts = new Set(['localhost', '127.0.0.1']);

export function getAuthCallbackUrl(requestUrl: string, options: AuthCallbackUrlOptions = {}): string | null {
  let baseUrl = options.appBaseUrl;
  try {
    const request = new URL(requestUrl);
    if (options.isDevelopment && localHosts.has(request.hostname)) baseUrl = request.origin;
    if (!baseUrl) return null;

    const configured = new URL(baseUrl);
    if (configured.protocol !== 'https:' && !localHosts.has(configured.hostname)) return null;
    return new URL('/auth/callback', configured.origin).toString();
  } catch {
    return null;
  }
}
