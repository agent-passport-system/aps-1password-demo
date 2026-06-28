# CC BUILD PROMPT — APS x 1Password demo (AGI House, Agent Identity Build Day)

Paste this into a fresh Claude Code terminal. Mechanical build only. Do NOT push to
GitHub, do NOT post anywhere. This chat handles all git/posting/standards work.

## FREE AND CREDENTIAL-FREE — READ FIRST
This must build and run end to end with ZERO credentials and ZERO paid services.
- No paid API. The agents are SCRIPTED by default. Any LLM is optional and free only.
- 1Password is MOCKED by default; real path activates only if a token is present later.
- Stripe is SIMULATED by default; real test-mode activates only if a test key is present.
- Everything runs locally. No deploy. `npm run demo` works on a laptop with nothing set up.
Treat every credential below as an OPTIONAL UPGRADE layered on a working free build.

## Context
- Repo scaffolded at `~/aps-agi-demo`. `spine.mjs` runs GREEN and is the reference for
  the enforcement logic. Read it first and preserve its exact decision semantics.
- Built on PUBLISHED open SDK `agent-passport-system@2.9.0` + `@1password/sdk`.
  Do NOT import the private `@aeoess/gateway`. The demo's enforcement layer is local to
  this repo and composes public primitives only: scopeAuthorizes, scopeCovers,
  createDelegation, subDelegate, verifyDelegation, createReceipt, traceBeneficiary.
- This is a LIVE STAGE DEMO. Reliability beats features. Two absolute rules:
  (1) a resolved secret is NEVER returned to an agent or placed in any LLM context; the
  gateway resolves it, executes the side effect, returns only the result.
  (2) every allow/deny decision is deterministic delegation math, never LLM output.

## Build target: `npm run demo` brings up gateway + web, fully working, no creds needed.

Create under `~/aps-agi-demo`:

```
gateway/
  server.mjs       Express. THE ONLY holder of any 1Password token. Wraps spine.mjs logic.
                   Endpoints:
                     POST /act       {agentId, delegationId, scopeUsed, spend?} -> {allowed, receipt|reason}
                     GET  /tree      delegation tree + per-node scope/budget/spent
                     GET  /receipts  signed receipts so far
                     GET  /events    SSE stream of decisions for the UI
                   On allow: resolve op://agi-demo/stripe/test_secret_key, run actions/stripe.mjs,
                   then createReceipt. On deny: emit denial event, NO secret resolution.
                   Cumulative spend tracked in-memory per delegationId.
  onepassword.mjs  resolveSecret(opRef). If OP_SERVICE_ACCOUNT_TOKEN is set, use
                   @1password/sdk createClient + client.secrets.resolve. If NOT set, return a
                   mock value and set `mockSecrets:true`, surfaced in the UI. Default = mock.
actions/
  stripe.mjs       charge(amount, key). If STRIPE_TEST_SECRET_KEY present, real Stripe TEST
                   PaymentIntent with a test card. If not, return a simulated success object.
                   Never log the key. Default = simulated.
agents/
  llm.mjs          Pluggable LLM adapter, default 'scripted'. Adapters:
                     scripted  (DEFAULT) deterministic, no model, no network, FREE
                     ollama    local http://localhost:11434 (e.g. qwen2.5:3b / llama3.2:3b),
                               FREE, no key; use if `ollama` is running, else fall back to scripted
                     groq|gemini  optional free-tier hosted, OpenAI-compatible / Gemini API,
                               only if the user sets a free key; never required
                   Selected by env AGENT_LLM (default scripted). Agents NEVER receive secrets.
  scenario.mjs     Procurement scenario: identities, the narrowing chain, the 4 beats from
                   spine.mjs, plus the injected vendor-listing payload for the researcher beat.
                   Export runScripted() (cannot fail) and runLive() (uses whatever real
                   integrations are present).
  loop.mjs         Drives orchestrator + payer + researcher. Agents reason via agents/llm.mjs
                   but EVERY consequential action is an HTTP call to the gateway. Agents get
                   only results.
web/               Vite + React dashboard. Panels:
                     - Delegation tree, scope + budget per node, narrowing visible
                     - Live decision feed (allow green / deny red) with the receipt
                     - Injection beat highlighted: read-only agent blocked from paying
                     - Split panel: "what the agent saw" (no secret) vs "what the gateway
                       resolved" (op://... value hidden). This is the money shot.
                     - Attribution: click a receipt -> trace back to You (traceBeneficiary)
                     - A small banner showing current mode (mock secrets / simulated stripe /
                       scripted agents) so the demo is honest about what is real
                   No localStorage. In-memory only. Tailwind ok.
.env.example       All OPTIONAL: OP_SERVICE_ACCOUNT_TOKEN=, STRIPE_TEST_SECRET_KEY=,
                   AGENT_LLM=scripted, GROQ_API_KEY=, GEMINI_API_KEY=
package.json       scripts: "demo" (gateway + web via concurrently), "scripted", "spine"
README.md          one-screen run instructions + the on-stage one-liner (below)
```

## Hard requirements
- Fresh clone with NO env file must run: `npm install && npm run demo` brings up the full
  UI with mock secrets, simulated Stripe, scripted agents, and all four beats working.
- DEMO_MODE=scripted (default) runs runScripted() with zero external dependency. This is
  the guaranteed-safe stage path. DEMO_MODE=live uses whatever real integrations are set.
  Both produce the same four UI beats.
- Graceful degrade everywhere: no OP token -> mock secrets + banner; no Stripe key ->
  simulated charge; Ollama not running and no free key -> scripted agents. NEVER hard-fail
  on a missing credential.
- Deterministic decisions: gateway calls scopeAuthorizes + the budget check. The LLM, if
  any, never decides allow/deny.
- Reproduce all four spine beats in the UI: happy charge, budget deny, injection deny,
  attribution trace.

## Agent LLM, free options for the README (default needs none)
- Default: scripted. Nothing to install, nothing to pay, cannot fail.
- For real agent reasoning at zero cost: install Ollama and `ollama pull qwen2.5:3b`, then
  set AGENT_LLM=ollama. Runs locally, no key, no limits.
- Optional free-tier hosted if Ollama is too heavy for the machine: Groq or Google Gemini
  free tier, set the respective key and AGENT_LLM=groq|gemini. Never required for the demo.

## On-stage one-liner (put in README, do not change wording)
"1Password makes sure the agent never holds the key. APS makes sure that even the runtime
credential it is handed is scoped to an authority that can only shrink as the work
delegates, and that an action several hops deep still answers to the one human who started
it. Custody and authority are two different problems, and you need both."

## When done
Report: file tree created, `npm run demo` output on a clean env (mock/simulated/scripted),
DEMO_MODE=scripted verified, and confirmation the build needs no paid service. Do not push.
Do not post.
