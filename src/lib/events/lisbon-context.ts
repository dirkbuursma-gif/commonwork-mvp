/** Configured identities are metadata, never an access grant. */
export interface LisbonEventContext {
  readonly eventId: string;
  readonly eventSlug: string;
  readonly eventTitle: string;
  readonly competencySlug: string;
}

const common = {
  eventTitle: 'Agentic Commerce: When AI Enters the Shopping Journey',
  competencySlug: 'agentic-commerce',
};
const contexts: readonly LisbonEventContext[] = [
  Object.freeze({ ...common, eventId: '00000000-0000-4000-8000-00000000e001', eventSlug: 'commonwork-lisbon-preview' }),
  Object.freeze({ ...common, eventId: 'c3118b54-7568-4ef6-9159-124dc86e7971', eventSlug: 'agentic-commerce-lisbon-2026' }),
];

export function getLisbonEventContextById(id: string | null | undefined): LisbonEventContext | null {
  return contexts.find((context) => context.eventId === id) ?? null;
}

export function getLisbonEventContextBySlug(slug: string | null | undefined): LisbonEventContext | null {
  return contexts.find((context) => context.eventSlug === slug) ?? null;
}

export function matchesLisbonEventContext(id: string | null | undefined, slug: string | null | undefined): boolean {
  const context = getLisbonEventContextById(id);
  return Boolean(context && context.eventSlug === slug);
}
