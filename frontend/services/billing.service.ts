const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

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

export interface SubscriptionData {
  tier: 'starter' | 'pro' | 'enterprise';
  status: 'active' | 'past_due' | 'canceled' | 'incomplete';
  billingInterval: 'month' | 'year';
  amountUsd: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  minutesAllocated: number;
  minutesUsed: number;
  phoneNumbersAllocated: number;
  stripeCustomerId: string;
  invoicesHistory: InvoiceItem[];
}

export class BillingService {
  public static async getPlans(): Promise<PlanItem[]> {
    const res = await fetch(`${API_BASE_URL}/api/billing/plans`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to fetch plans');
    return json.plans || [];
  }

  public static async getSubscription(): Promise<SubscriptionData> {
    const res = await fetch(`${API_BASE_URL}/api/billing/subscription`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to fetch subscription');
    return json.subscription;
  }

  public static async createCheckout(
    tier: 'starter' | 'pro' | 'enterprise',
    interval: 'month' | 'year' = 'month'
  ): Promise<{ checkoutUrl: string; sessionId: string }> {
    const res = await fetch(`${API_BASE_URL}/api/billing/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ tier, interval }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to create checkout session');
    return json;
  }

  public static async createPortal(): Promise<{ portalUrl: string }> {
    const res = await fetch(`${API_BASE_URL}/api/billing/portal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to create customer portal');
    return json;
  }
}
