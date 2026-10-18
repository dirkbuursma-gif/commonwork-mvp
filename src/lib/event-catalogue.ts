import { getLisbonEventContextById, getLisbonEventContextBySlug } from './events/lisbon-context';

export interface EventCatalogueSelection {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  productSlug: string;
  competencySlug: string;
  relevance: string;
}

const offerings: readonly Pick<EventCatalogueSelection, 'productSlug' | 'relevance'>[] = [
  {
    productSlug: 'geoffy',
    relevance: 'Geoffy describes product-page content and structured-data work for AI-assisted discovery. Confirm platform support and the availability of its separate monitoring capabilities; inclusion does not guarantee placement.',
  },
  {
    productSlug: 'admultify',
    relevance: 'Begen describes AdMultify as creative production from supplied assets. It relates to the session through expert-led marketing workflows, not assistant-visibility measurement.',
  },
  {
    productSlug: 'rierino-commerce-platform',
    relevance: 'Rierino describes commerce services and workflow orchestration. It relates to the operational systems and controls behind commerce, not a visibility audit or a Commonwork integration.',
  },
  {
    productSlug: 'be-cited',
    relevance: 'Be.Cited publishers describe brand visibility and citation measurement in generative-AI answers. It helps frame the session question about visibility; validate markets, sampling and methodology rather than assume placement.',
  },
];

export function getEventCatalogueSelections(
  eventId: string | undefined,
): readonly EventCatalogueSelection[] {
  const context = getLisbonEventContextById(eventId);
  return context ? offerings.map((offering) => ({ ...context, ...offering })) : [];
}

// Retain the original single-entry API until all callers use the scoped list.
export function getEventCatalogueSelection(
  eventId: string | undefined,
): EventCatalogueSelection | null {
  return getEventCatalogueSelections(eventId).find((selection) => selection.productSlug === 'be-cited') ?? null;
}

export function getCatalogueJourneyContext(
  eventSlug: string | null,
  productSlug: string | undefined,
): EventCatalogueSelection | null {
  const context = getLisbonEventContextBySlug(eventSlug);
  if (!context) return null;
  return getEventCatalogueSelections(context.eventId).find((selection) => selection.productSlug === productSlug) ?? null;
}
