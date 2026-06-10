// Payments service — already on v2; stable, do not modify during T1
export function getPayment(id, db) {
  const p = db.payments.get(id);
  if (!p) return { status: 404, body: { error: 'not found' } };
  return { status: 200, body: p };
}

export function createPayment(body, db) {
  if (!body?.amount || !body?.currency || !body?.user_id) {
    return { status: 400, body: { error: 'amount, currency, user_id required' } };
  }
  const id = `pay_${Math.random().toString(36).slice(2, 9)}`;
  const payment = { id, ...body, created_at: new Date().toISOString() };
  db.payments.set(id, payment);
  return { status: 201, body: payment };
}
