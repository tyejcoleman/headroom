import { createInterface } from 'node:readline';
import { readState } from './state.mjs';
import { fitCheck, estimateRemaining } from './fit.mjs';

// Minimal stdio MCP server (newline-delimited JSON-RPC 2.0). Read-only over
// ~/.headroom/state.json: no writes, no network, no dependencies.

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
          serverInfo: { name: 'headroom', version: '0.1.0' },
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
      if (!state) {
        result = { error: 'no ResourceState collected yet — install the statusline tap (headroom install) and use Claude Code once' };
      } else if (name === 'resource_state') {
        result = state;
      } else if (name === 'estimate_remaining') {
        result = estimateRemaining(state);
      } else {
        result = fitCheck(state, args);
      }
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 1) }] } });
    } else if (id !== undefined && method) {
      send({ jsonrpc: '2.0', id, result: {} }); // ping & friends
    }
    // notifications (no id) are ignored
  });
}
