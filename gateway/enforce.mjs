// ──────────────────────────────────────────────────────────────────────────
// Deterministic enforcement core. Shared by the HTTP gateway and the scripted
// runner so both decide allow/deny with IDENTICAL math. This mirrors the
// gateway() decision in spine.mjs exactly: scope check via the SDK, then a
// cumulative budget check. No LLM is consulted. No secret is resolved here.
// ──────────────────────────────────────────────────────────────────────────
import { scopeAuthorizes } from 'agent-passport-system';

/**
 * Pure decision. Returns { allowed, reason?, detail? }.
 *   reason 'scope'  -> scopeUsed is not authorized by the delegation's scope
 *   reason 'budget' -> spend would exceed the delegation's narrowed remaining budget
 * spentSoFar is the cumulative amount already spent against this delegationId.
 */
export function decide({ delegation, scopeUsed, spend, spentSoFar = 0 }) {
  // a. scope — single source of truth in the SDK. Authority is checked here at
  //    the gateway, so nothing an agent was told (or injected with) can lift it.
  if (!scopeAuthorizes(delegation.scope, scopeUsed)) {
    return {
      allowed: false,
      reason: 'scope',
      detail: `'${scopeUsed}' not in scope [${delegation.scope.join(', ')}]`,
    };
  }
  // b. budget — cumulative, enforced by the gateway against the narrowed limit.
  if (spend) {
    const limit = delegation.spendLimit ?? Infinity;
    const remaining = limit - spentSoFar;
    if (spend.amount > remaining) {
      return {
        allowed: false,
        reason: 'budget',
        detail: `$${spend.amount} exceeds remaining $${remaining} (limit $${limit})`,
      };
    }
  }
  return { allowed: true };
}
