import Stripe from 'stripe';
import { Types } from 'mongoose';
import { Subscription, ISubscription, SubscriptionTier, BillingInterval } from '../models/subscription.model';
import { Business } from '../models/business.model';
import { AppError } from '../types';

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

export class BillingService {
  private static stripeClient: Stripe | null = process.env.STRIPE_SECRET_KEY
    ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' as any })
    : null;

  /**
   * Returns all available subscription plans with pricing tiers
   */
  public static getPlans(): PlanDefinition[] {
    return Object.values(SUBSCRIPTION_PLANS);
  }

  /**
   * Retrieves or initializes subscription for a business
   */
  public static async getOrCreateSubscription(businessId: string | Types.ObjectId): Promise<ISubscription> {
    const bId = new Types.ObjectId(businessId.toString());
    let sub = await Subscription.findOne({ businessId: bId });

    if (!sub) {
      const business = await Business.findById(bId);
      const customerId = `cus_sim_${bId.toString().substring(0, 14)}`;

      sub = await Subscription.create({
        businessId: bId,
        stripeCustomerId: customerId,
        tier: 'starter',
        status: 'active',
        billingInterval: 'month',
        amountUsd: 299,
        minutesAllocated: 250,
        minutesUsed: 0,
        phoneNumbersAllocated: 1,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        invoicesHistory: [
          {
            invoiceId: `in_init_${Date.now().toString().slice(-8)}`,
            amountPaid: 299,
            currency: 'usd',
            paidAt: new Date(),
            status: 'paid',
          },
        ],
      });
    }

    return sub;
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

    const defaultSuccess = successUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/app/billing?session_id={CHECKOUT_SESSION_ID}&success=true`;
    const defaultCancel = cancelUrl || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/app/billing?canceled=true`;

    if (this.stripeClient) {
      const session = await this.stripeClient.checkout.sessions.create({
        customer: sub.stripeCustomerId.startsWith('cus_sim_') ? undefined : sub.stripeCustomerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `BlueCollar AI — ${plan.name}`,
                description: plan.description,
              },
              unit_amount: Math.round(price * 100),
              recurring: {
                interval: interval === 'year' ? 'year' : 'month',
              },
            },
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: defaultSuccess,
        cancel_url: defaultCancel,
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

    // High-Fidelity Simulation Mode (when STRIPE_SECRET_KEY is not configured locally)
    const simulatedSessionId = `cs_test_${Date.now()}_${tier}`;
    const simulatedCheckoutUrl = `${defaultSuccess.replace('{CHECKOUT_SESSION_ID}', simulatedSessionId)}&simulated=true&tier=${tier}`;

    return {
      checkoutUrl: simulatedCheckoutUrl,
      sessionId: simulatedSessionId,
    };
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
   * Handles inbound Stripe Webhook events
   */
  public static async handleWebhookEvent(event: any): Promise<{ received: boolean; action?: string }> {
    const eventType = event.type;
    const dataObject = event.data?.object || event;

    switch (eventType) {
      case 'checkout.session.completed': {
        const businessId = dataObject.metadata?.businessId || dataObject.businessId;
        const tier: SubscriptionTier = dataObject.metadata?.tier || dataObject.tier || 'pro';
        const interval: BillingInterval = dataObject.metadata?.interval || dataObject.interval || 'month';

        if (businessId) {
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
              stripeSubscriptionId: dataObject.subscription || `sub_sim_${Date.now()}`,
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + (interval === 'year' ? 365 : 30) * 24 * 60 * 60 * 1000),
              $push: {
                invoicesHistory: {
                  invoiceId: `in_${Date.now().toString().slice(-8)}`,
                  amountPaid: price,
                  currency: 'usd',
                  paidAt: new Date(),
                  status: 'paid',
                },
              },
            },
            { upsert: true, new: true }
          );
        }
        return { received: true, action: 'subscription_activated' };
      }

      case 'customer.subscription.deleted': {
        const subId = dataObject.id;
        if (subId) {
          await Subscription.findOneAndUpdate(
            { stripeSubscriptionId: subId },
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

      default:
        return { received: true, action: 'ignored' };
    }
  }

  /**
   * Tracks voice minutes usage against plan limits
   */
  public static async recordVoiceUsage(
    businessId: string | Types.ObjectId,
    durationSeconds: number
  ): Promise<{ minutesUsed: number; minutesAllocated: number; isOverLimit: boolean }> {
    const sub = await this.getOrCreateSubscription(businessId);
    const minutesToAdd = Math.ceil(durationSeconds / 60);

    sub.minutesUsed += minutesToAdd;
    await sub.save();

    return {
      minutesUsed: sub.minutesUsed,
      minutesAllocated: sub.minutesAllocated,
      isOverLimit: sub.minutesUsed > sub.minutesAllocated,
    };
  }
}
