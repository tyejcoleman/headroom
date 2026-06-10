import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { headroomDir, ensureDir, atomicWriteJSON, readJSON } from './util.mjs';

// Pins: facts the agent (or user) marks as must-survive-VERBATIM. Compaction
// paraphrases, and paraphrase drift of hard constraints is a top failure mode; pins
// are re-injected word-for-word at SessionStart(source=compact). Capped and TTL'd so
// stale constraints don't haunt future sessions (ADR-12).

const pinsPath = () => join(headroomDir(), 'pins.json');
const MAX_PINS = 50;
const MAX_TEXT = 500;
const DEFAULT_TTL_HOURS = 7 * 24;

export function listPins(nowSec = Date.now() / 1000) {
  const pins = readJSON(pinsPath());
  if (!Array.isArray(pins)) return [];
  return pins.filter((p) => p && typeof p.text === 'string' && (!p.expires_at || p.expires_at > nowSec));
}

export function addPin(text, { ttl_hours, session_id } = {}, nowSec = Date.now() / 1000) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const ttl = typeof ttl_hours === 'number' && ttl_hours > 0 ? ttl_hours : DEFAULT_TTL_HOURS;
  const pin = {
    id: randomBytes(3).toString('hex'),
    text: text.trim().slice(0, MAX_TEXT),
    created_at: Math.round(nowSec),
    expires_at: Math.round(nowSec + ttl * 3600),
    session_id: session_id ?? null,
  };
  const pins = [...listPins(nowSec), pin].slice(-MAX_PINS);
  ensureDir(headroomDir());
  atomicWriteJSON(pinsPath(), pins);
  return pin;
}

/** Remove one pin by id, or all with '--all'. Returns how many were removed. */
export function removePins(idOrAll, nowSec = Date.now() / 1000) {
  const pins = listPins(nowSec);
  const keep = idOrAll === '--all' ? [] : pins.filter((p) => p.id !== idOrAll);
  ensureDir(headroomDir());
  atomicWriteJSON(pinsPath(), keep);
  return pins.length - keep.length;
}

export function renderPins(pins) {
  const shown = pins.slice(-20);
  return [
    `[headroom] pinned facts (${shown.length}) — re-injected verbatim; do not paraphrase or drop these:`,
    ...shown.map((p) => `- ${p.text}  (pin ${p.id})`),
    'When a pin is satisfied or obsolete, tell the user and run `headroom unpin <id>`.',
  ].join('\n');
}
