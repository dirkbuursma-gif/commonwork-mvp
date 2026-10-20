import type { APIRoute } from 'astro';
import { eventCodeAccessEnabled, readEventAccessForm, readEventCodeAccess } from '../../../lib/events/event-code-server';
import { deliveryError, streamEventObject } from '../../../lib/events/object-delivery';
import { readVideoDeliveryConfiguration } from '../../../lib/events/video-delivery-configuration';
export const prerender = false;
export const POST: APIRoute = async (context) => {
  if (!eventCodeAccessEnabled()) return deliveryError('Event code access is not available.', 404);
  if (context.request.headers.get('origin') !== context.url.origin) return deliveryError('Cross-origin form submission rejected.', 403);
  let form: URLSearchParams;
  try { form = await readEventAccessForm(context.request); } catch { return deliveryError('Invalid material request.', 400); }
  const slug = form.get('event_slug') ?? '';
  const id = form.get('material_id') ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return deliveryError('Invalid material reference.', 400);
  try {
    const access = await readEventCodeAccess(context, slug);
    if (!access) return deliveryError('An event access code is required.', 401);
    const material = access.materials.find((item) => item.id === id && item.event_id === access.event.id);
    if (!material) return deliveryError('Event material not found.', 404);
    return streamEventObject({ request: context.request, eventId: access.event.id, path: material.storage_path }, { configuration: readVideoDeliveryConfiguration });
  } catch { return deliveryError('Event material delivery is unavailable.', 503); }
};
