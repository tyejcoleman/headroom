// v2 users API — routes only (no HTTP framework; pure handler functions for testability)

export function getUser(id, db) {
  const user = db.users.get(id);
  if (!user) return { status: 404, body: { error: 'not found' } };
  return { status: 200, body: { id: user.id, email: user.email, name: user.name } };
}

export function createUser(body, db) {
  if (!body?.email || !body?.name) return { status: 400, body: { error: 'email and name required' } };
  const id = `u_${Math.random().toString(36).slice(2, 9)}`;
  const user = { id, email: body.email, name: body.name, created_at: new Date().toISOString() };
  db.users.set(id, user);
  return { status: 201, body: user };
}

export function getUserProfile(id, db, { requester_id } = {}) {
  const user = db.users.get(id);
  if (!user) return { status: 404, body: { error: 'not found' } };
  if (requester_id && requester_id !== id) return { status: 403, body: { error: 'forbidden' } };
  return {
    status: 200,
    body: {
      id: user.id,
      email: user.email,
      name: user.name,
      address: user.address ?? null,
      preferences: user.preferences ?? null,
      created_at: user.created_at ?? null,
    },
  };
}
