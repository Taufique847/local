import { Types } from 'mongoose';
import { ServiceZone } from '../models/service-zone.model';
import { Appointment } from '../models/appointment.model';
import { Customer } from '../models/customer.model';
import { IBusinessPolicy } from '../models/business-policy.model';
import { AppError } from '../types';

/**
 * One place where money is calculated.
 *
 * The same six lines of arithmetic were duplicated in `invoice.service.ts`,
 * `estimate.service.ts` and `worker.service.ts`, and a fourth partial copy computed
 * estimate tiers. That is how they drifted: `worker.service.ts` hardcoded an 8.25% tax
 * rate the caller could not override, and none of the three billed the `emergencyFee`
 * the AI was quoting on the phone.
 *
 * Two rules this module holds that the copies did not:
 *
 *  1. **Everything is computed in integer cents.** Summing floats produces totals like
 *     419.99999999999994, and `toFixed(2)` on each intermediate step compounds the error
 *     instead of removing it. Cents in, cents out, one conversion at the boundary.
 *  2. **`totalAmount` is derived, never independently rounded.** In cents,
 *     `total === taxableSubtotal + taxAmount` holds exactly, because the total is the
 *     sum of the two integers the other figures were rounded from. Round the total
 *     separately and an invoice's own line items stop adding up to the figure the
 *     customer is asked to pay.
 *
 *     Stated in cents on purpose. The dollar-level equality is not quite the same
 *     claim — `0.08 + 0.01` is `0.09000000000000001` in IEEE-754 — which is exactly
 *     why nothing downstream should be re-adding these in floats.
 */

export interface PricingLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  /** Computed. Any value passed in is recalculated, not trusted. */
  total?: number;
  /**
   * Whether this line item is subject to sales tax.
   * Under US state tax codes (e.g. Texas Tax Code § 151.0101, FL, NJ),
   * residential repair and installation labor is strictly tax-exempt,
   * whereas tangible personal property (parts, equipment, materials) is taxable.
   * Defaults to true for backward compatibility.
   */
  taxable?: boolean;
}


export type DiscountType = 'percentage' | 'fixed';

export interface PricingDiscount {
  type: DiscountType;
  /** Percent (0–100) when `type` is 'percentage', dollars when 'fixed'. */
  value: number;
  /** Recorded on the document. A discount nobody can explain later is a write-off. */
  reason?: string;
}

export interface PricingInput {
  items: PricingLineItem[];
  /** Trip/diagnostic fee already collected, credited against this bill. */
  diagnosticFeeCredit?: number;
  /** Overrides `policy.taxRate`. A fraction, not a percentage. */
  taxRate?: number;
  /** Bills the emergency fee. Resolved from the appointment's priority by callers. */
  emergency?: boolean;
  /** Overrides `policy.emergencyFee`. */
  emergencyFee?: number;
  /** Resolved from the service zone matching the job's zip. */
  travelFee?: number;
  discount?: PricingDiscount;
}

export interface Quote {
  /** Input items with `total` computed, plus any fee lines that were added. */
  items: Required<PricingLineItem>[];
  subtotal: number;
  diagnosticFeeCredit: number;
  emergencyFee: number;
  travelFee: number;
  discountType?: DiscountType;
  discountValue: number;
  discountAmount: number;
  discountReason?: string;
  /** What tax is charged on, after fees, credit and discount. Never negative. */
  taxableSubtotal: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
}

/** Dollars to integer cents. Rounds once, at the boundary. */
const toCents = (dollars: number): number => Math.round((Number(dollars) || 0) * 100);
const toDollars = (cents: number): number => cents / 100;

export class PricingService {
  /**
   * Prices a set of line items.
   *
   * Order of operations, which is a policy decision and not an implementation detail:
   *
   * ```
   *   subtotal      = sum(items) + emergencyFee + travelFee
   *   discountBase  = subtotal - diagnosticFeeCredit
   *   discount      = percentage ? discountBase * pct : fixed
   *   taxableSubtotal = max(0, discountBase - discount)
   *   taxAmount     = taxableSubtotal * taxRate
   *   totalAmount   = taxableSubtotal + taxAmount
   * ```
   *
   * The two choices worth naming:
   *
   *  - **The diagnostic credit reduces the taxable base**, it is not a payment against
   *    the total. The customer already paid that money and was already taxed on it;
   *    taxing it again inside this invoice would charge tax twice on the same dollar.
   *  - **A percentage discount applies after the credit and before tax**, and it applies
   *    to the fees as well as the labour. Discounting the pre-credit subtotal would
   *    hand back a percentage of money the customer already paid, and applying the
   *    discount after tax would mean collecting tax the business then refuses to remit.
   */
  public static quote(
    input: PricingInput,
    policy: Pick<IBusinessPolicy, 'taxRate' | 'emergencyFee'>
  ): Quote {
    const items: Required<PricingLineItem>[] = (input.items ?? []).map((item) => {
      const quantity = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);

      if (!Number.isFinite(quantity) || quantity < 0) {
        throw new AppError(`Line item "${item.description}" has an invalid quantity.`, 400);
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new AppError(`Line item "${item.description}" has an invalid price.`, 400);
      }

      /**
       * `total` is recomputed from quantity and price, never taken from the caller.
       *
       * Three of the old call sites accepted an incoming `total` and one of them
       * defaulted it with `part.totalCost || quantity * unitCost` — so a part whose
       * stored total disagreed with its own quantity and price silently billed the
       * stored figure.
       */
      return {
        description: item.description,
        quantity,
        unitPrice,
        total: toDollars(Math.round(toCents(unitPrice) * quantity)),
        taxable: item.taxable !== false,
      };
    });

