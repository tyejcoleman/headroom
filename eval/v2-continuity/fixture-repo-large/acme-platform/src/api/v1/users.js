// v1 users API — stable, do not modify
export function getUser(id, db) {
  const user = db.users.get(id);
  if (!user) return { status: 404, body: null };
  return { status: 200, body: { userId: user.id, userEmail: user.email } };
}
