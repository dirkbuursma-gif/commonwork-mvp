import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { renderTransactionalEmail, type EmailPurpose } from './templates';

export interface EmailDelivery {
  delivery_id: string;
  idempotency_key: string;
  notification_type: string;
  email_purpose: EmailPurpose;
  recipient_profile_id: string | null;
  introduction_id: string | null;
  privacy_request_id: string | null;
  report_id: string | null;
  attempt_count: number;
  template_version: string;
}

export interface DispatchResult {
  claimed: number;
  sent: number;
  suppressed: number;
  failed: number;
}

type AdminClient = ReturnType<typeof createNotificationAdminClient>;
type RpcResult<T> = { data: T | null; error: { code?: string; status?: number } | null };
type SendEmail = (input: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
}) => Promise<{ id: string | null; error: { statusCode?: number } | null }>;

function rpc<T>(admin: AdminClient, name: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  const client = admin as unknown as {
    rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<RpcResult<T>>;
  };
  return client.rpc(name, args);
}

export function createNotificationAdminClient(env: NodeJS.ProcessEnv = process.env) {
  const url = env.SUPABASE_URL ?? env.PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Notification service configuration is missing.');
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

function failureFor(error: unknown): { code: string; retryable: boolean; summary: string } {
  const statusCode = error && typeof error === 'object' && 'statusCode' in error
    ? Number((error as { statusCode?: unknown }).statusCode)
    : 0;
  if (statusCode === 429) return { code: 'provider_rate_limited', retryable: true, summary: 'Email provider rate limited the request.' };
  if (statusCode >= 500) return { code: 'provider_unavailable', retryable: true, summary: 'Email provider is temporarily unavailable.' };
  if (statusCode > 0) return { code: 'provider_rejected', retryable: false, summary: 'Email provider rejected the request.' };
  return { code: 'provider_request_failed', retryable: true, summary: 'Email provider request failed.' };
}

async function lookupRecipientEmail(admin: AdminClient, profileId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(profileId);
  if (error) return null;
  return data.user?.email?.trim().toLowerCase() ?? null;
}

function isExampleRecipient(email: string): boolean {
  return email.toLowerCase().endsWith('@example.test');
}

export async function dispatchEmailBatch(input: {
  admin: AdminClient;
  send: SendEmail;
  resolveRecipientEmail?: (profileId: string) => Promise<string | null>;
  env?: NodeJS.ProcessEnv;
  batchSize?: number;
}): Promise<DispatchResult> {
  const env = input.env ?? process.env;
  const { data: deliveries, error: claimError } = await rpc<EmailDelivery[]>(input.admin, 'claim_email_deliveries', {
    target_batch_size: input.batchSize ?? 20,
  });
  if (claimError) throw new Error('Could not claim notification deliveries.');

  const result: DispatchResult = {
    claimed: deliveries?.length ?? 0,
    sent: 0,
    suppressed: 0,
    failed: 0,
  };

  for (const delivery of (deliveries ?? []) as EmailDelivery[]) {
    const profileId = delivery.recipient_profile_id;
    if (!profileId) {
      await rpc(input.admin, 'fail_email_delivery', {
        target_delivery_id: delivery.delivery_id,
        target_failure_code: 'recipient_profile_missing',
        target_error_summary: 'Recipient profile is unavailable.',
        target_retryable: false,
      });
      result.failed += 1;
      continue;
    }

    const email = await (input.resolveRecipientEmail ?? ((id) => lookupRecipientEmail(input.admin, id)))(profileId);
    if (!email) {
      await rpc(input.admin, 'fail_email_delivery', {
        target_delivery_id: delivery.delivery_id,
        target_failure_code: 'recipient_email_unavailable',
        target_error_summary: 'Recipient email is unavailable.',
        target_retryable: false,
      });
      result.failed += 1;
      continue;
    }

    const exampleRecipient = isExampleRecipient(email);
    const suppressionReason = env.SEED_EMAIL_MODE === 'suppress'
      ? 'seed_email_mode'
      : exampleRecipient
        ? 'example_test_recipient'
        : null;
    if (suppressionReason) {
      const { data: suppressed, error } = await rpc<boolean>(input.admin, 'suppress_email_delivery', {
        target_delivery_id: delivery.delivery_id,
        target_reason: suppressionReason,
      });
      if (error || !suppressed) result.failed += 1;
      else result.suppressed += 1;
      continue;
    }

    const apiKey = env.RESEND_API_KEY;
    const senderAddress = env.EMAIL_FROM_ADDRESS;
    const senderName = env.EMAIL_FROM_NAME ?? 'Commonwork';
    const appBaseUrl = env.APP_BASE_URL;
    if (!apiKey || !senderAddress || !appBaseUrl) {
      await rpc(input.admin, 'fail_email_delivery', {
        target_delivery_id: delivery.delivery_id,
        target_failure_code: 'email_configuration_missing',
        target_error_summary: 'Transactional email configuration is incomplete.',
        target_retryable: false,
      });
      result.failed += 1;
      continue;
    }

    try {
      const template = renderTransactionalEmail({
        purpose: delivery.email_purpose,
        appBaseUrl,
        introductionId: delivery.introduction_id,
        privacyRequestId: delivery.privacy_request_id,
        reportId: delivery.report_id,
      });
      const sent = await input.send({
        from: `${senderName} <${senderAddress}>`,
        to: email,
        subject: template.subject,
        html: template.html,
        text: template.text,
        idempotencyKey: delivery.idempotency_key,
      });
      if (sent.error || !sent.id) {
        const failure = failureFor(sent.error);
        await rpc(input.admin, 'fail_email_delivery', {
          target_delivery_id: delivery.delivery_id,
          target_failure_code: failure.code,
          target_error_summary: failure.summary,
          target_retryable: failure.retryable,
        });
        result.failed += 1;
        continue;
      }

      const { data: completed, error: completeError } = await rpc<boolean>(input.admin, 'complete_email_delivery', {
        target_delivery_id: delivery.delivery_id,
        target_provider_message_id: sent.id,
      });
      if (completeError || !completed) result.failed += 1;
      else result.sent += 1;
    } catch {
      await rpc(input.admin, 'fail_email_delivery', {
        target_delivery_id: delivery.delivery_id,
        target_failure_code: 'notification_dispatch_failed',
        target_error_summary: 'Notification processing failed.',
        target_retryable: true,
      });
      result.failed += 1;
    }
  }
  return result;
}

export function resendSender(env: NodeJS.ProcessEnv = process.env): SendEmail {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Resend configuration is missing.');
  const resend = new Resend(apiKey);
  return async ({ from, to, subject, html, text, idempotencyKey }) => {
    const { data, error } = await resend.emails.send({ from, to, subject, html, text }, {
      idempotencyKey,
    });
    return { id: data?.id ?? null, error: error ? { statusCode: error.statusCode ?? undefined } : null };
  };
}

export function safeWebhookFailureCode(eventType: string): string | null {
  if (eventType === 'email.bounced') return 'provider_bounced';
  if (eventType === 'email.complained') return 'provider_complaint';
  if (eventType === 'email.failed') return 'provider_failed';
  return null;
}