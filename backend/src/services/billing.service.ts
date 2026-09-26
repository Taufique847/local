import Stripe from 'stripe';
import { Types } from 'mongoose';
import {
  Subscription,
  ISubscription,
  SubscriptionTier,
  BillingInterval,
  ENTITLED_STATUSES,
} from '../models/subscription.model';
import { Business } from '../models/business.model';
import { AppError } from '../types';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { InvoiceService } from './invoice.service';

export interface PlanDefinition {
  id: SubscriptionTier;
  name: string;
  badge?: string;
  description: string;
  monthlyPrice: number;
  annualPricePerMonth: number;
  annualTotalPrice: number;
  minutesAllocated: number;
  phoneNumbersAllocated: number;
  features: string[];
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, PlanDefinition> = {
  starter: {
    id: 'starter',
    name: 'Starter Plan',
    description: 'Perfect for solo operators and small HVAC / plumbing teams.',
    monthlyPrice: 299,
    annualPricePerMonth: 269.10,
    annualTotalPrice: 3229.20,
    minutesAllocated: 250,
    phoneNumbersAllocated: 1,
    features: [
      '250 AI Voice Minutes / month',
      '1 Dedicated Local Phone Number',
      'Sub-60s Speed-to-Lead SMS Recovery',
      'Sub-280ms Realtime Voice Engine (Alex AI)',
      'Direct Calendar Appointment Booking',
      'TCPA Quiet Hours & Opt-Out Guardrails',
      'Standard Email & In-App Support',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro Fleet Plan',
    badge: 'MOST POPULAR',
    description: 'For growing fleets (3-10 technicians) ready to automate dispatch and reviews.',
    monthlyPrice: 799,
    annualPricePerMonth: 719.10,
    annualTotalPrice: 8629.20,
    minutesAllocated: 700,
    phoneNumbersAllocated: 3,
    features: [
      '700 AI Voice Minutes / month',
      '3 Dedicated Local Dispatch Lines',
      'Everything in Starter Plan, plus:',
      'Smart Technician Dispatch & Skill Matching',
      '30-Min Windshield Drive-Time Buffer Guard',
      'Google 5-Star Reputation Shielding Engine',
      'Urgent 1-Star Owner Alert with 24h SLA Tracker',
      'Customer 360 & Property Memory (Equipment specs, gate codes)',
      'AI Conversation QA & Receptionist Coaching Hub',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise Scale',
    description: 'For multi-location commercial operators with high call volumes.',
    monthlyPrice: 1499,
    annualPricePerMonth: 1349.10,
    annualTotalPrice: 16189.20,
    minutesAllocated: 2000,
    phoneNumbersAllocated: 999, // Unlimited
    features: [
      '2,000+ AI Voice Minutes / month ($0.25/min overage)',
      'Unlimited Dedicated Phone Lines',
      'Everything in Pro Plan, plus:',
      'Custom RAG Business Knowledge Base & Pricing FAQs',
      '24/7 Dedicated AI Receptionist Instance',
      'Multi-Location Territory & Zip Code Routing',
      'Direct Two-Way Sync with ServiceTitan & Housecall Pro',
      'Executive SLA Breach Monitoring & Alerts',
      'Dedicated Account Manager & 99.9% Uptime SLA',
    ],
  },
};

const log = logger.child({ module: 'billing' });

export class BillingService {
  private static stripeClient: Stripe | null = config.stripeSecretKey
    ? new Stripe(config.stripeSecretKey, { apiVersion: '2023-10-16' as any })
    : null;

  public static isLive(): boolean {
    return this.stripeClient !== null;
  }

  /** Resolves the configured Stripe Price id for a tier + interval, if any. */
  private static resolvePriceId(tier: SubscriptionTier, interval: BillingInterval): string | undefined {
    const ids = config.stripePriceIds;
    const map: Record<string, string | undefined> = {
      'starter:month': ids.starterMonthly,
      'starter:year': ids.starterYearly,
      'pro:month': ids.proMonthly,
      'pro:year': ids.proYearly,
      'enterprise:month': ids.enterpriseMonthly,
      'enterprise:year': ids.enterpriseYearly,
    };
    return map[`${tier}:${interval}`];
  }

  /**
   * Returns all available subscription plans with pricing tiers
   */
  public static getPlans(): PlanDefinition[] {
    return Object.values(SUBSCRIPTION_PLANS);
  }

  /**
   * Retrieves the subscription for a business, creating a genuine FREE TRIAL
   * on first access.
   *
   * A previous version fabricated an `active` paid subscription with a fake
   * paid invoice for every business, so the dashboard showed every account as
   * a paying customer even though no payment had ever been taken. New accounts
   * now correctly start as `trialing` with an empty invoice history.
   */
  public static async getOrCreateSubscription(businessId: string | Types.ObjectId): Promise<ISubscription> {
    const bId = new Types.ObjectId(businessId.toString());
    let sub = await Subscription.findOne({ businessId: bId });

    if (!sub) {
      const trialPlan = SUBSCRIPTION_PLANS.starter;
      const trialEndsAt = new Date(Date.now() + config.trialDays * 24 * 60 * 60 * 1000);

      sub = await Subscription.create({
        businessId: bId,
        // Placeholder id until a real Stripe Customer is created at checkout.
        stripeCustomerId: `pending_${bId.toString()}`,
        tier: 'starter',
        status: 'trialing',
        billingInterval: 'month',
        amountUsd: trialPlan.monthlyPrice,
        minutesAllocated: Math.min(trialPlan.minutesAllocated, 100),
        minutesUsed: 0,
        phoneNumbersAllocated: 1,
        currentPeriodStart: new Date(),
        currentPeriodEnd: trialEndsAt,
        usageResetAt: new Date(),
        trialEndsAt,
        invoicesHistory: [],
      });
    }

    return this.rolloverUsageIfNeeded(sub);
  }

  /**
   * Resets metered minutes when a new billing period has started. Without this
   * `minutesUsed` accumulated forever and every account eventually appeared to
   * be over its limit.
   */
  private static async rolloverUsageIfNeeded(sub: ISubscription): Promise<ISubscription> {
    if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > Date.now()) return sub;
    if (sub.status === 'canceled') return sub;

    const intervalMs = (sub.billingInterval === 'year' ? 365 : 30) * 24 * 60 * 60 * 1000;
    sub.minutesUsed = 0;
    sub.usageResetAt = new Date();
    sub.currentPeriodStart = new Date();
    sub.currentPeriodEnd = new Date(Date.now() + intervalMs);
    await sub.save();
    return sub;
  }

  /**
   * Single source of truth for "is this business allowed to consume AI voice
   * minutes right now?".
   *
   * Metering already existed but nothing consumed its result, so plans were
   * never actually enforced and an account could burn unlimited provider spend.
   */
  public static async checkEntitlement(businessId: string | Types.ObjectId): Promise<{
    allowed: boolean;
    reason?: 'subscription_inactive' | 'trial_expired' | 'minutes_exhausted';
    minutesUsed: number;
    minutesAllocated: number;
    status: string;
    trialEndsAt?: Date;
  }> {
    const sub = await this.getOrCreateSubscription(businessId);

    const base = {
      minutesUsed: sub.minutesUsed,
      minutesAllocated: sub.minutesAllocated,
      status: sub.status,
      trialEndsAt: sub.trialEndsAt,
    };

    if (!ENTITLED_STATUSES.includes(sub.status)) {
      return { allowed: false, reason: 'subscription_inactive', ...base };
    }
    if (sub.status === 'trialing' && sub.trialEndsAt && sub.trialEndsAt.getTime() < Date.now()) {
      return { allowed: false, reason: 'trial_expired', ...base };
    }
    // Paid plans get a 10% soft buffer so a call is never cut mid-sentence at
    // the exact limit; trials are hard-capped to bound free usage.
    const ceiling =
      sub.status === 'trialing' ? sub.minutesAllocated : Math.ceil(sub.minutesAllocated * 1.1);
    if (sub.minutesUsed >= ceiling) {
      return { allowed: false, reason: 'minutes_exhausted', ...base };
    }

    return { allowed: true, ...base };
  }

  /** Enforces the phone-number allowance of the current plan. */
  public static async assertCanProvisionPhoneNumber(
    businessId: string | Types.ObjectId,
    currentCount: number
  ): Promise<void> {
    const sub = await this.getOrCreateSubscription(businessId);

    if (!ENTITLED_STATUSES.includes(sub.status)) {
      throw new AppError(
        'Your subscription is not active. Please update billing before adding a phone number.',
        402
      );
    }
    if (currentCount >= sub.phoneNumbersAllocated) {
      throw new AppError(
        `Your ${sub.tier} plan includes ${sub.phoneNumbersAllocated} phone number(s). Upgrade your plan to add more lines.`,
        402
      );
    }
  }

  /**
   * Generates a Stripe Checkout Session for upgrading / subscribing to a tier
   */
  public static async createCheckoutSession(
    businessId: string | Types.ObjectId,
    tier: SubscriptionTier,
    interval: BillingInterval = 'month',
    successUrl?: string,
    cancelUrl?: string
  ): Promise<{ checkoutUrl: string; sessionId: string }> {
    const plan = SUBSCRIPTION_PLANS[tier];
    if (!plan) {
      throw new AppError(`Invalid subscription tier: ${tier}`, 400);
    }

    const price = interval === 'year' ? plan.annualPricePerMonth * 12 : plan.monthlyPrice;
    const sub = await this.getOrCreateSubscription(businessId);

    const defaultSuccess =
      successUrl || `${config.frontendUrl}/app/billing?session_id={CHECKOUT_SESSION_ID}&success=true`;
    const defaultCancel = cancelUrl || `${config.frontendUrl}/app/billing?canceled=true`;

    if (this.stripeClient) {
      const customerId = await this.ensureStripeCustomer(sub, businessId);
      const configuredPriceId = this.resolvePriceId(tier, interval);

      // Prefer a Price configured in the Stripe dashboard (so pricing can be
      // changed without a deploy); fall back to inline price_data otherwise.
      const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = configuredPriceId
        ? { price: configuredPriceId, quantity: 1 }
        : {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `BlueCollar AI — ${plan.name}`,
                description: plan.description,
              },
              unit_amount: Math.round(price * 100),
              recurring: { interval: interval === 'year' ? 'year' : 'month' },
            },
            quantity: 1,
          };

      // Remaining trial days carry over into the paid subscription so a
      // business that upgrades early is not charged for time it already had.
      const remainingTrialMs = sub.trialEndsAt ? sub.trialEndsAt.getTime() - Date.now() : 0;
      const remainingTrialDays = Math.max(0, Math.ceil(remainingTrialMs / (24 * 60 * 60 * 1000)));

      const session = await this.stripeClient.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [lineItem],
        success_url: defaultSuccess,
        cancel_url: defaultCancel,
        allow_promotion_codes: true,
        client_reference_id: businessId.toString(),
        subscription_data: {
          ...(remainingTrialDays > 0 ? { trial_period_days: Math.min(remainingTrialDays, 730) } : {}),
          metadata: { businessId: businessId.toString(), tier, interval },
        },
        metadata: {
          businessId: businessId.toString(),
          tier,
          interval,
        },
      });

