import type { SupabaseClient } from '@supabase/supabase-js';

export interface EditorialInsight {
  id: string;
  slug: string;
  title: string;
  deck: string;
  summary: string;
  body: string;
  desk: 'Product Data' | 'Standards & Regulation' | 'Ecosystem';
  format: 'Analysis' | 'Brief' | 'Vendor Watch';
  status: 'draft' | 'published';
  content_type: 'commonwork_insight' | 'company_insight' | 'company_update';
  provider_id: string | null;
  provider_product_id: string | null;
  public_author_name: string | null;
  linked_product_slug: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

const editorialFields =
  'id, slug, title, deck, summary, body, desk, format, status, content_type, provider_id, provider_product_id, public_author_name, linked_product_slug, published_at, first_published_at, withdrawn_at, created_at, updated_at';

export async function listEditorialInsights(supabase: SupabaseClient): Promise<EditorialInsight[]> {
  const { data, error } = await supabase
    .from('insight_articles')
    .select(editorialFields)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as EditorialInsight[];
}

export async function getEditorialInsight(
  supabase: SupabaseClient,
  slug: string,
): Promise<EditorialInsight | null> {
  const { data, error } = await supabase
    .from('insight_articles')
    .select(editorialFields)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return (data as EditorialInsight | null) ?? null;
}
