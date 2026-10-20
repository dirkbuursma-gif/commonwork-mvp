/** Server-only video configuration. Never import into browser code. */
import type { DeliveryConfiguration } from './object-delivery';

export type VideoConfigurationInput = {
  publicUrl: string | undefined;
  privateKey: string | undefined;
  development: boolean;
  server: boolean;
};

export function validateVideoDeliveryConfiguration(input: VideoConfigurationInput): DeliveryConfiguration {
  if (!input.server) throw new Error('Server configuration required.');
  let url: URL;
  try { url = new URL(input.publicUrl ?? ''); } catch { throw new Error('Invalid delivery configuration.'); }
  const local = input.development && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if ((!local && (url.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname))) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid delivery configuration.');
  const key = input.privateKey ?? '';
  if (!key.startsWith('sb_secret_')) {
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')); } catch { throw new Error('Private delivery credential required.'); }
    if (!claims || claims.role !== 'service_role' || (claims.exp && claims.exp * 1000 <= Date.now()) ||
        (!local && claims.ref !== url.hostname.split('.')[0])) throw new Error('Private delivery credential required.');
  }
  if (!key || /[\r\n]/.test(key)) throw new Error('Private delivery credential required.');
  return { origin: url.origin, key };
}

export function readVideoDeliveryConfiguration(): DeliveryConfiguration {
  return validateVideoDeliveryConfiguration({
    publicUrl: import.meta.env.PUBLIC_SUPABASE_URL,
    privateKey: process.env.COMMONWORK_VIDEO_SECRET_KEY,
    development: Boolean(import.meta.env.DEV),
    server: typeof window === 'undefined',
  });
}
