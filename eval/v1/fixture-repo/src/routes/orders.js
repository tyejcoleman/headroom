import { requireAuth } from '../auth/middleware.js';
import { paginate } from '../util/paginate.js';
import { listOrders } from '../store.js';

/** GET /v2/orders?page=&per_page= — only the caller's own orders. */
export function getOrders(req) {
  const session = requireAuth(req);
  const page = Number(req.query.page ?? 1);
  const perPage = Number(req.query.per_page ?? 20);
  const mine = listOrders().filter((o) => o.userId === session.userId);
  return {
    orders: paginate(mine, page, perPage),
    count: mine.length,
    page,
  };
}
