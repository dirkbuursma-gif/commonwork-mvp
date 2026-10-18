import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getEventBySlug,
  getMyAttendance,
  listAccessibleMaterials,
  type EventMaterial,
  type EventSummary,
} from '../events';

export type EventMaterialAccess =
  | { status: 'not-found' }
  | { status: 'forbidden' }
  | { status: 'available'; event: EventSummary; materials: EventMaterial[] };

export async function getEventMaterialAccess(
  supabase: SupabaseClient,
  slug: string,
  profileId: string,
): Promise<EventMaterialAccess> {
  const event = await getEventBySlug(supabase, slug);
  if (!event) return { status: 'not-found' };

  const isManager = event.manager_profile_id === profileId;
  const attendance = isManager ? null : await getMyAttendance(supabase, event.id, profileId);
  if (!isManager && attendance !== 'approved') return { status: 'forbidden' };

  const materials = await listAccessibleMaterials(supabase, event.id);
  return { status: 'available', event, materials };
}
