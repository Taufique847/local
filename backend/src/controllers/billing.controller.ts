import { Response, NextFunction } from 'express';
import { BillingService } from '../services/billing.service';
import { BusinessContextService } from '../services/business-context.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class BillingController {
  /**
   * Resolves the caller's workspace by MEMBERSHIP, not by ownership.
   *
   * This used to be `getBusinessByOwnerId`, which answers "which business does
   * this person own" — correct for owners and empty for everyone else. Staff
   * accounts would have been told to complete a business profile they do not own.
   */
  private static async getBusinessId(userId: string): Promise<string> {
    const context = await BusinessContextService.resolve(userId);
    return context.businessId;
  }

  // GET /api/billing/plans
  public static async getPlans(
    _req: any,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const plans = BillingService.getPlans();
      sendSuccess(res, { success: true, plans }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/billing/subscription
  public static async getSubscription(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await BillingController.getBusinessId(req.user.id);
      const subscription = await BillingService.getOrCreateSubscription(businessId);
      sendSuccess(res, { success: true, subscription }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/billing/checkout
  public static async createCheckout(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await BillingController.getBusinessId(req.user.id);
      const { tier, interval, successUrl, cancelUrl } = req.body;

      if (!tier || !['starter', 'pro', 'enterprise'].includes(tier)) {
        throw new AppError('Valid tier (starter, pro, enterprise) is required', 400);
      }

      const session = await BillingService.createCheckoutSession(
        businessId,
        tier,
        interval || 'month',
        successUrl,
        cancelUrl
      );

      sendSuccess(res, { success: true, ...session }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/billing/portal
  public static async createPortal(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await BillingController.getBusinessId(req.user.id);
      const { returnUrl } = req.body;

      const portal = await BillingService.createCustomerPortalSession(businessId, returnUrl);
      sendSuccess(res, { success: true, ...portal }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/billing/webhook
   *
   * Public endpoint. `req.body` here is a raw Buffer (see STRIPE_WEBHOOK_PATH in
   * app.ts) because Stripe signatures are computed over the exact bytes sent.
   * The payload is untrusted until constructWebhookEvent verifies it.
   */
  public static async handleWebhook(
    req: any,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const signature = req.headers['stripe-signature'] as string | undefined;
      const event = BillingService.constructWebhookEvent(req.body, signature);
      const result = await BillingService.handleWebhookEvent(event);
      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }
}
