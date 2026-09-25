import { Request, Response, NextFunction } from 'express';
import { EstimateService } from '../services/estimate.service';
import { InvoiceService } from '../services/invoice.service';
import { BillingService } from '../services/billing.service';
import { EmailConsentService } from '../services/email-consent.service';

/**
 * Public (unauthenticated) customer-portal endpoints.
 *
 * Every handler here is reachable without a session, so the secret shareToken
 * in the URL is the only authorization factor. Services validate the token
 * format and look documents up by shareToken alone — never by Mongo `_id`.
 */
export class PortalController {
  /**
   * GET /api/portal/unsubscribe/:token — describes, does not act.
   *
   * Read-only on purpose. Mail clients and security scanners prefetch links in email,
   * so if this mutated, recipients would be unsubscribed without ever clicking.
   */
  public static async previewUnsubscribe(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const preview = await EmailConsentService.preview(req.params.token);
      res.status(200).json({ success: true, ...preview });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/portal/unsubscribe/:token — performs it.
   *
   * Also the target of the `List-Unsubscribe-Post` header, which is how Gmail and
   * Outlook's native unsubscribe button works (RFC 8058 one-click). Idempotent, because
   * that button and a human clicking the footer link can both fire.
   */
  public static async unsubscribe(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await EmailConsentService.unsubscribe(req.params.token);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  // Public: Get estimate for customer viewing
  public static async getEstimate(req: Request, res: Response, next: NextFunction) {
    try {
      const estimate = await EstimateService.getPublicEstimate(req.params.token);
      res.status(200).json({ success: true, estimate });
    } catch (err) {
      next(err);
    }
  }

  // Public: E-sign and approve estimate
  public static async approveEstimate(req: Request, res: Response, next: NextFunction) {
    try {
      const { signedByName, signatureDataUrl, selectedTierId } = req.body;
      const ipAddress = req.ip || (req.headers['x-forwarded-for'] as string);
      const estimate = await EstimateService.approveEstimate(req.params.token, {
        signedByName: typeof signedByName === 'string' ? signedByName.trim().slice(0, 120) : '',
        signatureDataUrl,
        ipAddress,
        selectedTierId,
      });
      res.status(200).json({ success: true, estimate });
    } catch (err) {
      next(err);
    }
  }

  // Public: Get invoice for customer viewing
  public static async getInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const invoice = await InvoiceService.getPublicInvoice(req.params.token);
      res.status(200).json({ success: true, invoice });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Public: create a real Stripe Checkout Session so the homeowner can pay the
   * invoice by card.
   *
   * The invoice is NOT marked paid here. It is only marked paid when Stripe
   * confirms the charge via the signature-verified webhook, so a caller cannot
   * clear a balance without actually paying.
   */
  public static async createInvoiceCheckout(req: Request, res: Response, next: NextFunction) {
    try {
      const invoice = await InvoiceService.getPublicInvoice(req.params.token);
      const session = await BillingService.createInvoicePaymentSession(invoice);
      res.status(200).json({ success: true, ...session });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Public: record a non-card payment intent (check / cash / Zelle) that the
   * homeowner declares from the portal.
   *
   * This does not clear the balance either — it flags the invoice for the
   * contractor to confirm, because an unauthenticated caller must never be
   * able to mark money as received.
   */
  public static async declareOfflinePayment(req: Request, res: Response, next: NextFunction) {
    try {
      const { paymentMethod } = req.body;
      const result = await InvoiceService.declareOfflinePaymentIntent(
        req.params.token,
        paymentMethod
      );
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
}
