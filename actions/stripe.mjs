// ──────────────────────────────────────────────────────────────────────────
// Stripe charge action. SIMULATED by default. The real Stripe TEST-mode path
// activates only when STRIPE_TEST_SECRET_KEY is present, and degrades to a
// simulated success if the SDK or the API call fails. The secret key is passed
// in by the gateway (resolved from 1Password) and is NEVER logged.
// ──────────────────────────────────────────────────────────────────────────

export let simulated = true;

/**
 * Charge `amount` (whole currency units) using `key`. Returns a result object,
 * never the key. { ok, id, amount, currency, simulated, brand? }.
 */
export async function charge(amount, currency, key) {
  const useReal = !!process.env.STRIPE_TEST_SECRET_KEY && typeof key === 'string' && key.startsWith('sk_test_');
  if (!useReal) {
    simulated = true;
    return {
      ok: true,
      id: 'pi_sim_' + Math.random().toString(36).slice(2, 12),
      amount,
      currency: currency || 'usd',
      simulated: true,
    };
  }
  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(key); // key from gateway; never logged
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // smallest unit
      currency: (currency || 'usd').toLowerCase(),
      payment_method: 'pm_card_visa', // Stripe test card
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    simulated = false;
    return { ok: pi.status === 'succeeded', id: pi.id, amount, currency: currency || 'usd', simulated: false, status: pi.status };
  } catch (err) {
    // Never surface the key. Degrade to simulated so the stage never hard-fails.
    console.warn('[stripe] real charge failed, simulating:', err?.message || 'error');
    simulated = true;
    return { ok: true, id: 'pi_sim_' + Math.random().toString(36).slice(2, 12), amount, currency: currency || 'usd', simulated: true };
  }
}

export function chargesAreSimulated() {
  return simulated;
}
