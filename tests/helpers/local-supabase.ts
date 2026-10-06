import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { dispatchEmailBatch, type DispatchResult } from '../../src/lib/notifications/email';

type LocalConfig = {
  apiUrl: string;
  anonKey: string;
  serviceRoleKey: string;
};

type SessionCookie = {
  name: string;
  value: string;
  url: string;
  path: string;
  httpOnly: true;
  secure: boolean;
  sameSite: 'Lax';
};

export interface LocalMember {
  id: string;
  email: string;
  client: SupabaseClient<any, 'public', any, any, any>;
  cookies: SessionCookie[];
  provisionConnector: (capacity?: number) => Promise<void>;
  provisionAdministrator: () => Promise<void>;
  runConnectorAdminCli: (arguments_: string[], environment?: string) => string;
  runPilotOperationsCli: (arguments_: string[], environment?: string) => string;
  enqueueTestNotification: (type: string) => Promise<string>;
  getTestEmailDelivery: (notificationId: string) => Promise<Record<string, unknown> | null>;
  getTestEmailDeliveryByIdempotencyKey: (key: string) => Promise<Record<string, unknown> | null>;
  getTestEmailDeliveriesForEntity: (
    entityColumn: 'privacy_request_id' | 'report_id',
    entityId: string,
  ) => Promise<Array<Record<string, unknown>>>;
  dispatchTestEmailBatch: (
    send: Parameters<typeof dispatchEmailBatch>[0]['send'],
    environment?: NodeJS.ProcessEnv,
    resolveRecipientEmail?: (profileId: string) => Promise<string | null>,
  ) => Promise<DispatchResult>;
  setTestDeliveryProviderMessageId: (notificationId: string, messageId: string, status: 'sent' | 'suppressed') => Promise<void>;
  recordTestProviderEvent: (providerEventId: string, providerMessageId: string, eventType: string) => Promise<boolean>;
  getTestEmailEventCount: (providerMessageId: string) => Promise<number>;
  deleteTestProfile: () => Promise<void>;
  makeTestEmailRetryDue: (notificationId: string) => Promise<void>;
  connectorCapacity: () => Promise<number | null>;
  expireIntroduction: (introductionId: string) => Promise<void>;
  setIntroductionRetryAfter: (introductionId: string, recipientProfileId: string, retryAfter: string) => Promise<void>;
  remove: () => Promise<void>;
}

