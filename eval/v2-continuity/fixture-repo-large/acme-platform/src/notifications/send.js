// Notifications — still on v1 format; migration pending T3
export function sendNotification(body) {
  if (!body?.user_id || !body?.message) return { status: 400, body: { error: 'user_id and message required' } };
  // In production this would enqueue a job; for tests we just return success
  return { status: 200, body: { queued: true } };
}
