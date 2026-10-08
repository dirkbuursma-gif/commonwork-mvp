import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getMatchEvidence,
  getMatchMemberProfiles,
  getMatchReasons,
  getNeed,
  getNeedCompetencies,
  type CompetenceNeed,
  type MatchEvidence,
  type MatchReason,
  type MatchResult,
  type MemberProfileSummary,
  type NeedCompetence,
} from './need-data';

export type IntroductionRoute = 'direct' | 'suggested_introducer' | 'trusted_connector';
export type IntroductionStatus =
  | 'draft'
  | 'awaiting_recipient'
  | 'awaiting_requester_context'
  | 'awaiting_connector'
  | 'accepted'
  | 'introduced'
  | 'declined'
  | 'expired'
  | 'cancelled'
  | 'completed';
export type IntroductionRole = 'requester' | 'recipient' | 'introducer' | 'connector';
export type IntroductionConsent = 'pending' | 'accepted' | 'declined';

export interface ContactMethod {
  id: string;
  method_type: 'email' | 'calendar_url';
  value: string;
  label: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface IntroductionInboxItem {
  introduction_id: string;
  need_id: string | null;
  match_id: string | null;
  my_role: IntroductionRole;
  requester_profile_id: string;
  recipient_profile_id: string;
  requester_display_name: string;
  recipient_display_name: string;
  route: IntroductionRoute;
  status: IntroductionStatus;
  why_this_person: string;
  why_now: string;
  proposed_conversation: string;
  requester_offer: string;
  approved_context_snapshot: Record<string, unknown>;
  clarification_round: number;
  clarification_question: string | null;
  clarification_response: string | null;
  expires_at: string;
  introduced_at: string | null;
  completed_at: string | null;
  my_consent_status: IntroductionConsent;
  my_decline_reason: string | null;
  my_retry_after: string | null;
  has_contact_method: boolean;
  other_contact_method_type: 'email' | 'calendar_url' | null;
  other_contact_method_label: string | null;
  assignment_type: 'suggested_introducer' | 'trusted_connector' | null;
  assignment_status: string | null;
  assigned_profile_id: string | null;
  suggested_profile_id: string | null;
  knows_both: boolean | null;
  assignment_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReleasedContactMethod {
  profile_id: string;
  display_name: string;
  method_type: 'email' | 'calendar_url';
  value: string;
  label: string;
}

export interface IntroductionNotification {
  id: string;
  profile_id: string;
  introduction_id: string | null;
  type: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export interface PrivacyRequest {
  id: string;
  request_type: 'data_export' | 'account_deletion';
  status: 'pending' | 'in_review' | 'fulfilled' | 'rejected' | 'cancelled';
  member_note: string;
  requested_at: string;
  resolved_at: string | null;
  resolution_note: string;
}

export interface BlockedIntroductionMember {
  profile_id: string;
  blocked_profile_id: string;
  blocked_display_name: string;
  created_at: string;
}

export interface AvailableConnector {
  profile_id: string;
  display_name: string;
  professional_summary: string;
  what_i_contribute: string;
}

export interface IntroductionMatchContext {
  match: MatchResult;
  need: CompetenceNeed;
  matchedMember: MemberProfileSummary;
  reasons: MatchReason[];
  evidence: MatchEvidence[];
  competencies: NeedCompetence[];
}

export async function getMyContactMethods(client: SupabaseClient): Promise<ContactMethod[]> {
  const { data, error } = await client.rpc('get_my_contact_methods');
  if (error) throw error;
  return (data ?? []) as ContactMethod[];
}

export async function getMyIntroductionInbox(client: SupabaseClient): Promise<IntroductionInboxItem[]> {
  const { data, error } = await client.rpc('get_my_introduction_inbox');
  if (error) throw error;
  return (data ?? []) as IntroductionInboxItem[];
}

export async function getIntroductionMatch(
  client: SupabaseClient,
  matchId: string,
  requesterId: string,
): Promise<IntroductionMatchContext | null> {
  const { data, error } = await client
    .from('matches')
    .select('id, need_id, matched_profile_id, relevance_band, status, calculated_at')
    .eq('id', matchId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !['new', 'viewed', 'saved'].includes(data.status)) return null;

  const match = data as MatchResult;
  const need = await getNeed(client, match.need_id);
  if (!need || need.owner_profile_id !== requesterId || need.status !== 'active' || !need.expires_at || new Date(need.expires_at) <= new Date()) {
    return null;
  }

  const [members, reasons, evidence, competencies] = await Promise.all([
    getMatchMemberProfiles(client, [match.matched_profile_id]),
    getMatchReasons(client, [match.id]),
    getMatchEvidence(client, need.id),
    getNeedCompetencies(client, need.id),
  ]);
  const matchedMember = members[0];
  if (!matchedMember) return null;

  return {
    match,
    need,
    matchedMember,
    reasons,
    evidence: evidence.filter((item) => item.profile_id === matchedMember.id),
    competencies,
  };
}

export async function getPotentialIntroducers(
  client: SupabaseClient,
  excludedProfileIds: string[],
): Promise<Array<{ id: string; display_name: string }>> {
  const { data, error } = await client
    .from('discoverable_profiles')
    .select('id, display_name')
    .order('display_name', { ascending: true });
  if (error) throw error;
  const excluded = new Set(excludedProfileIds);
  return ((data ?? []) as Array<{ id: string; display_name: string }>).filter((profile) => !excluded.has(profile.id));
}

export async function getAvailableConnectors(client: SupabaseClient): Promise<AvailableConnector[]> {
  const { data, error } = await client
    .from('available_connectors')
    .select('profile_id, display_name, professional_summary, what_i_contribute')
    .order('display_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AvailableConnector[];
}

export async function releaseIntroductionContacts(
  client: SupabaseClient,
  introductionId: string,
): Promise<ReleasedContactMethod[]> {
  const { data, error } = await client.rpc('release_introduction_contacts', {
    target_introduction_id: introductionId,
  });
  if (error) throw error;
  return (data ?? []) as ReleasedContactMethod[];
}

export async function getMyIntroductionFeedback(client: SupabaseClient, introductionId: string) {
  const { data, error } = await client
    .from('introduction_feedback')
    .select('id, introduction_id, profile_id, conversation_occurred, match_relevant, competencies_relevant, would_welcome_future_introductions, private_feedback, created_at, updated_at')
    .eq('introduction_id', introductionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getMyIntroductionNotifications(client: SupabaseClient): Promise<IntroductionNotification[]> {
  const { data, error } = await client
    .from('notifications')
    .select('id, profile_id, introduction_id, type, title, body, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as IntroductionNotification[];
}

export async function getMyPrivacyRequests(client: SupabaseClient): Promise<PrivacyRequest[]> {
  const { data, error } = await client.rpc('get_my_privacy_requests');
  if (error) throw error;
  return (data ?? []) as PrivacyRequest[];
}

export async function getMyIntroductionBlocks(client: SupabaseClient): Promise<BlockedIntroductionMember[]> {
  const { data, error } = await client
    .from('profile_introduction_blocks')
    .select('profile_id, blocked_profile_id, blocked_display_name, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as BlockedIntroductionMember[];
}