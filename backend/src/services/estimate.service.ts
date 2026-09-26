import { Types } from 'mongoose';
import { Estimate, IEstimate, IEstimateItem } from '../models/estimate.model';
import { Invoice } from '../models/invoice.model';
import { Customer } from '../models/customer.model';
import { Business } from '../models/business.model';
import { DocumentNumberService } from './document-number.service';
import { PolicyGuardrailsService } from './policy-guardrails.service';
import { NotificationService } from './notification.service';
import { PricingService, PricingDiscount } from './pricing.service';
import { AppError } from '../types';
import { generateShareToken, isValidShareTokenFormat } from '../utils/share-token';
import { escapeRegex } from '../utils/format';

export class EstimateService {
  public static async createEstimate(
    businessId: Types.ObjectId | string,
    data: {
      customerId: string;
      appointmentId?: string;
      leadId?: string;
      title?: string;
      items: IEstimateItem[];
      diagnosticFeeCredit?: number;
      taxRate?: number;
      /** Overrides the appointment's priority. Lets an owner charge or waive it. */
      emergency?: boolean;
      emergencyFee?: number;
      /** Overrides the zone lookup. */
      travelFee?: number;
      discount?: PricingDiscount;
      terms?: string;
      tiers?: any[];
    }
  ): Promise<IEstimate> {
    const customer = await Customer.findOne({ _id: data.customerId, businessId });
    if (!customer) throw new AppError('Customer not found for this business', 404);

    // Atomic. See DocumentNumberService for why countDocuments was unsafe.
    const estimateNumber = await DocumentNumberService.next(businessId, 'estimate');
    const shareToken = generateShareToken('est');

    // All arithmetic lives in `PricingService`. See InvoiceService.createInvoice.
    const policy = await PolicyGuardrailsService.getPolicy(businessId);

    const { emergency, travelFee } = await PricingService.resolveJobContext(businessId, {
      appointmentId: data.appointmentId || null,
      zip: (customer as any).address?.zip ?? null,
      emergency: data.emergency,
      travelFee: data.travelFee,
    });

    /**
     * The fees, credit and discount belong to the job, so every tier carries them.
     *
     * A customer who picks the "best" option is still in the same house on the same
     * after-hours callout. Pricing each tier through the same `quote` call means the
     * comparison table cannot show one option with the travel charge and another
     * without it, and a percentage discount is correctly recomputed against each
     * tier's own base rather than being copied from the cheapest one.
     */
    const jobPricing = {
      diagnosticFeeCredit: data.diagnosticFeeCredit,
      taxRate: data.taxRate,
      emergency,
      emergencyFee: data.emergencyFee,
      travelFee,
      discount: data.discount,
    };

    const quote = PricingService.quote({ ...jobPricing, items: data.items }, policy);

    const processedTiers = data.tiers && data.tiers.length > 0
      ? data.tiers.map((t: any) => {
          const tierQuote = PricingService.quote({ ...jobPricing, items: t.items ?? [] }, policy);
          return {
            tierId: t.tierId,
            name: t.name,
            badge: t.badge,
            description: t.description,
            items: tierQuote.items,
            subtotal: tierQuote.subtotal,
            discountAmount: tierQuote.discountAmount,
            taxAmount: tierQuote.taxAmount,
            totalAmount: tierQuote.totalAmount,
            isRecommended: !!t.isRecommended,
          };
        })
      : [];

    const estimate = await Estimate.create({
      businessId,
      customerId: data.customerId,
      appointmentId: data.appointmentId || null,
      leadId: data.leadId || null,
      estimateNumber,
      title: data.title || 'HVAC Service & Diagnostic Estimate',
      items: quote.items,
      tiers: processedTiers,
      subtotal: quote.subtotal,
      diagnosticFeeCredit: quote.diagnosticFeeCredit,
      emergencyFee: quote.emergencyFee,
      travelFee: quote.travelFee,
      discountType: quote.discountType,
      discountValue: quote.discountValue,
      discountAmount: quote.discountAmount,
      discountReason: quote.discountReason,
      taxRate: quote.taxRate,
      taxAmount: quote.taxAmount,
      totalAmount: quote.totalAmount,
      terms: data.terms,
      status: 'sent',
      shareToken,
    });

    /**
     * Actually sends it.
     *
     * The record was written with `status: 'sent'` and nothing was sent. The
     * e-signature flow, the tier comparison and the approve-online portal page all
     * existed and were unreachable, because the only copy of the share token was
     * on the owner's screen.
     */
    await NotificationService.notifyEstimate(estimate);

    return estimate;
  }

