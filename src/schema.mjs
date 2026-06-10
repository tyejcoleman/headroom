// Hand-rolled ResourceState v0 validation (zero-dep). The canonical JSON Schema lives at
// schema/resource-state.schema.json; this checker mirrors it for runtime/test use.

const isPct = (v) => v === null || (typeof v === 'number' && v >= 0 && v <= 100);
const isEpoch = (v) => v === null || (Number.isInteger(v) && v >= 0);

/** Returns an array of error strings; empty means valid. */
export function validateResourceState(s) {
  const errors = [];
  const err = (m) => errors.push(m);

  if (!s || typeof s !== 'object') return ['not an object'];
  if (s.schema !== 'resource-state/v0') err('schema must be "resource-state/v0"');
  if (!Number.isInteger(s.updated_at) || s.updated_at < 0) err('updated_at must be a non-negative integer');
  if (typeof s.provider !== 'string') err('provider must be a string');
  if (s.auth !== undefined && !['subscription', 'api_key', 'unknown'].includes(s.auth)) err('auth invalid');

  if (!s.windows || typeof s.windows !== 'object') {
    err('windows must be an object');
  } else {
    for (const key of Object.keys(s.windows)) {
      if (!['five_hour', 'seven_day'].includes(key)) {
        err(`windows: unknown key ${key}`);
        continue;
      }
      const w = s.windows[key];
      if (!w || typeof w !== 'object') err(`windows.${key} must be an object`);
      else {
        if (!isPct(w.used_pct ?? null)) err(`windows.${key}.used_pct out of range`);
        if (!isEpoch(w.resets_at ?? null)) err(`windows.${key}.resets_at invalid`);
      }
    }
  }

  if (s.context !== null && s.context !== undefined) {
    const c = s.context;
    if (typeof c !== 'object') err('context must be object or null');
    else {
      if (c.window_size !== null && (!Number.isInteger(c.window_size) || c.window_size < 1)) err('context.window_size invalid');
      if (!isPct(c.used_pct ?? null)) err('context.used_pct out of range');
      if (typeof c.compact_ceiling_pct !== 'number' || c.compact_ceiling_pct < 1 || c.compact_ceiling_pct > 100) err('context.compact_ceiling_pct invalid');
      if (c.tokens_to_ceiling !== null && (!Number.isInteger(c.tokens_to_ceiling) || c.tokens_to_ceiling < 0)) err('context.tokens_to_ceiling invalid');
    }
  }

  if (s.burn) {
    if (s.burn.pct_per_hour !== null && typeof s.burn.pct_per_hour !== 'number') err('burn.pct_per_hour invalid');
    if (!isEpoch(s.burn.projected_exhaustion ?? null)) err('burn.projected_exhaustion invalid');
  }
  if (s.session && s.session.cost_usd !== null && (typeof s.session.cost_usd !== 'number' || s.session.cost_usd < 0)) err('session.cost_usd invalid');

  return errors;
}
