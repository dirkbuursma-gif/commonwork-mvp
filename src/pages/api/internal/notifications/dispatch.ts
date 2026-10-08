import { timingSafeEqual } from 'node:crypto';
import type { APIRoute } from 'astro';
import {
  createNotificationAdminClient,
  dispatchEmailBatch,
  resendSender,
} from '../../../../lib/notifications/email';

function isAuthorized(request: Request, secret: string): boolean {
  const authorization = request.headers.get('authorization') ?? '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const expectedBytes = Buffer.from(secret);
  const suppliedBytes = Buffer.from(supplied);
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

export const GET: APIRoute = async ({ request }) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return new Response('Notification dispatch is not configured.', { status: 503 });
  if (!isAuthorized(request, secret)) return new Response('Unauthorized.', { status: 401 });

  try {
    const admin = createNotificationAdminClient();
    const result = await dispatchEmailBatch({ admin, send: resendSender(), batchSize: 20 });
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return new Response('Notification dispatch failed.', { status: 500 });
  }
};