  /**
   * Paginated estimate list.
   *
   * Previously returned every estimate a business had ever raised, with the full
   * line-item array and populated customer on each one. That grows without
   * bound, and the page rendered all of it.
   */
  public static async getEstimates(
    businessId: Types.ObjectId | string,
    filter: { status?: string; search?: string; page?: string | number; limit?: string | number } = {}
  ): Promise<{
    estimates: IEstimate[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const query: any = { businessId };
    if (filter.status && filter.status !== 'all') {
      query.status = filter.status;
    }

    if (filter.search) {
      const regex = new RegExp(escapeRegex(filter.search.trim()), 'i');
      query.$or = [{ estimateNumber: regex }, { title: regex }];
    }

    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));

    const [estimates, total] = await Promise.all([
      Estimate.find(query)
        .populate('customerId', 'name phone email address')
        .populate('appointmentId', 'title startAt status')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Estimate.countDocuments(query),
    ]);

    return {
      estimates,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  public static async getEstimateById(
    businessId: Types.ObjectId | string,
    id: string
  ): Promise<IEstimate> {
    const estimate = await Estimate.findOne({ _id: id, businessId })
      .populate('customerId', 'name phone email address')
      .populate('appointmentId');

    if (!estimate) throw new AppError('Estimate not found', 404);
    return estimate;
  }

  /**
   * Customer portal: fetch an estimate by its secret shareToken ONLY.
   *
   * Security: unauthenticated endpoint, so the shareToken is the sole
   * authorization factor. Accepting a Mongo `_id` here (as a previous version
   * did) allowed enumeration of every tenant's quotes and customer PII.
   */
  public static async getPublicEstimate(shareToken: string): Promise<any> {
    if (!isValidShareTokenFormat(shareToken)) {
      throw new AppError('Quote not found or invalid link', 404);
    }

    const estimate = await Estimate.findOne({ shareToken: shareToken.trim() })
      .populate('customerId', 'name phone email address')
      .populate('businessId', 'name phone email businessType serviceArea');

    if (!estimate) throw new AppError('Quote not found or invalid link', 404);

    /**
     * Expiry was written on creation and then never read, so a quote remained
     * approvable forever while its own terms said otherwise. Marked here rather
     * than hidden, so the homeowner still sees the quote and is told it lapsed
     * instead of getting a bare "not found".
     */
    if (this.isExpired(estimate) && !['approved', 'converted'].includes(estimate.status)) {
      if (estimate.status !== 'expired') {
        estimate.status = 'expired';
        await estimate.save();
      }
      return estimate;
    }

    if (estimate.status === 'sent') {
      estimate.status = 'viewed';
      estimate.viewedAt = new Date();
      await estimate.save();
    }

    return estimate;
  }

  /** True once the quote's own stated validity window has passed. */
  private static isExpired(estimate: IEstimate): boolean {
    if (!estimate.expiresAt) return false;
    return new Date(estimate.expiresAt).getTime() < Date.now();
  }

  /**
   * Customer portal: e-sign and approve a quote, identified by its secret
   * shareToken ONLY. See getPublicEstimate for the rationale.
   */
  public static async approveEstimate(
    shareToken: string,
    signature: {
      signedByName: string;
      signatureDataUrl: string;
      ipAddress?: string;
      selectedTierId?: 'good' | 'better' | 'best';
    }
  ): Promise<IEstimate> {
    if (!isValidShareTokenFormat(shareToken)) {
      throw new AppError('Quote not found or invalid link', 404);
    }

    if (!signature.signedByName || signature.signedByName.trim().length < 2) {
      throw new AppError('A signer name is required to approve this quote', 400);
    }
    if (!signature.signatureDataUrl || !signature.signatureDataUrl.startsWith('data:image/')) {
      throw new AppError('A valid signature image is required to approve this quote', 400);
    }

    const estimate = await Estimate.findOne({ shareToken: shareToken.trim() });
    if (!estimate) throw new AppError('Quote not found or invalid link', 404);

    if (estimate.status === 'approved' || estimate.status === 'converted') {
      return estimate;
    }

    /**
     * An expired quote cannot be signed.
     *
     * Prices, part costs and technician availability all move; honouring a
     * signature on a lapsed quote binds the contractor to numbers they set weeks
     * ago. The expiry date was stored and never checked, so this was possible
     * indefinitely.
     */
    if (this.isExpired(estimate)) {
      if (estimate.status !== 'expired') {
        estimate.status = 'expired';
        await estimate.save();
      }
      throw new AppError(
        'This quote has expired. Please contact us and we will send you an updated one.',
        410
      );
    }

    if (signature.selectedTierId && estimate.tiers && estimate.tiers.length > 0) {
      const chosenTier = estimate.tiers.find((t) => t.tierId === signature.selectedTierId);
      if (chosenTier) {
        /**
         * Every figure the tier changes, not just two of them.
         *
         * This used to copy `items`, `subtotal` and `totalAmount` and leave
         * `taxAmount` and `discountAmount` at the base items' values. So approving
         * the "best" tier produced an estimate whose total came from that tier and
         * whose tax came from the cheapest one, `convertToInvoice` copied both, and
         * the invoice's line items did not add up to the amount being demanded.
         */
        estimate.selectedTierId = chosenTier.tierId;
        estimate.items = chosenTier.items;
        estimate.subtotal = chosenTier.subtotal;
        estimate.discountAmount = chosenTier.discountAmount;
        estimate.taxAmount = chosenTier.taxAmount;
        estimate.totalAmount = chosenTier.totalAmount;
      }
    }

    estimate.status = 'approved';
    estimate.signature = {
      signedByName: signature.signedByName,
      signatureDataUrl: signature.signatureDataUrl,
      signedAt: new Date(),
      ipAddress: signature.ipAddress,
    };
    estimate.approvedAt = new Date();
    await estimate.save();

    return estimate;
  }

  /**
   * Converts an approved estimate into an invoice.
   *
   * Idempotent. Without the guard below, calling this twice — which a contractor
   * double-clicking the button does — created two separate live invoices for the
   * same work, both payable, and silently overwrote `convertedInvoiceId` so the
   * first became an orphan that was still collectable. `approveEstimate` in this
   * same file already guarded against repeat calls; this did not.
   */
  public static async convertToInvoice(
    businessId: Types.ObjectId | string,
    estimateId: string
  ): Promise<{ estimate: IEstimate; invoice: any; alreadyConverted?: boolean }> {
    const estimate = await Estimate.findOne({ _id: estimateId, businessId });
    if (!estimate) throw new AppError('Estimate not found', 404);

    if (estimate.convertedInvoiceId) {
      const existing = await Invoice.findOne({
        _id: estimate.convertedInvoiceId,
        businessId,
      });

      // Return the invoice that already exists rather than billing twice.
      if (existing) {
        return { estimate, invoice: existing, alreadyConverted: true };
      }
      // Referenced invoice is gone (deleted), so falling through to create a
      // replacement is correct.
    }

    const invoiceNumber = await DocumentNumberService.next(businessId, 'invoice');
    const shareToken = generateShareToken('inv');

    const invoice = await Invoice.create({
      businessId,
      customerId: estimate.customerId,
      appointmentId: estimate.appointmentId || null,
      estimateId: estimate._id,
      invoiceNumber,
      title: estimate.title,
      items: estimate.items,
      subtotal: estimate.subtotal,
      diagnosticFeeCredit: estimate.diagnosticFeeCredit,
      /**
       * The fees and the discount carry over.
       *
       * Without these, an approved quote that included a travel charge and a 10%
       * discount converted into an invoice whose `travelFee` and `discountAmount`
       * read 0 while the line items and the total still contained them — so every
       * report that sums those columns understated them, and nothing on the invoice
       * explained why the customer was paying less than the items came to.
       */
      emergencyFee: estimate.emergencyFee,
      travelFee: estimate.travelFee,
      discountType: estimate.discountType,
      discountValue: estimate.discountValue,
      discountAmount: estimate.discountAmount,
      discountReason: estimate.discountReason,
      taxRate: estimate.taxRate,
      taxAmount: estimate.taxAmount,
      totalAmount: estimate.totalAmount,
      amountPaid: 0,
      balanceDue: estimate.totalAmount,
      status: 'unpaid',
      shareToken,
    });

    estimate.status = 'converted';
    estimate.convertedInvoiceId = invoice._id;
    await estimate.save();

    /**
     * Sent after the estimate is marked converted, so a failure here cannot leave
     * an invoice the customer has been told about but the estimate still claims is
     * unconverted.
     *
     * This path builds its `Invoice` directly rather than calling
     * `InvoiceService.createInvoice`, so it does not inherit that method's
     * notification and needs its own.
     */
    await NotificationService.notifyInvoice(invoice, 'invoice_issued');

    return { estimate, invoice };
  }
}
