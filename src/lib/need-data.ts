import type { SupabaseClient } from '@supabase/supabase-js';

export type NeedVisibility = 'private_matches' | 'selected_network' | 'selected_event' | 'network';
export type NeedStatus = 'draft' | 'active' | 'paused' | 'fulfilled' | 'expired' | 'archived';
export type ConversationType = 'peer_exchange' | 'advisory' | 'project' | 'partnership' | 'opportunity';
export type CompetenceImportance = 'essential' | 'useful';
export type RelevanceBand = 'strong' | 'good' | 'possible';
export type MatchStatus = 'new' | 'viewed' | 'saved' | 'dismissed' | 'expired';
export type MatchReasonType =
  | 'essential_match'
  | 'useful_match'
  | 'evidence_strength'
  | 'relevant_outcome'
  | 'availability'
  | 'competence_gap'
  | 'unknown';

export interface CompetenceNeed {
  id: string;
  owner_profile_id: string;
  title: string;
  business_outcome: string;
  problem_statement: string;
  relevant_context: string;
  what_requester_offers: string;
  conversation_type: ConversationType;
  visibility: NeedVisibility;
  status: NeedStatus;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NeedCompetence {
  id: string;
  need_id: string;
  competency_id: string;
  importance: CompetenceImportance;
  context: string;
  competencies: { name: string; category: string } | null;
}

export interface MatchResult {
  id: string;
  need_id: string;
  matched_profile_id: string;
  relevance_band: RelevanceBand;
  status: MatchStatus;
  calculated_at: string;
}

export interface MatchReason {
  id: string;
  match_id: string;
  reason_type: MatchReasonType;
  competency_id: string | null;
  evidence_id: string | null;
  explanation: string;
  created_at: string;
}

export interface MemberProfileSummary {
  id: string;
  display_name: string;
  professional_summary: string;
  what_i_contribute: string;
  what_i_am_exploring: string;
}

export interface MatchEvidence {
  profile_id: string;
  profile_competency_id: string;
  competency_id: string;
  evidence_id: string;
  evidence_title: string;
  context: string;
  contribution: string;
  outcome: string;
}

const needColumns = 'id, owner_profile_id, title, business_outcome, problem_statement, relevant_context, what_requester_offers, conversation_type, visibility, status, expires_at, created_at, updated_at';
const matchColumns = 'id, need_id, matched_profile_id, relevance_band, status, calculated_at, created_at, updated_at';
const profileColumns = 'id, display_name, professional_summary, what_i_contribute, what_i_am_exploring';
const reasonColumns = 'id, match_id, reason_type, competency_id, evidence_id, explanation, created_at';

export async function getNeed(client: SupabaseClient, needId: string): Promise<CompetenceNeed | null> {
  const { data, error } = await client.from('competence_needs').select(needColumns).eq('id', needId).maybeSingle();
  if (error) throw error;
  return data as CompetenceNeed | null;
}

export async function getOwnedNeeds(client: SupabaseClient, ownerId: string): Promise<CompetenceNeed[]> {
  const { data, error } = await client
    .from('competence_needs')
    .select(needColumns)
    .eq('owner_profile_id', ownerId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CompetenceNeed[];
}

export async function getNetworkNeeds(client: SupabaseClient): Promise<CompetenceNeed[]> {
  const { data, error } = await client
    .from('competence_needs')
    .select(needColumns)
    .eq('visibility', 'network')
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as CompetenceNeed[];
}

export async function getNeedCompetencies(client: SupabaseClient, needId: string): Promise<NeedCompetence[]> {
  const { data, error } = await client
    .from('need_competencies')
    .select('id, need_id, competency_id, importance, context, competencies(name, category)')
    .eq('need_id', needId)
    .order('importance', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as NeedCompetence[];
}

export async function getMatchesForNeed(client: SupabaseClient, needId: string): Promise<MatchResult[]> {
  const { data, error } = await client
    .from('matches')
    .select(matchColumns)
    .eq('need_id', needId)
    .order('calculated_at', { ascending: false });
  if (error) throw error;
  const bandOrder: Record<RelevanceBand, number> = { strong: 0, good: 1, possible: 2 };
  return ((data ?? []) as MatchResult[]).sort((left, right) => bandOrder[left.relevance_band] - bandOrder[right.relevance_band]);
}

export async function getMatchReasons(client: SupabaseClient, matchIds: string[]): Promise<MatchReason[]> {
  if (matchIds.length === 0) return [];
  const { data, error } = await client
    .from('member_match_reasons')
    .select(reasonColumns)
    .in('match_id', matchIds)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as MatchReason[];
}

export async function getMatchMemberProfiles(client: SupabaseClient, profileIds: string[]): Promise<MemberProfileSummary[]> {
  if (profileIds.length === 0) return [];
  const { data, error } = await client
    .from('discoverable_profiles')
    .select(profileColumns)
    .in('id', profileIds);
  if (error) throw error;
  return (data ?? []) as MemberProfileSummary[];
}

export async function getMatchEvidence(client: SupabaseClient, needId: string): Promise<MatchEvidence[]> {
  const { data, error } = await client.rpc('matching_evidence_for_need', { target_need_id: needId });
  if (error) throw error;
  return (data ?? []) as MatchEvidence[];
}
