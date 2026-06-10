import { requireAuth } from '../auth/middleware.js';
import { paginate } from '../util/paginate.js';
import { listUsers } from '../store.js';

/** GET /v2/users?page=&per_page= */
export function getUsers(req) {
  requireAuth(req);
  const page = Number(req.query.page ?? 1);
  const perPage = Number(req.query.per_page ?? 20);
  const all = listUsers();
  return {
    users: paginate(all, page, perPage),
    count: all.length,
    page,
  };
}
