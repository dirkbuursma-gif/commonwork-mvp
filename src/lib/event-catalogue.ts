export interface EventCatalogueSelection {
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  productSlug: string;
  competencySlug: string;
  relevance: string;
}

const inretailSelection: EventCatalogueSelection = {
  eventId: '00000000-0000-4000-8000-00000000e001',
  eventSlug: 'commonwork-lisbon-preview',
  eventTitle: 'Agentic Commerce: When AI Enters the Shopping Journey',
  productSlug: 'be-cited',
  competencySlug: 'agentic-commerce',
  relevance:
    'The session asks how retailers stay visible when AI intermediates discovery. Be.cited monitors generative-search visibility and citations so a retailer can examine that question with evidence rather than assume placement.',
};

export function getEventCatalogueSelection(eventId: string | undefined): EventCatalogueSelection | null {
  return eventId === inretailSelection.eventId ? inretailSelection : null;
}

export function getCatalogueJourneyContext(
  eventSlug: string | null,
  productSlug: string | undefined,
): EventCatalogueSelection | null {
  if (eventSlug !== inretailSelection.eventSlug || productSlug !== inretailSelection.productSlug) {
    return null;
  }
  return inretailSelection;
}
