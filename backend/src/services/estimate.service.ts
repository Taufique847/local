import { Types } from 'mongoose';
import { Estimate, IEstimate, IEstimateItem } from '../models/estimate.model';
import { Invoice } from '../models/invoice.model';
import { Customer } from '../models/customer.model';
import { Business } from '../models/business.model';
import { DocumentNumberService } from './document-number.service';
import { PolicyGuardrailsService } from './policy-guardrails.service';
import { AppError } from '../types';
import { generateShareToken, isValidShareTokenFormat } from '../utils/share-token';

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
      terms?: string;
      tiers?: any[];
    }
  ): Promise<IEstimate> {
    const customer = await Customer.findOne({ _id: data.customerId, businessId });
    if (!customer) throw new AppError('Customer not found for this business', 404);

    // Atomic. See DocumentNumberService for why countDocuments was unsafe.
    const estimateNumber = await DocumentNumberService.next(businessId, 'estimate');
    const shareToken = generateShareToken('est');

    // Calculations
    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const diagCredit = data.diagnosticFeeCredit ?? 0;
    const taxableSubtotal = Math.max(0, subtotal - diagCredit);
    // Falls back to the business's own rate rather than an 8.25% literal.
    const policy = await PolicyGuardrailsService.getPolicy(businessId);
    const taxRate = data.taxRate ?? policy.taxRate;
    const taxAmount = parseFloat((taxableSubtotal * taxRate).toFixed(2));
    const totalAmount = parseFloat((taxableSubtotal + taxAmount).toFixed(2));

    const processedTiers = data.tiers && data.tiers.length > 0
      ? data.tiers.map((t: any) => {
          const tSubtotal = t.items.reduce((s: number, it: any) => s + it.quantity * it.unitPrice, 0);
          const tTaxable = Math.max(0, tSubtotal - diagCredit);
          const tTax = parseFloat((tTaxable * taxRate).toFixed(2));
          return {
            tierId: t.tierId,
            name: t.name,
            badge: t.badge,
            description: t.description,
            items: t.items.map((it: any) => ({
              description: it.description,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              total: parseFloat((it.quantity * it.unitPrice).toFixed(2)),
            })),
            subtotal: tSubtotal,
            totalAmount: parseFloat((tTaxable + tTax).toFixed(2)),
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
      items: data.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: parseFloat((i.quantity * i.unitPrice).toFixed(2)),
      })),
      tiers: processedTiers,
      subtotal,
      diagnosticFeeCredit: diagCredit,
      taxRate,
      taxAmount,
      totalAmount,
      terms: data.terms,
      status: 'sent',
      shareToken,
    });

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
      const regex = new RegExp(filter.search.trim(), 'i');
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
        estimate.selectedTierId = chosenTier.tierId;
        estimate.items = chosenTier.items;
        estimate.subtotal = chosenTier.subtotal;
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

    return { estimate, invoice };
  }
}
