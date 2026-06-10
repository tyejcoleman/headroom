/** Returns the 1-based `page` of `items`, `perPage` at a time. */
export function paginate(items, page, perPage) {
  if (page < 1 || perPage < 1) throw new RangeError('page and perPage must be >= 1');
  const start = (page - 1) * perPage + 1;
  return items.slice(start, start + perPage);
}
