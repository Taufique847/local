import { Response, NextFunction } from 'express';
import { BillingService } from '../services/billing.service';
import { BusinessService } from '../services/business.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class BillingController {
  private static async getBusinessId(userId: string): Promise<string> {
    const business = await BusinessService.getBusinessByOwnerId(userId);
    if (!business) {
      throw new AppError('Please complete your business profile setup first', 400);
    }
    return business.id;
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
