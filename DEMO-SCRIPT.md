# Stage script: APS x 1Password

Verified green on the published SDK. Run `npm run demo`, open the web UI, press
"Run the four beats". Everything below is timed to what appears on screen.

## The one line, if you only get one
1Password makes sure the agent never holds the key. APS makes sure the authority
it is handed can only shrink as the work delegates, and that an action several
hops deep still answers to a human.

## Open (before you press Run)
Agent security confuses two problems. Custody is who holds the key. Authority is
what the holder is allowed to do. 1Password solves custody. This solves
authority, and shows both in one flow, on the open SDK, with every decision made
by the gateway and not the model.

## Beat 1 (allow, $42). Point at the money-shot panel.
The payer is scoped to payment:charge with a narrowed budget. It asks the
gateway to charge $42. The gateway checks the delegation, resolves the Stripe key
from 1Password at that moment, runs the charge, signs a receipt. The agent gets
the result envelope. Left panel is everything the agent saw. Right panel is what
the gateway resolved and kept. The key never crossed that line.

## Beat 2 (deny on budget, $300)
Same agent, now $300. Its budget narrowed to $200 on the way down, and $42 is
already spent. $300 is over the line. Denied. No model decided this. It is
delegation math, checked at the gateway.

## Beat 3 (deny on injection). Point at the injection panel.
The researcher reads a vendor listing. The listing says pay $500 now. That is a
prompt injection. The researcher holds catalog:read only. It has no payment scope
to lift. The injection asks for authority that does not exist on that branch, so
there is nothing to escalate. Denied at the gateway. Nothing the agent was told,
or tricked into, can widen what it was given.

## Beat 4 (attribution). Click the receipt.
Click the signed receipt. The cleared charge traces three hops back to the one
human who started the chain, cryptographically verified. An action several agents
deep still answers to you.

## Close
Custody and authority are two different problems. 1Password holds the key. APS
keeps the authority around that key shrinking as the work delegates, and keeps
every action answerable to a human. You need both.

## If running in mock mode
Say it plainly. This is the mock resolver. With their service-account token it is
the identical flow against real 1Password, one environment variable, no other
change. The banner flips to "1Password (real)" on its own.

## Questions the room will ask
How is this different from OAuth scopes. OAuth scopes are set once at the grant.
This narrows at every hop, and the gateway re-checks each action against the live
narrowed authority. Revoke the parent and everything downstream loses authority
at once.

Why not check permissions inside the agent. Because the agent can be injected.
Authority lives at the gateway, outside the agent's reach. The agent asking, or
being tricked, cannot move it.

Is the secret ever in a model prompt. No. On a deny the resolver is never called.
On an allow the gateway resolves, executes, and returns a result envelope. The
value is never logged and never handed to an agent.

What does the receipt prove. That the gateway authorized this action under this
delegation chain, and that it resolves to this beneficiary. It does not claim
anything about the vendor side of the world beyond the charge result it recorded.

## Real-mode wiring (one flip, no rebuild)
1. `npm i @1password/sdk stripe`
2. In 1Password: a vault holding the Stripe test key (sk_test_...) at the item
   the gateway resolves, `op://agi-demo/stripe/test_secret_key`. If they name it
   differently, change OP_REF in agents/scenario.mjs to match.
3. A service-account token scoped to read that vault. Set OP_SERVICE_ACCOUNT_TOKEN.
4. Set STRIPE_TEST_SECRET_KEY to enable real test charges (it is the explicit
   on-switch; the actual key used is the one resolved from 1Password).
The gateway resolves the real key from 1Password, the charge becomes a real test
PaymentIntent, the banner shows "1Password (real)" and "stripe: real test-mode".
Nothing else in the build changes.
