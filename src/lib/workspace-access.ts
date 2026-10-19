export type WorkspaceAccessClient = { rpc(name: 'can_access_member_workspace'): PromiseLike<{ data: unknown; error: unknown }> };
export async function readWorkspaceAccess(client: WorkspaceAccessClient): Promise<boolean> {
  try { const result = await client.rpc('can_access_member_workspace'); return result.error === null && result.data === true; }
  catch { return false; }
}
// Exemption from the workspace gate is not event authorization.
const resourcePath = /^\/events\/(?!manage(?:\/|$))[a-z0-9]+(?:-[a-z0-9]+)*(?:\/(?:presentation|guide(?:\/print)?))?\/?$/;
const posts = new Set(['/api/events/attendance', '/api/events/material', '/api/auth/sign-out']);
export function isEventResourceRequest(path: string, method: string): boolean {
  if (method === 'GET' || method === 'HEAD') return resourcePath.test(path) || path === '/api/events/video';
  return method === 'POST' && posts.has(path);
}