    let subtotalCents = items.reduce((sum, item) => sum + toCents(item.total), 0);

    /**
     * The emergency fee, which nothing used to bill.
     *
     * `BusinessPolicy.emergencyFee` existed, the AI was authorised to quote it on the
     * phone, and no invoice ever charged it — so an after-hours callout was billed as a
     * routine visit. Added as a visible line item rather than folded into the subtotal,
     * because a customer who was told about a fee should see it named.
     */
    const emergencyFee = input.emergency
      ? Math.max(0, Number(input.emergencyFee ?? policy.emergencyFee) || 0)
      : 0;

    if (emergencyFee > 0) {
      items.push({
        description: 'Emergency / after-hours callout',
        quantity: 1,
        unitPrice: emergencyFee,
        total: emergencyFee,
        taxable: true,
      });
      subtotalCents += toCents(emergencyFee);
    }

    const travelFee = Math.max(0, Number(input.travelFee ?? 0) || 0);

    if (travelFee > 0) {
      items.push({
        description: 'Travel / trip charge',
        quantity: 1,
        unitPrice: travelFee,
        total: travelFee,
        taxable: true,
      });
      subtotalCents += toCents(travelFee);
    }

    const diagnosticCreditCents = Math.max(
      0,
      toCents(Number(input.diagnosticFeeCredit ?? 0) || 0)
    );

    // Cannot credit more than was billed; a negative base is not a refund mechanism.
    const discountBaseCents = Math.max(0, subtotalCents - diagnosticCreditCents);

    const { discountAmountCents, discountType, discountValue, discountReason } =
      this.resolveDiscount(input.discount, discountBaseCents);

    /**
     * No `Math.max(0, …)` here, deliberately.
     *
     * `resolveDiscount` caps by construction — a percentage cannot exceed 100 and a
     * fixed amount is clamped to `baseCents` — so this subtraction cannot go negative.
     * A second clamp here looked prudent and was in fact unreachable: it could not be
     * tested, and an untestable guard on a money path is not insurance, it is a claim
     * nobody can check. The cap is asserted where it is actually made, at both of its
     * boundaries.
     */
    const netBaseCents = discountBaseCents - discountAmountCents;

    /**
     * Under US State tax rules (e.g. Texas Tax Code § 151.0101, FL, NJ, etc.),
     * residential repair and installation labor is strictly tax-exempt,
     * whereas tangible personal property (parts, equipment, materials) is taxable.
     * If all items are taxable (standard default), ratio is 1.0 (exact backward compatibility).
     * If labor is specified as exempt (taxable: false), only taxable items receive sales tax.
     */
    const taxableItemsCents = items
      .filter((item) => item.taxable !== false)
      .reduce((sum, item) => sum + toCents(item.total), 0);

    const taxableRatio = subtotalCents > 0 ? taxableItemsCents / subtotalCents : 1;
    const taxableCents = Math.round(netBaseCents * taxableRatio);

    const taxRate = this.resolveTaxRate(input.taxRate ?? policy.taxRate);
    const taxCents = Math.round(taxableCents * taxRate);


