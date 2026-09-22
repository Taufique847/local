import { Types } from 'mongoose';
import { Invoice, IInvoice, IInvoiceItem, PaymentMethod } from '../models/invoice.model';
import { Customer } from '../models/customer.model';
import { DocumentNumberService } from './document-number.service';
import { AppError } from '../types';
import { generateShareToken, isValidShareTokenFormat } from '../utils/share-token';

export class InvoiceService {
  public static async createInvoice(
    businessId: Types.ObjectId | string,
    data: {
      customerId: string;
      appointmentId?: string;
      estimateId?: string;
      title?: string;
      items: IInvoiceItem[];
      diagnosticFeeCredit?: number;
      taxRate?: number;
      dueDate?: Date;
      notes?: string;
    }
  ): Promise<IInvoice> {
    const customer = await Customer.findOne({ _id: data.customerId, businessId });
    if (!customer) throw new AppError('Customer not found for this business', 404);

    // Atomic. `countDocuments() + 1001` gave two concurrent creations the same
    // number, and reused numbers after a deletion.
    const invoiceNumber = await DocumentNumberService.next(businessId, 'invoice');
    const shareToken = generateShareToken('inv');

    // Calculations
    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const diagCredit = data.diagnosticFeeCredit ?? 0;
    const taxableSubtotal = Math.max(0, subtotal - diagCredit);
    const taxRate = data.taxRate ?? 0.0825;
    const taxAmount = parseFloat((taxableSubtotal * taxRate).toFixed(2));
    const totalAmount = parseFloat((taxableSubtotal + taxAmount).toFixed(2));

    const invoice = await Invoice.create({
      businessId,
      customerId: data.customerId,
      appointmentId: data.appointmentId || null,
      estimateId: data.estimateId || null,
      invoiceNumber,
      title: data.title || 'HVAC Service & Repair Invoice',
      items: data.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: parseFloat((i.quantity * i.unitPrice).toFixed(2)),
      })),
      subtotal,
      diagnosticFeeCredit: diagCredit,
      taxRate,
      taxAmount,
      totalAmount,
      amountPaid: 0,
      balanceDue: totalAmount,
      status: 'unpaid',
      dueDate: data.dueDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      notes: data.notes,
      shareToken,
    });

    return invoice;
  }

  /**
   * Paginated invoice list.
   *
   * Previously unbounded: every invoice ever raised, each with its line items and
   * populated customer, in a single response.
   */
  public static async getInvoices(
    businessId: Types.ObjectId | string,
    filter: { status?: string; search?: string; page?: string | number; limit?: string | number } = {}
  ): Promise<{
    invoices: IInvoice[];
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
      query.$or = [{ invoiceNumber: regex }, { title: regex }];
    }

    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));

    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .populate('customerId', 'name phone email address')
        .populate('appointmentId', 'title startAt status')
        .populate('estimateId', 'estimateNumber')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Invoice.countDocuments(query),
    ]);

    return {
      invoices,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  public static async getInvoiceById(
    businessId: Types.ObjectId | string,
    id: string
  ): Promise<IInvoice> {
    const invoice = await Invoice.findOne({ _id: id, businessId })
      .populate('customerId', 'name phone email address')
      .populate('appointmentId')
      .populate('estimateId');

    if (!invoice) throw new AppError('Invoice not found', 404);
    return invoice;
  }

  /**
   * Customer portal: fetch an invoice by its secret shareToken ONLY.
   *
   * Security: this endpoint is unauthenticated, so the shareToken is the sole
   * authorization factor. Accepting a Mongo `_id` here (as a previous version
   * did) let anyone enumerate every tenant's invoices and customer PII, so an
   * ObjectId-shaped value is now rejected outright.
   */
  public static async getPublicInvoice(shareToken: string): Promise<any> {
    if (!isValidShareTokenFormat(shareToken)) {
      throw new AppError('Invoice not found or invalid link', 404);
    }

    const invoice = await Invoice.findOne({ shareToken: shareToken.trim() })
      .populate('customerId', 'name phone email address')
      .populate('businessId', 'name phone email businessType serviceArea');

    if (!invoice) throw new AppError('Invoice not found or invalid link', 404);
    return invoice;
  }

  /**
   * Customer portal: record a payment against an invoice identified by its
   * secret shareToken ONLY. See getPublicInvoice for the rationale.
   */
  public static async recordPaymentByShareToken(
    shareToken: string,
    payment: {
      amount?: number;
      paymentMethod: PaymentMethod;
      paymentReference?: string;
    }
  ): Promise<IInvoice> {
    if (!isValidShareTokenFormat(shareToken)) {
      throw new AppError('Invoice not found or invalid link', 404);
    }

    const invoice = await Invoice.findOne({ shareToken: shareToken.trim() });
    if (!invoice) throw new AppError('Invoice not found or invalid link', 404);

    return InvoiceService.applyPayment(invoice, payment);
  }

  /**
   * Dashboard: record a manual payment (cash / check / card taken in person).
   *
   * Always scoped by businessId so one tenant can never mutate another
   * tenant's invoice.
   */
  public static async recordPaymentForBusiness(
    businessId: Types.ObjectId | string,
    invoiceId: string,
    payment: {
      amount?: number;
      paymentMethod: PaymentMethod;
      paymentReference?: string;
    }
  ): Promise<IInvoice> {
    if (!Types.ObjectId.isValid(invoiceId)) {
      throw new AppError('Invoice not found', 404);
    }

    const invoice = await Invoice.findOne({ _id: invoiceId, businessId });
    if (!invoice) throw new AppError('Invoice not found', 404);

    return InvoiceService.applyPayment(invoice, payment);
  }

  /**
   * Shared payment-application logic. Validates the amount so a caller cannot
   * post a negative payment (which would reopen a paid invoice) or overpay
   * beyond the outstanding balance.
   */
  private static async applyPayment(
    invoice: IInvoice,
    payment: {
      amount?: number;
      paymentMethod: PaymentMethod;
      paymentReference?: string;
    }
  ): Promise<IInvoice> {
    if (invoice.balanceDue <= 0) {
      throw new AppError('This invoice is already paid in full', 400);
    }

    const requested = payment.amount ?? invoice.balanceDue;
    if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) {
      throw new AppError('Payment amount must be a positive number', 400);
    }

    const payAmount = Math.min(requested, invoice.balanceDue);

    invoice.amountPaid = parseFloat((invoice.amountPaid + payAmount).toFixed(2));
    invoice.balanceDue = parseFloat(Math.max(0, invoice.totalAmount - invoice.amountPaid).toFixed(2));
    invoice.status = invoice.balanceDue === 0 ? 'paid' : 'partially_paid';
    invoice.paymentMethod = payment.paymentMethod;
    invoice.paymentReference = payment.paymentReference || `TXN_${Date.now()}`;
    invoice.paidAt = new Date();

    await invoice.save();
    return invoice;
  }

  /**
   * Customer portal: the homeowner declares they will pay by check / cash /
   * bank transfer.
   *
   * This deliberately does NOT clear the balance. An unauthenticated caller
   * must never be able to mark money as received; the contractor confirms
   * receipt from the dashboard, which routes through
   * recordPaymentForBusiness.
   */
  public static async declareOfflinePaymentIntent(
    shareToken: string,
    paymentMethod: unknown
  ): Promise<{ invoiceNumber: string; pendingMethod: PaymentMethod; balanceDue: number }> {
    if (!isValidShareTokenFormat(shareToken)) {
      throw new AppError('Invoice not found or invalid link', 404);
    }

    const allowed: PaymentMethod[] = ['cash', 'check', 'bank_transfer', 'other'];
    const method = allowed.includes(paymentMethod as PaymentMethod)
      ? (paymentMethod as PaymentMethod)
      : 'other';

    const invoice = await Invoice.findOne({ shareToken: shareToken.trim() });
    if (!invoice) throw new AppError('Invoice not found or invalid link', 404);

    if (invoice.balanceDue <= 0) {
      throw new AppError('This invoice is already paid in full', 400);
    }

    invoice.pendingOfflinePaymentMethod = method;
    invoice.offlinePaymentDeclaredAt = new Date();
    await invoice.save();

    return {
      invoiceNumber: invoice.invoiceNumber,
      pendingMethod: method,
      balanceDue: invoice.balanceDue,
    };
  }

  /**
   * Attaches a Stripe Checkout session id to an invoice so the webhook can
   * later resolve the charge back to this invoice.
   */
  public static async attachCheckoutSession(
    invoiceId: Types.ObjectId | string,
    sessionId: string
  ): Promise<void> {
    await Invoice.findByIdAndUpdate(invoiceId, { stripeCheckoutSessionId: sessionId });
  }

  /**
   * Clears an invoice balance after Stripe has CONFIRMED the charge via a
   * signature-verified webhook. This is the only card path that moves money
   * state, so it is keyed on the Stripe session id rather than any
   * client-supplied identifier.
   */
  public static async markPaidFromStripeSession(
    sessionId: string,
    amountPaidUsd: number,
    paymentReference?: string
  ): Promise<IInvoice | null> {
    const invoice = await Invoice.findOne({ stripeCheckoutSessionId: sessionId });
    if (!invoice) return null;
    if (invoice.balanceDue <= 0) return invoice;

    return InvoiceService.applyPayment(invoice, {
      amount: amountPaidUsd > 0 ? amountPaidUsd : invoice.balanceDue,
      paymentMethod: 'card',
      paymentReference: paymentReference || sessionId,
    });
  }

  // Invoice KPI Summary for Dashboard
  public static async getInvoiceStats(businessId: Types.ObjectId | string): Promise<any> {
    const invoices = await Invoice.find({ businessId });

    let totalBilled = 0;
    let totalCollected = 0;
    let outstandingDue = 0;
    let paidCount = 0;
    let unpaidCount = 0;

    for (const inv of invoices) {
      totalBilled += inv.totalAmount;
      totalCollected += inv.amountPaid;
      outstandingDue += inv.balanceDue;
      if (inv.status === 'paid') paidCount++;
      if (inv.status === 'unpaid' || inv.status === 'partially_paid') unpaidCount++;
    }

    return {
      totalBilled: parseFloat(totalBilled.toFixed(2)),
      totalCollected: parseFloat(totalCollected.toFixed(2)),
      outstandingDue: parseFloat(outstandingDue.toFixed(2)),
      paidCount,
      unpaidCount,
      totalCount: invoices.length,
    };
  }
}
