// ──────────────────────────────────────────────────────────────────────────
// APS x 1Password demo gateway. Judge AND executor. Composes the PUBLIC SDK
// primitives only (no private @aeoess/gateway). This process is the ONLY holder
// of any 1Password token.
//
// Absolute rules enforced here:
//   1. A resolved secret is NEVER returned to an agent or any LLM context. The
//      gateway resolves it, runs the side effect, and returns only the result.
//   2. Every allow/deny decision is deterministic delegation math (enforce.mjs),
//      never LLM output.
// ──────────────────────────────────────────────────────────────────────────
import express from 'express';
import { traceBeneficiary } from 'agent-passport-system';
import { buildScenario, processAction, OP_REF, VENDOR_PAYLOAD } from '../agents/scenario.mjs';
import { resolveSecret, secretsAreMocked } from './onepassword.mjs';
import { charge, chargesAreSimulated } from '../actions/stripe.mjs';
import { llmMode } from '../agents/llm.mjs';
import { runScenario } from '../agents/loop.mjs';

const PORT = Number(process.env.GATEWAY_PORT || 8787);
const DEMO_MODE = (process.env.DEMO_MODE || 'scripted').toLowerCase();

// ── In-memory state (no localStorage, no DB). Rebuilt on /reset. ──
let scenario = buildScenario();
let spent = new Map();        // delegationId -> cumulative spend
let receipts = [];            // signed receipts so far
let events = [];              // decision/reasoning event log (for late SSE joiners)
const sseClients = new Set();

function emit(ev) {
  const stamped = { t: new Date().toISOString(), ...ev };
  events.push(stamped);
  const payload = `data: ${JSON.stringify(stamped)}\n\n`;
  for (const res of sseClients) { try { res.write(payload); } catch { /* client gone */ } }
}

// Reverse lookups so /act can map raw {agentId, delegationId} to the scenario.
function keysFor(agentId, delegationId) {
  const dKey = Object.entries(scenario.delegations).find(([, d]) => d.delegationId === delegationId)?.[0];
  const aKey = Object.entries(scenario.identities).find(([, kp]) => kp.publicKey === agentId)?.[0];
  return { dKey, aKey };
}

function modeBanner() {
  return {
    demoMode: DEMO_MODE,
    mockSecrets: secretsAreMocked(),
    simulatedStripe: chargesAreSimulated(),
    agentLlm: llmMode(),
    opRef: OP_REF,
  };
}

const app = express();
app.use(express.json());
// Permissive CORS for the local Vite dev server. Local demo only.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'content-type');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── POST /act — the single decision + execution point ──
app.post('/act', async (req, res) => {
  const { agentId, delegationId, scopeUsed, spend } = req.body || {};
  const { dKey, aKey } = keysFor(agentId, delegationId);
  if (!dKey || !aKey) {
    return res.status(400).json({ allowed: false, reason: 'unknown_agent_or_delegation' });
  }
  // Build a beat-shaped action and run it through the SHARED core. The gateway
  // supplies the REAL (or gracefully-degraded) secret resolver and charger.
  const beat = { id: req.body.beatId ?? 0, title: req.body.title || scopeUsed, agentKey: aKey, delegationKey: dKey, scopeUsed, spend };
  const ev = await processAction(scenario, beat, { spent, resolveSecret, charge });

  if (ev.allowed) {
    receipts.push(ev.receipt);
    emit({ type: 'decision', allowed: true, beat: ev.beat, title: ev.title, agent: ev.agent,
      scopeUsed: ev.scopeUsed, spend: ev.spend, secretMocked: ev.secretMocked,
      agentSaw: ev.agentSaw, gatewayResolved: ev.gatewayResolved, charge: ev.charge,
      receiptIndex: receipts.length - 1, receipt: ev.receipt });
    return res.json({ allowed: true, receipt: ev.receipt, receiptIndex: receipts.length - 1, charge: ev.charge });
  }
  emit({ type: 'decision', allowed: false, beat: ev.beat, title: ev.title, agent: ev.agent,
    reason: ev.reason, detail: ev.detail, scopeUsed: ev.scopeUsed, spend: ev.spend,
    agentSaw: ev.agentSaw });
  return res.json({ allowed: false, reason: ev.reason, detail: ev.detail });
});

