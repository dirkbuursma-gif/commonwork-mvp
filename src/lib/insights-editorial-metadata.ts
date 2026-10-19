export const insightPreviewSummaries: Record<string, string> = {
  'product-data-is-a-margin-line':
    'Product feeds are no longer just an IT concern: commerce channels use structured attributes to shortlist products, while product-safety and passport rules attach accountability to those same fields. This review traces why return rates, warnings and data quality now belong in buying, sourcing and procurement decisions.',
  'dpp-registry-is-live':
    'The European Commission’s Digital Product Passport registry is operational, with organisations enrolling and customs able to check passport registration before release for free circulation. This brief explains why the registry’s verification role matters to sourcing, what it stores, and why batteries are the first affected category.',
  'testing-the-agent-ready-claim':
    'Published commerce protocols give buyers concrete questions to ask about an ‘agent-ready’ claim. This review sets out six checks for platforms, PIM vendors and implementation partners—from naming the protocol and supporting its fields to update latency, commercial signals, machine readability and agent traffic.',
} as const;

export function getInsightPreviewSummary(slug: string): string {
  const summary = insightPreviewSummaries[slug];
  if (!summary) throw new Error(`No approved preview summary for Insights article "${slug}".`);
  return summary;
}
