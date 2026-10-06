import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { createNotificationAdminClient } from '../../../lib/notifications/email';

type ProviderEvent = {
  type: string;
  created_at?: string;
  data?: { email_id?: string };
};

function rpc<T>(admin: ReturnType<typeof createNotificationAdminClient>, name: string, args: Record<string, unknown>) {
  const client = admin as unknown as {
    rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<{ data: T | null; error: unknown }>;
  };
  return client.rpc(name, args);
}

function safeFailureCode(type: string): string | null {
  if (type === 'email.bounced') return 'provider_bounced';
  if (type === 'email.complained') return 'provider_complaint';
  if (type === 'email.failed') return 'provider_failed';
  return null;
}

export const POST: APIRoute = async ({ request }) => {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!webhookSecret || !resendApiKey) {
    return new Response('Webhook is not configured.', { status: 503 });
  }
  const payload = await request.text();
  if (payload.length > 64_000) return new Response('Payload too large.', { status: 413 });

  let event: ProviderEvent;
  try {
    event = new Resend(resendApiKey).webhooks.verify({
      payload,
      headers: {
        id: request.headers.get('svix-id') ?? '',
        timestamp: request.headers.get('svix-timestamp') ?? '',
        signature: request.headers.get('svix-signature') ?? '',
      },
      webhookSecret,
    }) as ProviderEvent;
  } catch {
    return new Response('Invalid webhook signature.', { status: 400 });
  }

  if (!event.type || !event.data?.email_id) return new Response('Invalid webhook event.', { status: 400 });
  const providerEventId = request.headers.get('svix-id');
  if (!providerEventId) return new Response('Missing provider event ID.', { status: 400 });

  try {
    const admin = createNotificationAdminClient();
    const { data: recorded, error } = await rpc<boolean>(admin, 'record_resend_email_event', {
      target_provider_event_id: providerEventId,
      target_provider_message_id: event.data.email_id,
      target_event_type: event.type,
      target_occurred_at: event.created_at ? new Date(event.created_at).toISOString() : null,
      target_failure_code: safeFailureCode(event.type),
    });
    if (error) return new Response('Webhook event could not be recorded.', { status: 500 });
    return Response.json({ accepted: recorded ?? false }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return new Response('Webhook event could not be recorded.', { status: 500 });
  }
};