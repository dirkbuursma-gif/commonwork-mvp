import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProviderCategory {
  id: string;
  slug: string;
  name: string;
  what_it_is: string;
  what_it_is_not: string;
  sort_order: number;
  is_seed_data: boolean;
  seed_batch: string | null;
}

export interface ProviderSummary {
  id: string;
  slug: string;
  name: string;
  website_url: string | null;
  summary: string;
  is_seed_data: boolean;
  seed_batch: string | null;
  public_disclosure_note: string;
}

export interface ProviderProduct {
  id: string;
  provider_id: string;
  slug: string;
  name: string;
  summary: string;
  operating_layer: string;
  contribution_role: string;
  evidence_maturity: string;
  merchant_fit: string[];
  boundary_and_dependencies: string;
  buyer_validation_questions: string[];
  architecture: string;
  deployment_model: string;
  capabilities_summary: string;
  is_seed_data: boolean;
  seed_batch: string | null;
  public_disclosure_note?: string;
}

export interface CategoryProduct extends ProviderProduct {
  fit_summary: string;
  provider: ProviderSummary;
  public_disclosure_note: string;
}

export interface CategoryCompetency {
  id: string;
  name: string;
  slug: string;
  category: 'knowledge' | 'practical_capability' | 'way_of_working';
  description: string;
  relationship_type: 'related' | 'expertise' | 'common_need';
  relevance_note: string;
}

