const intelligenceReturnPath = /^\/intelligence(?:\/(?:category|provider|product)\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

export function validateIntelligenceReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 256) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return intelligenceReturnPath.test(value) ? value : null;
}