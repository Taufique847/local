import { apiClient } from '../lib/api-client';

export interface PlanItem {
  id: 'starter' | 'pro' | 'enterprise';
  name: string;
  badge?: string;
  description: string;
  monthlyPrice: number;
  annualPricePerMonth: number;
  annualTotalPrice?: number;
  minutesAllocated: number;
  phoneNumbersAllocated: number;
  features: string[];
}

export interface InvoiceItem {
  invoiceId: string;
  amountPaid: number;
  currency: string;
  pdfUrl?: string;
  paidAt: string;
  status: 'paid' | 'open' | 'failed';
}

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete';

export interface SubscriptionData {
  tier: 'starter' | 'pro' | 'enterprise';
  status: SubscriptionStatus;
  billingInterval: 'month' | 'year';
  amountUsd: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  minutesAllocated: number;
  minutesUsed: number;
  phoneNumbersAllocated: number;
  stripeCustomerId: string;
  /** Set while the business is on its free trial. */
  trialEndsAt?: string;
  usageResetAt?: string;
  invoicesHistory: InvoiceItem[];
}

export class BillingService {
  public static async getPlans(): Promise<PlanItem[]> {
    const json = await apiClient.get<{ plans?: PlanItem[] }>('/api/billing/plans');
    return json.plans || [];
  }

  public static async getSubscription(): Promise<SubscriptionData> {
    const json = await apiClient.get<{ subscription: SubscriptionData }>(
      '/api/billing/subscription'
    );
    return json.subscription;
  }

  public static async createCheckout(
    tier: 'starter' | 'pro' | 'enterprise',
    interval: 'month' | 'year' = 'month'
  ): Promise<{ checkoutUrl: string; sessionId: string }> {
    return apiClient.post<{ checkoutUrl: string; sessionId: string }>('/api/billing/checkout', {
      tier,
      interval,
    });
  }

  public static async createPortal(): Promise<{ portalUrl: string }> {
    return apiClient.post<{ portalUrl: string }>('/api/billing/portal', {});
  }
}
