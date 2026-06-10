import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readState } from './state.mjs';
import { fitCheck, estimateRemaining } from './fit.mjs';
import { planResume } from './resume.mjs';
import { addPin } from './pins.mjs';
import { logEvent } from './events.mjs';

// package.json is the single source of truth for the version (see /release procedure)
const pkg = JSON.parse(readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), 'package.json'), 'utf8'));

// Minimal stdio MCP server (newline-delimited JSON-RPC 2.0). No network, no
// dependencies. Read-only over ~/.headroom/state.json, with one deliberate write
// surface: plan_resume records a deferred-work plan to ~/.headroom/resume.json.

const TOOLS = [
  {
    name: 'resource_state',
    description:
      'Full current ResourceState: rate-limit windows (5h/7d remaining, reset times), context headroom (tokens before the compaction ceiling), burn rate, session cost. Use to ground planning in actual budgets.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'estimate_remaining',
    description:
      'Projections from the burn model: % left and minutes to reset per window, projected exhaustion time, context tokens left before compaction.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'fit_check',
    description:
      'Check whether work estimated at est_tokens (optionally est_calls) fits current budgets. Returns fits | tight | exceeds | defer per budget, plus advice. Call before starting sizable tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        est_tokens: { type: 'number', description: 'estimated tokens the work will consume (read+write)' },
        est_calls: { type: 'number', description: 'estimated tool calls (optional)' },
      },
      required: ['est_tokens'],
    },
  },
  {
    name: 'plan_resume',
    description:
      'Record a resume plan for work deferred past the rate-limit reset (use after fit_check says defer). Headroom shows a countdown in the HUD and flags the work as ready in prompt stamps once the window resets.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'what to resume and where to pick it up (one or two sentences)' },
        est_tokens: { type: 'number', description: 'estimated tokens the deferred work needs (optional)' },
      },
      required: ['summary'],
    },
  },
  {
    name: 'pin_fact',
    description:
      'Pin a fact that must survive context compaction VERBATIM — hard user constraints, deadlines, exact values ("no deploys before June 16", a port, an invariant). Re-injected word-for-word after every compaction until it expires (default 7 days) or is unpinned. Pin sparingly: only sentences whose exact wording matters.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'the fact, in one sentence, exactly as it must be re-injected' },
        ttl_hours: { type: 'number', description: 'hours until the pin expires (default 168 = 7 days)' },
      },
      required: ['text'],
    },
  },
];

export function mcpServe() {
  const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
  const rl = createInterface({ input: process.stdin });

  rl.on('line', (line) => {
    line = line.trim();
    if (!line) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const { id, method, params } = msg;

    if (method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'headroom', version: pkg.version },
        },
      });
    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    } else if (method === 'tools/call') {
      const name = params?.name;
      const args = params?.arguments ?? {};
      if (!TOOLS.some((t) => t.name === name)) {
        send({ jsonrpc: '2.0', id, error: { code: -32602, message: `unknown tool: ${name}` } });
        return;
      }
      const state = readState();
      let result;
      if (name === 'pin_fact') {
        // works without state — pinning must never depend on the tap being live
        const pin = addPin(args.text, { ttl_hours: args.ttl_hours });
        result = pin
          ? { pinned: true, id: pin.id, text: pin.text, expires_at: pin.expires_at }
          : { pinned: false, error: 'text (non-empty string) is required' };
      } else if (!state) {
        result = { error: 'no ResourceState collected yet — install the statusline tap (headroom install) and use Claude Code once' };
      } else if (name === 'resource_state') {
        result = { ...state, age_seconds: Math.max(0, Math.round(Date.now() / 1000 - state.updated_at)) };
      } else if (name === 'estimate_remaining') {
        result = estimateRemaining(state);
      } else if (name === 'plan_resume') {
        result = planResume(args, state);
      } else {
        result = fitCheck(state, args);
      }
      // every consult is a steering signal — audit it (headroom audit)
      logEvent({
        type: 'mcp_call',
        tool: name,
        verdict: result?.overall ?? (result?.recorded != null ? 'recorded' : null) ?? (result?.pinned != null ? 'pinned' : null),
      });
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 1) }] } });
    } else if (id !== undefined && method) {
      send({ jsonrpc: '2.0', id, result: {} }); // ping & friends
    }
    // notifications (no id) are ignored
  });
}