// ── POST /trace — attribution back to the human beneficiary ──
app.post('/trace', (req, res) => {
  const idx = req.body?.receiptIndex ?? 0;
  const receipt = receipts[idx];
  if (!receipt) return res.status(404).json({ error: 'no such receipt' });
  const t = traceBeneficiary(receipt, scenario.allDelegations, scenario.beneficiaryMap);
  const out = { executorAgent: t.executorAgent, beneficiary: t.beneficiary, totalDepth: t.totalDepth, verified: t.verified };
  emit({ type: 'attribution', ...out, receiptIndex: idx });
  return res.json(out);
});

// ── GET /tree — delegation tree + per-node scope/budget/spent ──
app.get('/tree', (req, res) => {
  const nodes = scenario.tree.map((n) => ({
    ...n,
    agent: n.agent.slice(0, 12) + '...',
    spent: n.delegationId ? (spent.get(n.delegationId) ?? 0) : 0,
    remaining: n.spendLimit != null ? n.spendLimit - (spent.get(n.delegationId) ?? 0) : null,
  }));
  res.json({ tree: nodes, mode: modeBanner() });
});

// ── GET /receipts — signed receipts so far ──
app.get('/receipts', (req, res) => res.json({ receipts }));

// ── GET /scenario — identities + the four beats + injected payload (UI setup) ──
app.get('/scenario', (req, res) => {
  res.json({
    identities: Object.fromEntries(Object.entries(scenario.identities).map(([k, v]) => [k, v.publicKey.slice(0, 12) + '...'])),
    delegations: Object.fromEntries(Object.entries(scenario.delegations).map(([k, d]) => [k, { delegationId: d.delegationId, scope: d.scope, spendLimit: d.spendLimit ?? null }])),
    beats: scenario.beats,
    vendorPayload: VENDOR_PAYLOAD,
    mode: modeBanner(),
  });
});

app.get('/mode', (req, res) => res.json(modeBanner()));

// ── GET /events — SSE stream of decisions ──
app.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.set('Access-Control-Allow-Origin', '*');
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ type: 'hello', mode: modeBanner() })}\n\n`);
  // Replay events so a late-joining UI sees the full run.
  for (const ev of events) res.write(`data: ${JSON.stringify(ev)}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ── POST /run — drive the four beats through the gateway over HTTP ──
let running = false;
app.post('/run', async (req, res) => {
  if (running) return res.status(409).json({ error: 'already running' });
  running = true;
  res.json({ started: true, mode: modeBanner() });
  try {
    await runScenario({
      baseUrl: `http://localhost:${PORT}`,
      scenario,
      demoMode: DEMO_MODE,
      emit, // loop emits 'reasoning' events; /act + /trace emit decisions
    });
  } catch (err) {
    emit({ type: 'error', message: err?.message || String(err) });
  } finally {
    running = false;
    emit({ type: 'done' });
  }
});

// ── POST /reset — fresh scenario, clear state ──
app.post('/reset', (req, res) => {
  scenario = buildScenario();
  spent = new Map();
  receipts = [];
  events = [];
  emit({ type: 'reset' });
  res.json({ ok: true, mode: modeBanner() });
});

app.listen(PORT, () => {
  const m = modeBanner();
  console.log(`[gateway] listening on http://localhost:${PORT}`);
  console.log(`[gateway] mode: demo=${m.demoMode} secrets=${m.mockSecrets ? 'mock' : 'REAL'} stripe=${m.simulatedStripe ? 'simulated' : 'REAL-test'} agents=${m.agentLlm}`);
});
