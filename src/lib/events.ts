import type { SupabaseClient } from '@supabase/supabase-js';

export type AttendeeStatus = 'requested' | 'approved' | 'revoked';
export type MaterialKind = 'presentation' | 'guide' | 'replay';

export interface EventSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  location: string;
  starts_at: string | null;
  ends_at: string | null;
  is_published: boolean;
  manager_profile_id: string;
}

export interface EventMaterial {
  id: string;
  event_id: string;
  kind: MaterialKind;
  title: string;
  storage_path: string;
}

export const lisbonPreviewEvent: EventSummary = {
  id: '20261021-0000-4000-8000-000000000001',
  slug: 'lisbon-presentation',
  title: 'Commonwork — Lisbon presentation',
  summary: 'Connecting competence, companies and products, insights and events in one Commonwork experience.',
  location: 'Lisbon',
  starts_at: '2026-10-21T00:00:00.000Z',
  ends_at: null,
  is_published: true,
  manager_profile_id: '00000000-0000-0000-0000-000000000000',
};

export const materialLabels: Record<MaterialKind, string> = {
  presentation: 'Presentation',
  guide: 'Print guide',
  replay: 'Browser replay',
};

export async function listPublishedEvents(supabase: SupabaseClient): Promise<EventSummary[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id, slug, title, summary, location, starts_at, ends_at, is_published, manager_profile_id')
    .eq('is_published', true)
    .order('starts_at', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as EventSummary[];
}

export async function getEventBySlug(supabase: SupabaseClient, slug: string): Promise<EventSummary | null> {
  const { data, error } = await supabase
    .from('events')
    .select('id, slug, title, summary, location, starts_at, ends_at, is_published, manager_profile_id')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return (data as EventSummary | null) ?? null;
}

export async function getMyAttendance(
  supabase: SupabaseClient,
  eventId: string,
  profileId: string,
): Promise<AttendeeStatus | null> {
  const { data, error } = await supabase
    .from('event_attendees')
    .select('status')
    .eq('event_id', eventId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw error;
  return (data?.status as AttendeeStatus | undefined) ?? null;
}

/**
 * Returns material rows the caller is allowed to see. Row level security already
 * restricts this to approved attendees and the event manager, so an empty result
 * is the correct outcome for an unauthorised account rather than an error.
 */
export async function listAccessibleMaterials(
  supabase: SupabaseClient,
  eventId: string,
): Promise<EventMaterial[]> {
  const { data, error } = await supabase
    .from('event_materials')
    .select('id, event_id, kind, title, storage_path')
    .eq('event_id', eventId);
  if (error) throw error;
  return (data ?? []) as EventMaterial[];
}

export function formatEventDate(value: string | null): string {
  if (!value) return 'Date to be confirmed';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

/**
 * Formats an instant in the event's own time zone. The offset is resolved by
 * Intl from the IANA zone, so daylight saving is handled rather than assumed.
 */
export function formatEventDateTimeInZone(
  value: string | null,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
): string {
  if (!value) return 'Date to be confirmed';
  return new Intl.DateTimeFormat('en-GB', { ...options, timeZone, hourCycle: 'h23' }).format(new Date(value));
}

export function formatEventTimeInZone(value: string, timeZone: string): string {
  return formatEventDateTimeInZone(value, timeZone, { hour: '2-digit', minute: '2-digit' });
}
