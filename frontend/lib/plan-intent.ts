export type PlanTier = 'starter' | 'pro' | 'enterprise';
export type BillingInterval = 'month' | 'year';

export interface PlanIntent {
  tier: PlanTier;
  interval: BillingInterval;
  savedAt: number;
}

const STORAGE_KEY = 'bluecollar.plan_intent';
const TTL_MS = 24 * 60 * 60 * 1000;

const VALID_TIERS: PlanTier[] = ['starter', 'pro', 'enterprise'];

/**
 * Remembers which plan a visitor picked on the marketing site so it survives the
 * signup and onboarding detour and can be turned into a Stripe Checkout session
 * at the end.
 *
 * Needed because /api/billing/checkout requires an authenticated business, so an
 * anonymous visitor clicking "Get started" cannot go straight to Stripe. The
 * landing CTAs previously just pointed at /login and the choice was lost
 * entirely.
 *
 * Stored in localStorage rather than a cookie: it is a UI preference, not a
 * credential, and it must not be sent to the server on every request.
 */
export const savePlanIntent = (tier: string, interval: string): void => {
  if (typeof window === 'undefined') return;
  if (!VALID_TIERS.includes(tier as PlanTier)) return;

  const intent: PlanIntent = {
    tier: tier as PlanTier,
    interval: interval === 'year' ? 'year' : 'month',
    savedAt: Date.now(),
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(intent));
  } catch {
    // Private browsing or a full quota. The flow still works, the visitor just
    // picks their plan again on the billing page.
  }
};

export const readPlanIntent = (): PlanIntent | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PlanIntent;
    if (!VALID_TIERS.includes(parsed.tier)) return null;

    // Expire stale intent so someone returning a week later is not silently
    // pushed into a plan they no longer remember choosing.
    if (!parsed.savedAt || Date.now() - parsed.savedAt > TTL_MS) {
      clearPlanIntent();
      return null;
    }

    return {
      tier: parsed.tier,
      interval: parsed.interval === 'year' ? 'year' : 'month',
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
};

export const clearPlanIntent = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal.
  }
};

/** Builds the signup URL that carries a chosen plan through registration. */
export const signupUrlForPlan = (tier: PlanTier, interval: BillingInterval): string =>
  `/signup?plan=${tier}&interval=${interval}`;
