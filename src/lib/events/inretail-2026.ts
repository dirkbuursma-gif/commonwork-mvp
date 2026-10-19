/**
 * Official identity for the In Retail, Brands & CX 2026 session that Commonwork
 * hosts materials for.
 *
 * Source: https://www.distribuicaohoje.com/inretail/ (retrieved 2026-10-18).
 *
 * The events schema stores a single event row, so the parent-conference
 * information lives here as page content rather than as extra tables. Nothing
 * in this file is inferred: every string is taken from the official programme.
 */
import { getLisbonEventContextById } from './lisbon-context';

export interface SessionPerson {
  name: string;
  /** Role wording exactly as published in the official programme. */
  role: string;
  organisation: string;
}

export interface SessionSlot {
  /** ISO instant. 2026-10-21T10:20:00Z is 11:20 Europe/Lisbon (WEST). */
  startsAt: string;
  /** Official programme label, e.g. "APRESENTAÇÃO". */
  label: string;
}

export interface BrandAsset {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export interface EventIdentity {
  parentEventName: string;
  theme: string;
  edition: string;
  datesLabel: string;
  venue: string;
  trackTitle: string;
  sessionTitleEn: string;
  sessionTitlePt: string;
  /** Official programme block covering both the presentation and the debate. */
  programmeBlockLabel: string;
  summary: string;
  topics: string[];
  presentation: SessionSlot;
  debate: SessionSlot;
  presenter: SessionPerson;
  debaters: SessionPerson[];
  moderator: SessionPerson;
  programmeUrl: string;
  sourceRetrievedOn: string;
  eventMark: BrandAsset;
  organisers: BrandAsset[];
}

export const inretail2026: EventIdentity = {
  parentEventName: 'In Retail, Brands & CX',
  theme: 'End-to-End Commerce',
  edition: '16.ª edição',
  datesLabel: '20–22 October 2026',
  venue: 'Lagoas Park Hotel, Oeiras (Lisbon area), Portugal',
  trackTitle: 'Operar à escala: IA, canais, plataformas e controlo comercial',
  sessionTitleEn: 'Agentic Commerce: When AI Enters the Shopping Journey',
  sessionTitlePt: 'Agentic commerce: quando a IA entra na jornada de compra',
  programmeBlockLabel: 'Apresentação + Debate',
  summary:
    'How AI agents, digital assistants and new decision intermediaries change the way shoppers reach a retailer — and what that means for brand and retailer visibility, for who controls the recommendation, and for the commercial decisions retailers need to take next.',
  topics: [
    'AI agents, digital assistants and the new intermediaries of the purchase decision',
    'Impact on the visibility of brands, retailers and platforms',
    'Who controls the recommendation: brand, retailer, platform or agent',
  ],
  presentation: {
    startsAt: '2026-10-21T10:20:00.000Z',
    label: 'Apresentação',
  },
  debate: {
    startsAt: '2026-10-21T10:35:00.000Z',
    label: 'Debate',
  },
  presenter: {
    name: 'Dirk Buursma',
    role: 'Consultor, Ex Levi’s',
    organisation: 'Commerce Partners',
  },
  debaters: [
    { name: 'Rogério Santos', role: 'Head of e-Commerce', organisation: 'HomyCasa' },
    { name: 'Nuno Saraiva', role: 'General Manager', organisation: 'L’Oréal Luxe' },
  ],
  moderator: {
    name: 'Sérgio Abrantes',
    role: 'Editor-in-Chief',
    organisation: 'Revista Distribuição Hoje',
  },
  programmeUrl: 'https://www.distribuicaohoje.com/inretail/',
  sourceRetrievedOn: '2026-10-18',
  eventMark: {
    src: '/events/inretail-2026/inretail-brands-cx-2026-header.jpg',
    alt: 'In Retail, Brands & CX, 16.ª edição, by Skolae Formação — 20·21·22 Out. 2026, Lagoas Park Hotel, Oeiras',
    width: 1550,
    height: 570,
  },
  organisers: [
    {
      src: '/events/inretail-2026/organizer-distribuicao-hoje.jpg',
      alt: 'Distribuição Hoje',
      width: 250,
      height: 120,
    },
    {
      src: '/events/inretail-2026/organizer-skolae-formacao.jpg',
      alt: 'Skolae Formação',
      width: 200,
      height: 120,
    },
  ],
};

/** Branding only: material access is independently enforced by the server. */
export function getEventIdentity(eventId: string | undefined): EventIdentity | null {
  return getLisbonEventContextById(eventId) ? inretail2026 : null;
}
