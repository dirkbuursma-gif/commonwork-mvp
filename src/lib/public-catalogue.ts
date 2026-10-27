export interface CatalogueTerm {
  slug: string;
  name: string;
  description?: string;
}
export interface PublicCatalogueEntry {
  slug: string;
  name: string;
  summary: string;
  capabilities: string;
  evidence_maturity: string;
  boundaries: string;
  questions: string[];
  provider_name: string;
  disclosure: string;
  categories: CatalogueTerm[];
  competencies: CatalogueTerm[];
}
export function filterPublicCatalogue(
  entries: PublicCatalogueEntry[],
  filters: { q?: string; category?: string; competence?: string; product?: string; eventProducts?: readonly string[] },
): PublicCatalogueEntry[] {
  const q = (filters.q ?? '').trim().toLocaleLowerCase();
  return entries.filter((entry) =>
    (!filters.product || entry.slug === filters.product)
    && (!filters.category || entry.categories.some((term) => term.slug === filters.category))
    && (!filters.competence || entry.competencies.some((term) => term.slug === filters.competence))
    && (!filters.eventProducts || filters.eventProducts.includes(entry.slug))
    && (!q || [entry.name, entry.provider_name, entry.summary, entry.capabilities,
      ...entry.categories.map((term) => term.name), ...entry.competencies.map((term) => term.name),
    ].join(' ').toLocaleLowerCase().includes(q))
  );
}
