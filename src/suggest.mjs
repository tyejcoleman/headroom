import { recentEvents } from './events.mjs';

// `headroom suggest` — the propose-only seed of the self-evolving harness (docs/SUGGEST.md).
// The MINER: deterministic, zero-dep, no model. It turns the telemetry we already collect
// (events.jsonl) into ranked, evidence-backed friction signals. Synthesis (drafting the
// actual evolution) is the agent's job — this only finds and ranks the friction.

const HALFLIFE_SEC = 3 * 86400; // recency: friction 3 days ago counts half as much
const MIN_SUPPORT = 3; // below this it's an incident, not a pattern

// Friction detector registry — the extension point. A new sensor adds a detector here and
// nothing else changes. cost() is in tokens where knowable, else a nominal weight.
const DETECTORS = [
  {
    class: 'context-cliff',
    match: (e) => e.type === 'context_drop',
    signature: () => 'silent-trim',
    cost: (e) => e.dropped_tokens || 30000,
    intervention:
      'Context is being silently trimmed (microcompaction). Propose a skill nudge to checkpoint earlier, or lower compact_ceiling_pct so headroom warns sooner.',
  },
  {
    class: 'install-health',
    match: (e) => e.type === 'stamp_skipped',
    signature: (e) => e.reason || 'skipped',
    cost: () => 1,
    intervention:
      'Stamps are being suppressed (stale/missing state). Propose running `headroom doctor` — the tap likely is not rendering; the awareness loop is partly dark.',
  },
  {
    class: 'launch-pressure',
    match: (e) => e.type === 'launch_blocked',
    signature: (e) => e.tool || 'launch',
    cost: () => 40000,
    intervention:
      'Expensive launches keep hitting the gate near empty windows. Propose a smaller-default workflow for this launch, or pre-checkpoint + plan_resume before launching.',
  },
  {
    class: 'compaction-pressure',
    match: (e) => e.type === 'compact_blocked' || e.type === 'pre_compact',
    signature: () => 'compaction',
    cost: () => 5000,
    intervention:
      'Sessions compact often. Propose earlier checkpointing or a thinner context footprint (fewer/started-leaner skills); consider a /clear-after-reset habit.',
  },
  {
    class: 'expensive-operation',
    match: (e) => e.type === 'receipt' && (e.dpct || 0) >= 10,
    signature: (e) => e.tool || 'operation',
    cost: (e) => (e.dpct || 0) * 1000,
    intervention:
      'This operation repeatedly costs a large slice of the window. Propose batching it, a cheaper default, or a fit_check before it.',
  },
  {
    class: 'mid-turn-pressure',
    match: (e) => e.type === 'band_change' && e.held,
    signature: () => 'throttled',
    cost: () => 1,
    intervention:
      'Budget warnings are being throttled mid-turn (work outrunning the cadence). Propose powersave mode for this kind of session, or earlier deferral.',
  },
];

/** Stage 1-4: extract → cluster → score → map. Returns ranked friction signals. */
export function mineFriction(events, nowSec = Date.now() / 1000) {
  const buckets = new Map();
  for (const e of events || []) {
    if (!e || typeof e.at !== 'number') continue;
    for (const d of DETECTORS) {
      let hit = false;
      try {
        hit = d.match(e);
      } catch {
        hit = false;
      }
      if (!hit) continue;
      const sig = (() => {
        try {
          return String(d.signature(e));
        } catch {
          return '?';
        }
      })();
      const key = `${d.class}::${sig}`;
      if (!buckets.has(key)) buckets.set(key, { class: d.class, signature: sig, intervention: d.intervention, events: [], cost: 0 });
      const b = buckets.get(key);
      b.events.push(e.at);
      b.cost += Number(d.cost(e)) || 0;
    }
  }

  const ranked = [];
  for (const b of buckets.values()) {
    const support = b.events.length;
    if (support < MIN_SUPPORT) continue; // noise floor
    const recencyWeighted = b.events.reduce((s, at) => s + Math.exp(-Math.max(0, nowSec - at) / HALFLIFE_SEC), 0);
    const costAmp = 1 + Math.log10(1 + b.cost / 1000);
    const score = recencyWeighted * costAmp;
    ranked.push({
      class: b.class,
      signature: b.signature,
      support,
      score: Math.round(score * 100) / 100,
      cost_estimate: Math.round(b.cost),
      first_seen: Math.min(...b.events),
      last_seen: Math.max(...b.events),
      evidence: b.events.slice(-3),
      intervention: b.intervention,
    });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

const clock = (sec) => {
  const d = new Date(sec * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fmtTok = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

/** Stage 5: render the ranked signals as a markdown report + synthesis protocol. */
export function renderSuggestions(ranked, { windowDays } = {}) {
  if (!ranked.length) {
    return `headroom suggest — no recurring friction found in the last ${windowDays} days.\nThat means the harness is fitting your work well, or there isn't enough telemetry yet (use Claude Code with headroom installed, then re-run).`;
  }
  const lines = [
    `# headroom suggest — ${ranked.length} friction pattern${ranked.length > 1 ? 's' : ''} (last ${windowDays} days)`,
    '',
    'Ranked by recency-weighted recurrence × cost. Each is a candidate harness evolution.',
    'Nothing is applied — this is a proposal report (ADR-17).',
    '',
  ];
  ranked.forEach((r, i) => {
    lines.push(
      `## ${i + 1}. ${r.class} — \`${r.signature}\`  (score ${r.score})`,
      `- seen **${r.support}×**, last ${clock(r.last_seen)}, est. cost ≈${fmtTok(r.cost_estimate)} tokens`,
      `- evidence: ${r.evidence.map(clock).join(' · ')}`,
      `- candidate evolution: ${r.intervention}`,
      ''
    );
  });
  lines.push(
    '---',
    '## Synthesis protocol (for the agent)',
    'Take the top signal and draft ONE concrete, minimal evolution artifact:',
    '1. Pick the kind: skill nudge · workflow · pin · config tweak · removal.',
    '2. Write it as small as possible (thinness is the fitness function — every line must earn its context cost).',
    '3. Cite the evidence above as the rationale (no vibes).',
    '4. Propose the validation: the eval or check that would prove it helps before it is adopted (ADR-9).',
    '5. Present it to the user for approval. Do NOT apply it — `suggest` and synthesis are propose-only.'
  );
  return lines.join('\n');
}

export function suggest(argv = []) {
  const i = argv.indexOf('--since');
  const windowDays = i >= 0 && argv[i + 1] ? Math.max(1, Number(argv[i + 1]) || 14) : 14;
  const nowSec = Date.now() / 1000;
  const events = recentEvents(windowDays * 86400, nowSec);
  const ranked = mineFriction(events, nowSec);
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ window_days: windowDays, signals: ranked }, null, 2));
  } else {
    console.log(renderSuggestions(ranked, { windowDays, nowSec }));
  }
}
