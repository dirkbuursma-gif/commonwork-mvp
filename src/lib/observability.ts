type PilotLogContext = {
  actor_profile_id?: string;
  need_id?: string;
  match_id?: string;
  introduction_id?: string;
  action?: string;
};

const safeIdentifier = /^[0-9a-f-]{36}$/i;
const safeAction = /^[a-z_]{1,48}$/;

function safeErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return 'unknown';
  const code = String((error as { code?: unknown }).code ?? 'unknown');
  return /^[A-Z0-9_-]{1,32}$/.test(code) ? code : 'unknown';
}

export function logPilotFailure(event: string, error: unknown, context: PilotLogContext = {}) {
  const safeContext: PilotLogContext = {};
  for (const key of ['actor_profile_id', 'need_id', 'match_id', 'introduction_id'] as const) {
    const value = context[key];
    if (value && safeIdentifier.test(value)) safeContext[key] = value;
  }
  if (context.action && safeAction.test(context.action)) safeContext.action = context.action;

  console.error(JSON.stringify({
    level: 'error',
    event: safeAction.test(event) ? event : 'pilot_operation_failed',
    error_code: safeErrorCode(error),
    occurred_at: new Date().toISOString(),
    ...safeContext,
  }));
}

export function logPilotEvent(event: string, context: PilotLogContext = {}) {
  const safeContext: PilotLogContext = {};
  for (const key of ['actor_profile_id', 'need_id', 'match_id', 'introduction_id'] as const) {
    const value = context[key];
    if (value && safeIdentifier.test(value)) safeContext[key] = value;
  }
  if (context.action && safeAction.test(context.action)) safeContext.action = context.action;

  console.info(JSON.stringify({
    level: 'info',
    event: safeAction.test(event) ? event : 'pilot_operation',
    occurred_at: new Date().toISOString(),
    ...safeContext,
  }));
}
