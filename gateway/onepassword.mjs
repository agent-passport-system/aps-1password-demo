// ──────────────────────────────────────────────────────────────────────────
// 1Password secret resolution. This module, running inside the gateway, is the
// ONLY place a 1Password token is read. The resolved value is returned to the
// gateway caller and NEVER to an agent or any LLM context.
//
// Default = MOCK (no token, no network, no @1password/sdk import). The real
// path activates only when OP_SERVICE_ACCOUNT_TOKEN is set, and even then it
// degrades gracefully to mock if the SDK or the lookup fails, so the demo can
// never hard-fail on a credential.
// ──────────────────────────────────────────────────────────────────────────

let client = null;
let triedRealInit = false;

// Whether this process is operating in mock-secrets mode. The UI surfaces this
// so the demo is honest about what is real.
export let mockSecrets = true;

const MOCK_VALUE = 'sk_test_MOCK_5xR8...REDACTED_BY_GATEWAY';

async function getClient() {
  if (client || triedRealInit) return client;
  triedRealInit = true;
  const token = process.env.OP_SERVICE_ACCOUNT_TOKEN;
  if (!token) return null;
  try {
    // Dynamic import so a missing @1password/sdk never breaks the free path.
    const { createClient } = await import('@1password/sdk');
    client = await createClient({
      auth: token,
      integrationName: 'APS x 1Password demo',
      integrationVersion: '1.0.0',
    });
    mockSecrets = false;
    return client;
  } catch (err) {
    // Token set but SDK/init failed: degrade to mock rather than crash the stage.
    console.warn('[onepassword] real init failed, falling back to mock:', err?.message || err);
    return null;
  }
}

/**
 * Resolve an op:// reference to its secret value. Returns { value, mock }.
 * The caller (gateway) uses the value to run the side effect and then discards
 * it. Never log or return `value` to an agent.
 */
export async function resolveSecret(opRef) {
  const c = await getClient();
  if (!c) {
    mockSecrets = true;
    return { value: MOCK_VALUE, mock: true };
  }
  try {
    const value = await c.secrets.resolve(opRef);
    return { value, mock: false };
  } catch (err) {
    console.warn('[onepassword] resolve failed, falling back to mock:', err?.message || err);
    mockSecrets = true;
    return { value: MOCK_VALUE, mock: true };
  }
}

export function secretsAreMocked() {
  return mockSecrets;
}