      return {
        checkoutUrl: session.url || defaultSuccess,
        sessionId: session.id,
      };
    }

    // Simulation mode: STRIPE_SECRET_KEY is not configured (local development).
    // The URL is explicitly flagged so the UI can warn that no real payment was
    // taken, and no subscription state is mutated here.
    log.warn('stripe_not_configured_simulated_checkout', { tier, interval });
    const simulatedSessionId = `cs_sim_${Date.now()}_${tier}`;
    const simulatedCheckoutUrl = `${defaultCancel.replace('canceled=true', '')}billing_simulated=true&tier=${tier}&interval=${interval}`;

    return {
      checkoutUrl: simulatedCheckoutUrl,
      sessionId: simulatedSessionId,
    };
  }

  /**
   * Creates a real Stripe Customer the first time a business reaches checkout,
   * replacing the `pending_<id>` placeholder written at trial creation.
   */
  private static async ensureStripeCustomer(
    sub: ISubscription,
    businessId: string | Types.ObjectId
  ): Promise<string | undefined> {
    if (!this.stripeClient) return undefined;
    if (sub.stripeCustomerId && !sub.stripeCustomerId.startsWith('pending_') && !sub.stripeCustomerId.startsWith('cus_sim_')) {
      return sub.stripeCustomerId;
    }

    const business = await Business.findById(businessId);
    const customer = await this.stripeClient.customers.create({
      name: business?.name,
      email: (business as any)?.email,
      metadata: { businessId: businessId.toString() },
    });

    sub.stripeCustomerId = customer.id;
    await sub.save();
    return customer.id;
  }

  /**
   * Creates a Stripe Checkout Session so a homeowner can pay a job invoice by
   * card from the public customer portal.
   *
   * Invoice card payment was previously a pure mock that just mutated
   * `amountPaid`, so no money ever moved. The balance is now only cleared from
   * the signature-verified `checkout.session.completed` webhook.
   */
  public static async createInvoicePaymentSession(invoice: any): Promise<{
    checkoutUrl: string;
    sessionId: string;
    simulated: boolean;
  }> {
    if (invoice.balanceDue <= 0) {
      throw new AppError('This invoice is already paid in full', 400);
    }

    const returnUrl = `${config.frontendUrl}/portal/invoice/${invoice.shareToken}`;

    if (!this.stripeClient) {
      log.warn('stripe_not_configured_invoice_payment', { invoiceNumber: invoice.invoiceNumber });
      throw new AppError(
        'Online card payment is not enabled for this contractor yet. Please use the check or bank transfer option, or contact them directly.',
        503
      );
    }

    let business: any = invoice.businessId;
    if (!business || typeof business !== 'object' || !business.name) {
      business = await Business.findById(invoice.businessId).select('name stripeAccountId').lean();
    }

    const businessName = business?.name || 'your contractor';

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Invoice ${invoice.invoiceNumber} — ${businessName}`,
              description: (invoice.title || 'Service invoice').slice(0, 300),
            },
            unit_amount: Math.round(invoice.balanceDue * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${returnUrl}?payment=success`,
      cancel_url: `${returnUrl}?payment=canceled`,
      metadata: {
        kind: 'job_invoice',
        invoiceId: invoice._id.toString(),
        invoiceNumber: invoice.invoiceNumber,
        businessId: String(business?._id || invoice.businessId),
      },
    };

    // FinCEN Money Transmitter Exemption & IRS 1099-K Protection:
    // Contractors must connect their own Stripe Connect merchant account.
    // Collecting customer job payments directly into platform bank accounts without a state Money Transmitter License (MTL)
    // is unlawful under 18 U.S.C. § 1960 and subjects platform to contractor 1099-K tax liability.
    if (!business?.stripeAccountId) {
      throw new AppError(
        'Online card payment is unavailable because the service provider has not connected their payment processing account. Please contact them directly to pay.',
        400
      );
    }

    sessionParams.payment_intent_data = {
      transfer_data: {
        destination: business.stripeAccountId,
      },
    };

    const session = await this.stripeClient.checkout.sessions.create(sessionParams);

    await InvoiceService.attachCheckoutSession(invoice._id, session.id);

    return {
      checkoutUrl: session.url || returnUrl,
      sessionId: session.id,
      simulated: false,
    };
  }

  /**
   * Verifies a raw Stripe webhook payload and returns the parsed event.
   *
   * This is the security boundary for billing. Previously the route parsed
   * `req.body` as trusted JSON with no signature check at all, so anyone could
   * POST a forged `checkout.session.completed` and upgrade any tenant to
   * Enterprise for free.
   */
  public static constructWebhookEvent(rawBody: Buffer | string, signature?: string): Stripe.Event {
    if (!this.stripeClient) {
      throw new AppError('Billing is not configured on this server', 503);
    }
    if (!config.stripeWebhookSecret) {
      throw new AppError('STRIPE_WEBHOOK_SECRET is not configured; refusing to trust webhook', 500);
    }
    if (!signature) {
      throw new AppError('Missing Stripe signature header', 400);
    }

    try {
      return this.stripeClient.webhooks.constructEvent(
        rawBody,
        signature,
        config.stripeWebhookSecret
      );
    } catch (err: any) {
      log.warn('stripe_webhook_signature_rejected', { reason: err?.message });
      throw new AppError('Invalid Stripe webhook signature', 400);
    }
  }

  /**
   * Generates a Stripe Customer Portal Session for managing cards and subscriptions
   */
  public static async createCustomerPortalSession(
    businessId: string | Types.ObjectId,
    returnUrl?: string
  ): Promise<{ portalUrl: string }> {
    const sub = await this.getOrCreateSubscription(businessId);
    const defaultReturn = returnUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/app/billing`;

    if (this.stripeClient && !sub.stripeCustomerId.startsWith('cus_sim_')) {
      const portalSession = await this.stripeClient.billingPortal.sessions.create({
        customer: sub.stripeCustomerId,
        return_url: defaultReturn,
      });

      return { portalUrl: portalSession.url };
    }

    // Simulation portal URL
    return {
      portalUrl: `${defaultReturn}?portal_simulated=true&customer=${sub.stripeCustomerId}`,
    };
  }

  /**
   * Handles a Stripe webhook event that has ALREADY been signature-verified by
   * constructWebhookEvent.
   *
   * Tenant and tier are read only from `metadata` written by this server when
   * the Checkout Session was created. The previous implementation also accepted
   * them from the top level of the request body, which made free self-upgrade
   * trivial.
   */
  public static async handleWebhookEvent(
    event: Stripe.Event
  ): Promise<{ received: boolean; action?: string }> {
    const dataObject: any = event.data?.object ?? {};

    switch (event.type) {
      case 'checkout.session.completed': {
        // A homeowner paying a job invoice, not a SaaS subscription.
        if (dataObject.metadata?.kind === 'job_invoice') {
          const paid = (dataObject.amount_total || 0) / 100;
          const invoice = await InvoiceService.markPaidFromStripeSession(
            dataObject.id,
            paid,
            dataObject.payment_intent || dataObject.id
          );
          log.info('job_invoice_paid', {
            sessionId: dataObject.id,
            matched: !!invoice,
            amountUsd: paid,
          });
          return { received: true, action: 'job_invoice_paid' };
        }

        const businessId = dataObject.metadata?.businessId || dataObject.client_reference_id;
        const rawTier = dataObject.metadata?.tier;
        const rawInterval = dataObject.metadata?.interval;

        if (!businessId || !Types.ObjectId.isValid(businessId.toString())) {
          log.warn('stripe_webhook_missing_business_metadata', { sessionId: dataObject.id });
          return { received: true, action: 'ignored_missing_metadata' };
        }

        const tier: SubscriptionTier = (['starter', 'pro', 'enterprise'] as const).includes(rawTier)
          ? rawTier
          : 'starter';
        const interval: BillingInterval = rawInterval === 'year' ? 'year' : 'month';

        const plan = SUBSCRIPTION_PLANS[tier];
        const price = interval === 'year' ? plan.annualPricePerMonth * 12 : plan.monthlyPrice;

        await Subscription.findOneAndUpdate(
          { businessId: new Types.ObjectId(businessId.toString()) },
          {
            tier,
            status: 'active',
            billingInterval: interval,
            amountUsd: price,
            minutesAllocated: plan.minutesAllocated,
            phoneNumbersAllocated: plan.phoneNumbersAllocated,
            ...(dataObject.subscription ? { stripeSubscriptionId: dataObject.subscription } : {}),
            ...(dataObject.customer ? { stripeCustomerId: dataObject.customer } : {}),
            // Upgrading ends the trial and starts a paid period with fresh usage.
            trialEndsAt: undefined,
            minutesUsed: 0,
            usageResetAt: new Date(),
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(
              Date.now() + (interval === 'year' ? 365 : 30) * 24 * 60 * 60 * 1000
            ),
          },
          { upsert: true, new: true }
        );

        log.info('subscription_activated', { businessId: businessId.toString(), tier, interval });
        return { received: true, action: 'subscription_activated' };
      }

      case 'customer.subscription.updated': {
        const status = dataObject.status;
        const mapped =
          status === 'trialing'
            ? 'trialing'
            : status === 'active'
              ? 'active'
              : status === 'past_due' || status === 'unpaid'
                ? 'past_due'
                : status === 'canceled'
                  ? 'canceled'
                  : 'incomplete';

        if (dataObject.id) {
          await Subscription.findOneAndUpdate(
            { stripeSubscriptionId: dataObject.id },
            {
              status: mapped,
              cancelAtPeriodEnd: !!dataObject.cancel_at_period_end,
              ...(dataObject.current_period_end
                ? { currentPeriodEnd: new Date(dataObject.current_period_end * 1000) }
                : {}),
            }
          );
        }
        return { received: true, action: `subscription_${mapped}` };
      }

      case 'customer.subscription.deleted': {
        if (dataObject.id) {
          await Subscription.findOneAndUpdate(
            { stripeSubscriptionId: dataObject.id },
            { status: 'canceled' }
          );
        }
        return { received: true, action: 'subscription_canceled' };
      }

      case 'invoice.payment_succeeded': {
        const subId = dataObject.subscription;
        if (subId) {
          await Subscription.findOneAndUpdate(
            { stripeSubscriptionId: subId },
            {
              status: 'active',
              $push: {
                invoicesHistory: {
                  invoiceId: dataObject.id || `in_${Date.now()}`,
                  amountPaid: (dataObject.amount_paid || 0) / 100,
                  currency: dataObject.currency || 'usd',
                  pdfUrl: dataObject.hosted_invoice_url,
                  paidAt: new Date(),
                  status: 'paid',
                },
              },
            }
          );
        }
        return { received: true, action: 'payment_succeeded' };
      }

      case 'invoice.payment_failed': {
        const subId = dataObject.subscription;
        if (subId) {
          await Subscription.findOneAndUpdate({ stripeSubscriptionId: subId }, { status: 'past_due' });
        }
        log.warn('subscription_payment_failed', { stripeSubscriptionId: subId });
        return { received: true, action: 'payment_failed' };
      }

      default:
        return { received: true, action: 'ignored' };
    }
  }

  /**
   * Tracks voice minutes usage against plan limits.
   */
  public static async recordVoiceUsage(
    businessId: string | Types.ObjectId,
    durationSeconds: number
  ): Promise<{ minutesUsed: number; minutesAllocated: number; isOverLimit: boolean }> {
    const sub = await this.getOrCreateSubscription(businessId);
    const minutesToAdd = Math.max(1, Math.ceil(durationSeconds / 60));

    sub.minutesUsed += minutesToAdd;
    await sub.save();

    const isOverLimit = sub.minutesUsed > sub.minutesAllocated;
    if (isOverLimit) {
      log.warn('voice_minutes_over_limit', {
        businessId: businessId.toString(),
        minutesUsed: sub.minutesUsed,
        minutesAllocated: sub.minutesAllocated,
        tier: sub.tier,
      });
    }

    return {
      minutesUsed: sub.minutesUsed,
      minutesAllocated: sub.minutesAllocated,
      isOverLimit,
    };
  }

  /**
   * Moves expired trials to `incomplete` so the AI stops answering and the UI
   * can prompt for payment. Invoked by the scheduler.
   */
  public static async expireEndedTrials(): Promise<number> {
    const result = await Subscription.updateMany(
      { status: 'trialing', trialEndsAt: { $lt: new Date() } },
      { status: 'incomplete' }
    );
    const count = result.modifiedCount || 0;
    if (count > 0) log.info('trials_expired', { count });
    return count;
  }
}
