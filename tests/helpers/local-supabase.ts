import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

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
