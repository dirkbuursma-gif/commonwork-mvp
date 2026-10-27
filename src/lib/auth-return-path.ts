const intelligenceReturnPath = /^\/intelligence(?:\/(?:category|provider|product)\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
const insightsReturnPath =
  /^\/insights(?:\/(?:product-data-is-a-margin-line|dpp-registry-is-live|testing-the-agent-ready-claim))?(?:\?topic=(?:product-data|standards-regulation|ecosystem))?$/;
const eventsReturnPath = /^\/events(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)$/;

function isMemberToolsReturnPath(value: string): boolean {
  const match = /^(\/intelligence\/(?:category|product)\/[a-z0-9]+(?:-[a-z0-9]+)*)\?(.+)$/.exec(value);
  if (!match) return false;
  const query = new URLSearchParams(match[2]);
  if (query.getAll('workspace').length !== 1 || query.get('workspace') !== '1') return false;
  if (query.getAll('from_event').length > 1) return false;
  for (const key of query.keys()) if (!['workspace', 'from_event'].includes(key)) return false;
  const event = query.get('from_event');
  if (event !== null && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event)) return false;
  const canonical = new URLSearchParams({ workspace: '1' });
  if (event) canonical.set('from_event', event);
  return value === `${match[1]}?${canonical}`;
}
export function validateReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 256) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value === '/account' || intelligenceReturnPath.test(value) || insightsReturnPath.test(value) || eventsReturnPath.test(value) || isMemberToolsReturnPath(value)
    ? value
    : null;
}

export const validateIntelligenceReturnPath = validateReturnPath;
