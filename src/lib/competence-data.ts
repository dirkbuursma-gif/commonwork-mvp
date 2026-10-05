import type { SupabaseClient } from '@supabase/supabase-js';

export interface MemberProfile {
  id: string;
  display_name: string;
  professional_summary: string;
  what_i_contribute: string;
  what_i_am_exploring: string;
  profile_visibility: 'private' | 'members';
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface DiscoverableProfile {
  id: string;
  display_name: string;
  professional_summary: string;
  what_i_contribute: string;
  what_i_am_exploring: string;
}

export interface ProfileCompetence {
  id: string;
  profile_id: string;
  competency_id: string;
  member_statement: string;
  evidence_status: 'declared' | 'demonstrated';
  discoverable: boolean;
  created_at: string;
  updated_at: string;
  competencies: {
    name: string;
    slug: string;
    category: 'knowledge' | 'practical_capability' | 'way_of_working';
    description: string;
  } | null;
}

export interface CompetenceEvidence {
  id: string;
  profile_competency_id: string;
  title: string;
  context: string;
  contribution: string;
  outcome: string;
  evidence_url: string | null;
  visibility: 'private' | 'matches_only' | 'members';
  created_at: string;
}

export interface ContactPreferences {
  profile_id: string;
  open_to_peer_exchange: boolean;
  open_to_advisory: boolean;
  open_to_projects: boolean;
  open_to_partnerships: boolean;
  open_to_opportunities: boolean;
  open_to_event_introductions: boolean;
  commercial_approaches: boolean;
  availability_status: 'open' | 'selective' | 'introductions_only' | 'unavailable';
  conversation_capacity: number;
}

export type DiscoverableContactPreferences = Omit<ContactPreferences, 'commercial_approaches'>;

export interface CanonicalCompetence {
  id: string;
  name: string;
  slug: string;
  category: 'knowledge' | 'practical_capability' | 'way_of_working';
  description: string;
}

export async function getMyProfile(client: SupabaseClient): Promise<MemberProfile | null> {
  const { data, error } = await client.rpc('get_my_profile');
  if (error) throw error;
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return (rows[0] as MemberProfile | undefined) ?? null;
}

export async function getDiscoverableProfile(
  client: SupabaseClient,
  profileId: string,
): Promise<DiscoverableProfile | null> {
  const { data, error } = await client
    .from('discoverable_profiles')
    .select('id, display_name, professional_summary, what_i_contribute, what_i_am_exploring')
    .eq('id', profileId)
    .maybeSingle();
  if (error) throw error;
  return data as DiscoverableProfile | null;
}

export async function getProfileCompetencies(
  client: SupabaseClient,
  profileId: string,
): Promise<ProfileCompetence[]> {
  const { data, error } = await client
    .from('profile_competencies')
    .select('id, profile_id, competency_id, member_statement, evidence_status, discoverable, created_at, updated_at, competencies(name, slug, category, description)')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  type CompetencyJoin = ProfileCompetence['competencies'] | NonNullable<ProfileCompetence['competencies']>[];
  const rows = (data ?? []) as unknown as Array<Omit<ProfileCompetence, 'competencies'> & { competencies: CompetencyJoin }>;
  return rows.map((row) => ({
    ...row,
    competencies: Array.isArray(row.competencies) ? row.competencies[0] ?? null : row.competencies,
  }));
}

export async function getCompetenceEvidence(
  client: SupabaseClient,
  profileCompetencyIds: string[],
): Promise<CompetenceEvidence[]> {
  if (profileCompetencyIds.length === 0) return [];
  const { data, error } = await client
    .from('competence_evidence')
    .select('id, profile_competency_id, title, context, contribution, outcome, evidence_url, visibility, created_at')
    .in('profile_competency_id', profileCompetencyIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CompetenceEvidence[];
}

export async function getContactPreferences(
  client: SupabaseClient,
  profileId: string,
): Promise<ContactPreferences | null> {
  const { data, error } = await client
    .from('contact_preferences')
    .select('profile_id, open_to_peer_exchange, open_to_advisory, open_to_projects, open_to_partnerships, open_to_opportunities, open_to_event_introductions, commercial_approaches, availability_status, conversation_capacity')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return data as ContactPreferences | null;
}

export async function getDiscoverableContactPreferences(
  client: SupabaseClient,
  profileId: string,
): Promise<DiscoverableContactPreferences | null> {
  const { data, error } = await client
    .from('discoverable_contact_preferences')
    .select('profile_id, open_to_peer_exchange, open_to_advisory, open_to_projects, open_to_partnerships, open_to_opportunities, open_to_event_introductions, availability_status, conversation_capacity')
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return data as DiscoverableContactPreferences | null;
}

export async function getCanonicalCompetencies(
  client: SupabaseClient,
): Promise<CanonicalCompetence[]> {
  const { data, error } = await client
    .from('competencies')
    .select('id, name, slug, category, description')
    .eq('status', 'active')
    .order('category', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CanonicalCompetence[];
}