export interface RelevantExpert {
  id: string;
  display_name: string;
  professional_summary: string;
  what_i_contribute: string;
  what_i_am_exploring: string;
  competencies: string[];
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function getProviderCategories(client: SupabaseClient): Promise<ProviderCategory[]> {
  const { data, error } = await client
    .from('provider_categories')
    .select('id, slug, name, what_it_is, what_it_is_not, sort_order, is_seed_data, seed_batch')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProviderCategory[];
}

export async function getProviderCategory(
  client: SupabaseClient,
  slug: string,
): Promise<ProviderCategory | null> {
  const { data, error } = await client
    .from('provider_categories')
    .select('id, slug, name, what_it_is, what_it_is_not, sort_order, is_seed_data, seed_batch')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data as ProviderCategory | null;
}

export async function getProviderCategoryProducts(
  client: SupabaseClient,
  categoryId: string,
): Promise<CategoryProduct[]> {
  const { data, error } = await client
    .from('provider_category_memberships')
    .select('fit_summary, sort_order, provider_products!inner(id, provider_id, slug, name, summary, operating_layer, contribution_role, evidence_maturity, merchant_fit, boundary_and_dependencies, buyer_validation_questions, architecture, deployment_model, capabilities_summary, is_seed_data, seed_batch, providers!inner(id, slug, name, website_url, summary, is_seed_data, seed_batch))')
    .eq('category_id', categoryId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const productIds = rows.map((row: any) => one(row.provider_products)?.id).filter(Boolean);
  const providerIds = [...new Set(rows.map((row: any) => one(one(row.provider_products)?.providers)?.id).filter(Boolean))];
  const [productStatuses, providerStatuses] = await Promise.all([
    productIds.length
      ? client.from('provider_publication_status').select('provider_product_id, public_disclosure_note').in('provider_product_id', productIds)
      : Promise.resolve({ data: [], error: null }),
    providerIds.length
      ? client.from('provider_publication_status').select('provider_id, public_disclosure_note').in('provider_id', providerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (productStatuses.error) throw productStatuses.error;
  if (providerStatuses.error) throw providerStatuses.error;
  const productDisclosure = new Map((productStatuses.data ?? []).map((status: any) => [status.provider_product_id, status.public_disclosure_note ?? '']));
  const providerDisclosure = new Map((providerStatuses.data ?? []).map((status: any) => [status.provider_id, status.public_disclosure_note ?? '']));
  return rows.flatMap((row: any) => {
    const product = one(row.provider_products);
    const provider = one(product?.providers);
    if (!product || !provider) return [];
    return [{
      ...product,
      provider: { ...provider, public_disclosure_note: providerDisclosure.get(provider.id) ?? '' },
      fit_summary: row.fit_summary ?? '',
      public_disclosure_note: productDisclosure.get(product.id) ?? '',
    } as CategoryProduct];
  });
}

export async function getProviderBySlug(
  client: SupabaseClient,
  slug: string,
): Promise<{ provider: ProviderSummary; products: ProviderProduct[] } | null> {
  const { data: providerData, error: providerError } = await client
    .from('providers')
    .select('id, slug, name, website_url, summary, is_seed_data, seed_batch')
    .eq('slug', slug)
    .maybeSingle();
  if (providerError) throw providerError;
  if (!providerData) return null;

  const { data: products, error: productsError } = await client
    .from('provider_products')
    .select('id, provider_id, slug, name, summary, operating_layer, contribution_role, evidence_maturity, merchant_fit, boundary_and_dependencies, buyer_validation_questions, architecture, deployment_model, capabilities_summary, is_seed_data, seed_batch')
    .eq('provider_id', providerData.id)
    .order('name', { ascending: true });
  if (productsError) throw productsError;
  const { data: status, error: statusError } = await client
    .from('provider_publication_status')
    .select('public_disclosure_note')
    .eq('provider_id', providerData.id)
    .maybeSingle();
  if (statusError) throw statusError;
  return {
    provider: { ...(providerData as Omit<ProviderSummary, 'public_disclosure_note'>), public_disclosure_note: status?.public_disclosure_note ?? '' },
    products: (products ?? []) as ProviderProduct[],
  };
}

export async function getProviderProductBySlug(
  client: SupabaseClient,
  slug: string,
): Promise<{ product: ProviderProduct & { public_disclosure_note: string }; provider: ProviderSummary; categories: Array<ProviderCategory & { fit_summary: string }> } | null> {
  const { data, error } = await client
    .from('provider_products')
    .select('id, provider_id, slug, name, summary, operating_layer, contribution_role, evidence_maturity, merchant_fit, boundary_and_dependencies, buyer_validation_questions, architecture, deployment_model, capabilities_summary, is_seed_data, seed_batch, providers!inner(id, slug, name, website_url, summary, is_seed_data, seed_batch), provider_category_memberships(fit_summary, provider_categories!inner(id, slug, name, what_it_is, what_it_is_not, sort_order, is_seed_data, seed_batch))')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const record = data as any;
  const provider = one(record.providers) as ProviderSummary | null;
  if (!provider) return null;
  const [productStatus, providerStatus] = await Promise.all([
    client.from('provider_publication_status').select('public_disclosure_note').eq('provider_product_id', record.id).maybeSingle(),
    client.from('provider_publication_status').select('public_disclosure_note').eq('provider_id', provider.id).maybeSingle(),
  ]);
  if (productStatus.error) throw productStatus.error;
  if (providerStatus.error) throw providerStatus.error;
  const categories = (record.provider_category_memberships ?? []).flatMap((membership: any) => {
    const category = one(membership.provider_categories) as ProviderCategory | null;
    return category ? [{ ...category, fit_summary: membership.fit_summary ?? '' }] : [];
  });
  return {
    product: { ...record, public_disclosure_note: productStatus.data?.public_disclosure_note ?? '' } as ProviderProduct & { public_disclosure_note: string },
    provider: { ...provider, public_disclosure_note: providerStatus.data?.public_disclosure_note ?? '' },
    categories,
  };
}

export async function getCategoryCompetencies(
  client: SupabaseClient,
  categoryId: string,
): Promise<CategoryCompetency[]> {
  const { data, error } = await client
    .from('category_competency_links')
    .select('relationship_type, relevance_note, sort_order, competencies!inner(id, name, slug, category, description)')
    .eq('category_id', categoryId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []).flatMap((row: any) => {
    const competency = one(row.competencies);
    return competency ? [{ ...competency, relationship_type: row.relationship_type, relevance_note: row.relevance_note ?? '' } as CategoryCompetency] : [];
  });
}

export async function getRelevantExperts(
  client: SupabaseClient,
  competencies: CategoryCompetency[],
): Promise<RelevantExpert[]> {
  const competencyIds = competencies.map((item) => item.id);
  if (competencyIds.length === 0) return [];

  const { data: matches, error: matchError } = await client
    .from('profile_competencies')
    .select('profile_id, competency_id, competencies!inner(name, slug)')
    .in('competency_id', competencyIds)
    .eq('discoverable', true);
  if (matchError) throw matchError;
  const competenciesByProfile = new Map<string, Set<string>>();
  for (const row of matches ?? []) {
    const competency = one((row as any).competencies);
    const labels = competenciesByProfile.get(row.profile_id) ?? new Set<string>();
    if (competency?.name) labels.add(competency.name);
    competenciesByProfile.set(row.profile_id, labels);
  }
  const profileIds = [...competenciesByProfile.keys()].slice(0, 12);
  if (profileIds.length === 0) return [];

  const { data: profiles, error: profileError } = await client
    .from('discoverable_profiles')
    .select('id, display_name, professional_summary, what_i_contribute, what_i_am_exploring')
    .in('id', profileIds);
  if (profileError) throw profileError;
  return (profiles ?? []).map((profile) => ({
    ...profile,
    competencies: [...(competenciesByProfile.get(profile.id) ?? [])],
  })) as RelevantExpert[];
}