    return {
      items,
      subtotal: toDollars(subtotalCents),
      diagnosticFeeCredit: toDollars(diagnosticCreditCents),
      emergencyFee,
      travelFee,
      discountType,
      discountValue,
      discountAmount: toDollars(discountAmountCents),
      discountReason,
      taxableSubtotal: toDollars(taxableCents),
      taxRate,
      taxAmount: toDollars(taxCents),
      /**
       * Derived from the two integers, so the cents add up by construction.
       *
       * Rounding the dollar sum instead — `Number((taxable + tax).toFixed(2))` — is in
       * fact observationally identical here, and a mutation test confirms nothing
       * distinguishes them. It is identical only because of an argument about ulps:
       * the true value always sits exactly on a whole cent, so the ~1e-13 error in the
       * float addition can never push `toFixed(2)` across a rounding boundary.
       *
       * This form needs no such argument, which is the point. The moment someone adds
       * a third addend or a larger magnitude, the argument is what would quietly stop
       * holding — and it would stop holding on a customer's bill.
       */
      totalAmount: toDollars(netBaseCents + taxCents),
    };
  }


  private static resolveTaxRate(rate: unknown): number {
    const value = Number(rate);

    if (!Number.isFinite(value) || value < 0) {
      throw new AppError('Tax rate must be a number of zero or more.', 400);
    }

    /**
     * A fraction, not a percentage.
     *
     * `0.0825` is 8.25%. Someone entering `8.25` means the same thing and would be
     * billed 825% tax, which is why this is rejected rather than coerced — guessing
     * which they meant would occasionally guess wrong on a real invoice.
     */
    if (value > 1) {
      throw new AppError(
        `Tax rate must be a fraction, not a percentage — 0.0825 for 8.25%. Received ${value}.`,
        400
      );
    }

    return value;
  }

  private static resolveDiscount(
    discount: PricingDiscount | undefined,
    baseCents: number
  ): {
    discountAmountCents: number;
    discountType?: DiscountType;
    discountValue: number;
    discountReason?: string;
  } {
    if (!discount) return { discountAmountCents: 0, discountValue: 0 };

    const value = Number(discount.value);

    if (!Number.isFinite(value) || value < 0) {
      throw new AppError('Discount must be a number of zero or more.', 400);
    }

    if (discount.type === 'percentage') {
      if (value > 100) {
        throw new AppError('A percentage discount cannot exceed 100%.', 400);
      }
      return {
        discountAmountCents: Math.round(baseCents * (value / 100)),
        discountType: 'percentage',
        discountValue: value,
        discountReason: discount.reason,
      };
    }

    if (discount.type === 'fixed') {
      /**
       * Capped at the base rather than rejected.
       *
       * A $200 goodwill credit on a $150 job is a legitimate thing for an owner to
       * enter. It zeroes the bill; it does not produce a negative invoice, and the
       * business does not end up owing tax on a negative base.
       */
      return {
        discountAmountCents: Math.min(baseCents, toCents(value)),
        discountType: 'fixed',
        discountValue: value,
        discountReason: discount.reason,
      };
    }

    throw new AppError("Discount type must be 'percentage' or 'fixed'.", 400);
  }

  /**
   * The travel fee for a job, from the service zone matching its zip.
   *
   * Returns 0 when nothing matches, which is the safe direction: a job outside every
   * configured zone is billed without a travel charge rather than with an arbitrary one.
   * Zones are matched on exact zip, the same way dispatch matches them, so the fee an
   * invoice charges and the zone a technician was dispatched from cannot disagree.
   */
  public static async travelFeeForZip(
    businessId: Types.ObjectId | string,
    zip: string | undefined | null
  ): Promise<number> {
    const clean = (zip ?? '').trim();

    /**
     * Not just an early-out for the query.
     *
     * `zipCodes` is an array of strings and `createZone` trims each entry, so a zone
     * created outside the zod schema can hold an empty string. Without this line,
     * `findOne({ zipCodes: '' })` matches that zone and bills its travel fee to every
     * customer who has no ZIP on file.
     */
    if (!clean) return 0;

    const zone = await ServiceZone.findOne({
      businessId,
      zipCodes: clean,
      active: true,
    })
      .select('travelFee')
      .lean();

    return Math.max(0, Number(zone?.travelFee ?? 0) || 0);
  }

  /**
   * Where `emergency` and `travelFee` come from, in one place.
   *
   * Three call sites raise invoices and estimates and each one would otherwise have
   * had to remember that "emergency" means `appointment.priority === 'urgent'` and
   * that the zip to match a zone against is the customer's, not the appointment's.
   * One of them forgetting is how the emergency fee came to be quoted on the phone
   * and never billed.
   *
   * An explicit value from the caller always wins — an owner raising a manual invoice
   * can charge or waive either fee regardless of what the appointment says.
   *
   * `Appointment.address` is a free-form string, so the zip is read from
   * `Customer.address.zip`, which is structured. The zone lookup matches the exact
   * zip the same way `TechnicianDispatchService.findZoneForZip` does, so the fee an
   * invoice charges cannot disagree with the zone a technician was dispatched from.
   */
  public static async resolveJobContext(
    businessId: Types.ObjectId | string,
    opts: {
      appointmentId?: Types.ObjectId | string | null;
      customerId?: Types.ObjectId | string | null;
      /** Already-known values. Skip the corresponding lookup when set. */
      priority?: string | null;
      zip?: string | null;
      emergency?: boolean;
      travelFee?: number;
    }
  ): Promise<{ emergency: boolean; travelFee: number }> {
    let emergency = opts.emergency;

    if (emergency === undefined) {
      let priority = opts.priority;

      if (priority === undefined && opts.appointmentId) {
        const apt = await Appointment.findOne({ _id: opts.appointmentId, businessId })
          .select('priority')
          .lean();
        priority = apt?.priority ?? null;
      }

      emergency = priority === 'urgent';
    }

    let travelFee = opts.travelFee;

    if (travelFee === undefined) {
      let zip = opts.zip;

      if (zip === undefined && opts.customerId) {
        const customer = await Customer.findOne({ _id: opts.customerId, businessId })
          .select('address.zip')
          .lean();
        zip = (customer as any)?.address?.zip ?? null;
      }

      travelFee = await this.travelFeeForZip(businessId, zip);
    }

    return { emergency, travelFee: Math.max(0, Number(travelFee) || 0) };
  }
}
