// ──────────────────────────────────────────────────────────────────────────
// Agent loop. Drives orchestrator / payer / researcher through the four beats.
// Agents REASON via agents/llm.mjs, but EVERY consequential action is an HTTP
// call to the gateway (POST /act, POST /trace). Agents receive only results;
// they never hold a secret and never make the allow/deny decision.
//
// Used by the gateway's POST /run. In DEMO_MODE=scripted (default), reasoning
// is forced scripted (zero external dependency). In DEMO_MODE=live it uses the
// configured AGENT_LLM adapter.
// ──────────────────────────────────────────────────────────────────────────
import { reason } from './llm.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runScenario({ baseUrl, scenario, demoMode = 'scripted', emit = () => {} }) {
  const force = demoMode === 'live' ? undefined : 'scripted';

  for (const beat of scenario.beats) {
    if (beat.kind === 'attribution') {
      const r = await reason({ role: 'orchestrator', intent: 'attribute the executed action back to the human' }, { force });
      emit({ type: 'reasoning', beat: beat.id, agent: 'orchestrator', text: r.text, via: r.via });
      await fetch(`${baseUrl}/trace`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ receiptIndex: 0 }),
      }).catch(() => {});
      await sleep(600);
      continue;
    }

    const role = beat.agentKey;
    const intent = beat.spend ? `${beat.scopeUsed} $${beat.spend.amount}` : beat.scopeUsed;
    const r = await reason({ role, intent }, { force });
    emit({ type: 'reasoning', beat: beat.id, agent: role, text: r.text, via: r.via, injection: beat.injection || null });

    const agentId = scenario.identities[beat.agentKey].publicKey;
    const delegationId = scenario.delegations[beat.delegationKey].delegationId;

    // The ONLY consequential action: a real HTTP call to the gateway.
    const resp = await fetch(`${baseUrl}/act`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId, delegationId, scopeUsed: beat.scopeUsed, spend: beat.spend, beatId: beat.id, title: beat.title }),
    }).catch(() => null);
    // Agent sees only the result envelope, never a secret.
    if (resp) await resp.json().catch(() => ({}));
    await sleep(900);
  }
}
