const intelligenceReturnPath = /^\/intelligence(?:\/(?:category|provider|product)\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
const insightsReturnPath =
  /^\/insights(?:\/(?:product-data-is-a-margin-line|dpp-registry-is-live|testing-the-agent-ready-claim))?(?:\?topic=(?:product-data|standards-regulation|ecosystem))?$/;
const eventsReturnPath = /^\/events(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)$/;

export function validateReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 256) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value === '/account' || intelligenceReturnPath.test(value) || insightsReturnPath.test(value) || eventsReturnPath.test(value)
    ? value
    : null;
}

export const validateIntelligenceReturnPath = validateReturnPath;