function readLocalConfig(): LocalConfig {
  const output = execFileSync('npx', ['supabase', 'status', '-o', 'env'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const values: Record<string, string> = {};

  for (const line of output.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const rawValue = line.slice(separator + 1).trim();
    if (!/^[A-Z_]+$/.test(key)) continue;
    values[key] = rawValue.startsWith('"') ? JSON.parse(rawValue) as string : rawValue;
  }

  const apiUrl = values.API_URL;
  const anonKey = values.ANON_KEY;
  const serviceRoleKey = values.SERVICE_ROLE_KEY;
  if (!apiUrl || !anonKey || !serviceRoleKey) {
    throw new Error('Local Supabase status did not provide the required test credentials.');
  }

  return { apiUrl, anonKey, serviceRoleKey };
}

export async function createLocalMember(displayName: string): Promise<LocalMember> {
  const config = readLocalConfig();
  const admin = createClient(config.apiUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const email = `commonwork-${randomUUID()}@example.test`;
  const password = `Cw-${randomUUID()}-Aa9!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: displayName },
  });
  if (error || !data.user) throw error ?? new Error('Local Supabase did not create a test member.');

  const memberClient = createClient(config.apiUrl, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signedIn, error: signInError } = await memberClient.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw signInError ?? new Error('Local test member could not sign in.');
  }

  let sessionCookies: Array<{ name: string; value: string; options?: { path?: string } }> = [];
  const cookieClient = createServerClient(config.apiUrl, config.anonKey, {
    cookies: {
      getAll: () => sessionCookies.map(({ name, value }) => ({ name, value })),
      setAll: (cookies) => {
        sessionCookies = cookies;
      },
    },
  });
  const { error: sessionError } = await cookieClient.auth.setSession({
    access_token: signedIn.session.access_token,
    refresh_token: signedIn.session.refresh_token,
  });
  if (sessionError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw sessionError;
  }

  const cookies: SessionCookie[] = sessionCookies
    .filter(({ value }) => value.length > 0)
    .map(({ name, value, options }) => ({
      name,
      value,
      url: 'http://127.0.0.1:4322',
      path: options?.path ?? '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    }));

  return {
    id: data.user.id,
    email,
    client: memberClient,
    cookies,
    provisionConnector: async (capacity = 2) => {
      const { error: connectorError } = await admin.from('connectors').insert({
        profile_id: data.user.id,
        status: 'active',
        introduction_capacity: capacity,
        approved_at: new Date().toISOString(),
      });
      if (connectorError) throw connectorError;
    },
    provisionAdministrator: async () => {
      const { error: adminError } = await admin.from('commonwork_administrators').insert({
        profile_id: data.user.id,
        status: 'active',
      });
      if (adminError) throw adminError;
    },
    runConnectorAdminCli: (arguments_, environment = 'local') => execFileSync(process.execPath, ['scripts/connectors.mjs', ...arguments_], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        SUPABASE_URL: config.apiUrl,
        SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
        COMMONWORK_ADMIN_PROFILE_ID: data.user.id,
        COMMONWORK_ENV: environment,
      },
    }),
    runPilotOperationsCli: (arguments_, environment = 'local') => execFileSync(process.execPath, ['scripts/pilot-operations.mjs', ...arguments_], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        SUPABASE_URL: config.apiUrl,
        SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
        COMMONWORK_ADMIN_PROFILE_ID: data.user.id,
        COMMONWORK_ENV: environment,
      },
    }),
    enqueueTestNotification: async (type) => {
      const { data: notification, error: notificationError } = await admin
        .from('notifications')
        .insert({
          profile_id: data.user.id,
          type,
          title: 'Local test notification',
          body: 'Local test notification content.',
        })
        .select('id')
        .single();
      if (notificationError) throw notificationError;
      return notification.id as string;
    },
    getTestEmailDelivery: async (notificationId) => {
      const { data: delivery, error: deliveryError } = await admin
        .from('email_deliveries')
        .select('id, idempotency_key, notification_type, email_purpose, recipient_profile_id, status, provider_message_id, attempt_count, retry_after, sent_at, delivered_at, failure_code')
        .eq('notification_id', notificationId)
        .maybeSingle();
      if (deliveryError) throw deliveryError;
      return delivery as Record<string, unknown> | null;
    },
    getTestEmailDeliveryByIdempotencyKey: async (key) => {
      const { data: delivery, error: deliveryError } = await admin
        .from('email_deliveries')
        .select('id, idempotency_key, recipient_profile_id, status, failure_code, provider_message_id, sent_at, delivered_at')
        .eq('idempotency_key', key)
        .maybeSingle();
      if (deliveryError) throw deliveryError;
      return delivery as Record<string, unknown> | null;
    },
    getTestEmailDeliveriesForEntity: async (entityColumn, entityId) => {
      const query = admin
        .from('email_deliveries')
        .select('id, notification_type, email_purpose, recipient_profile_id, status');
      const { data: deliveries, error: deliveryError } = entityColumn === 'report_id'
        ? await query.eq('report_id', entityId)
        : await query.eq('privacy_request_id', entityId);
      if (deliveryError) throw deliveryError;
      return (deliveries ?? []) as Array<Record<string, unknown>>;
    },
    dispatchTestEmailBatch: async (send, environment = {}, resolveRecipientEmail) => dispatchEmailBatch({
      admin: admin as unknown as Parameters<typeof dispatchEmailBatch>[0]['admin'],
      send,
      resolveRecipientEmail,
      env: environment,
      batchSize: 20,
    }),
    setTestDeliveryProviderMessageId: async (notificationId, messageId, status) => {
      const { error: deliveryError } = await admin
        .from('email_deliveries')
        .update({ status, provider_message_id: messageId })
        .eq('notification_id', notificationId);
      if (deliveryError) throw deliveryError;
    },
    recordTestProviderEvent: async (providerEventId, providerMessageId, eventType) => {
      const { data: recorded, error: eventError } = await admin.rpc('record_resend_email_event', {
        target_provider_event_id: providerEventId,
        target_provider_message_id: providerMessageId,
        target_event_type: eventType,
        target_occurred_at: new Date().toISOString(),
        target_failure_code: null,
      });
      if (eventError) throw eventError;
      return Boolean(recorded);
    },
    getTestEmailEventCount: async (providerMessageId) => {
      const { count, error: eventError } = await admin
        .from('email_events')
        .select('id', { count: 'exact', head: true })
        .eq('provider_message_id', providerMessageId);
      if (eventError) throw eventError;
      return count ?? 0;
    },
    deleteTestProfile: async () => {
      const { error: profileError } = await admin.from('profiles').delete().eq('id', data.user.id);
      if (profileError) throw profileError;
    },
    makeTestEmailRetryDue: async (notificationId) => {
      const { error: deliveryError } = await admin
        .from('email_deliveries')
        .update({ retry_after: new Date(Date.now() - 60_000).toISOString() })
        .eq('notification_id', notificationId)
        .eq('status', 'queued');
      if (deliveryError) throw deliveryError;
    },
    connectorCapacity: async () => {
      const { data: connector, error: connectorError } = await admin
        .from('connectors')
        .select('introduction_capacity')
        .eq('profile_id', data.user.id)
        .maybeSingle();
      if (connectorError) throw connectorError;
      return connector?.introduction_capacity ?? null;
    },
    expireIntroduction: async (introductionId) => {
      const { error: expiryError } = await admin
        .from('introductions')
        .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
        .eq('id', introductionId);
      if (expiryError) throw expiryError;
    },
    setIntroductionRetryAfter: async (introductionId, recipientProfileId, retryAfter) => {
      const { error: retryError } = await admin
        .from('introduction_participants')
        .update({ retry_after: retryAfter })
        .eq('introduction_id', introductionId)
        .eq('profile_id', recipientProfileId);
      if (retryError) throw retryError;
    },
    remove: async () => {
      await admin.auth.admin.deleteUser(data.user.id);
    },
  };
}
