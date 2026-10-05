export type CompetenceCategory =
  | 'knowledge'
  | 'practical_capability'
  | 'way_of_working';

export type EvidenceStatus =
  | 'declared'
  | 'demonstrated'
  | 'peer_confirmed'
  | 'outcome_verified'
  | 'commonwork_demonstrated';

export type NeedVisibility =
  | 'private_matches'
  | 'selected_group'
  | 'event_members'
  | 'network';

export type IntroductionStatus =
  | 'draft'
  | 'awaiting_requester'
  | 'awaiting_recipient'
  | 'awaiting_connector'
  | 'accepted'
  | 'introduced'
  | 'declined'
  | 'expired'
  | 'completed';

export interface CompetenceSummary {
  id: string;
  name: string;
  category: CompetenceCategory;
  explanation: string;
  evidenceStatus: EvidenceStatus;
}
