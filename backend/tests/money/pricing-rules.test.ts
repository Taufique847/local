import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { Appointment } from '../../src/models/appointment.model';
import { BusinessPolicy, IBusinessPolicy } from '../../src/models/business-policy.model';
import { Estimate } from '../../src/models/estimate.model';
import { Service } from '../../src/models/service.model';
import { ServiceZone } from '../../src/models/service-zone.model';
import { EstimateService } from '../../src/services/estimate.service';
import { InvoiceService } from '../../src/services/invoice.service';
import { PricingService } from '../../src/services/pricing.service';
import { TechnicianDispatchService } from '../../src/services/technician-dispatch.service';
import { WorkerService } from '../../src/services/worker.service';
import {
  createEstimateSchema,
  createInvoiceSchema,
  serviceZoneSchema,
} from '../../src/validation/schemas';
import { asUser } from '../helpers/agent';
import { createCustomerRecord, createWorkspace } from '../helpers/factories';

/**
 * Pricing rules (#42).
 *
 * The same arithmetic was duplicated across `invoice.service.ts`,
 * `estimate.service.ts` and `worker.service.ts`, plus a fourth partial copy for
 * estimate tiers, and the copies had already drifted: none of them billed the
 * `emergencyFee` the AI was authorised to quote on the phone, and nothing anywhere
 * charged a travel fee. `PricingService` is now the only thing that does money.
 *
 * These tests are deliberately table-driven on inputs and exact expected totals.
 * A money bug that shifts a total by a cent does not throw, does not log, and is
 * only ever found by someone reading their bill.
 */

/** A policy stub, so `quote` can be exercised without touching the database. */
const policy = (taxRate: number, emergencyFee = 0) =>
  ({ taxRate, emergencyFee } as Pick<IBusinessPolicy, 'taxRate' | 'emergencyFee'>);

const item = (unitPrice: number, quantity = 1, description = 'Work') => ({
  description,
  quantity,
  unitPrice,
});

const cents = (dollars: number) => Math.round(dollars * 100);

/**
 * The money invariants, asserted in cents.
 *
 * Deliberately not `totalAmount === taxableSubtotal + taxAmount` in dollars. That
 * reads like the stronger assertion and is actually a false one: `0.08 + 0.01` is
 * `0.09000000000000001` in IEEE-754 while `9 / 100` is `0.09`, so a correct
 * implementation would fail it. The claim `PricingService` actually makes — and the
 * one a customer's bill depends on — is that every figure is a whole number of cents
 * and that the cents add up.
 *
 * Nor `toBeCloseTo`, which is what lets 419.99999999999994 through, and that figure
 * is what the customer would have read.
 */
const expectExactMoney = (quote: {
  subtotal: number;
  taxableSubtotal: number;
  taxAmount: number;
  totalAmount: number;
  discountAmount: number;
  diagnosticFeeCredit: number;
}) => {
  for (const value of [
    quote.subtotal,
    quote.taxableSubtotal,
    quote.taxAmount,
    quote.totalAmount,
    quote.discountAmount,
    quote.diagnosticFeeCredit,
  ]) {
    expect(value).toBe(cents(value) / 100);
  }

  expect(cents(quote.totalAmount)).toBe(cents(quote.taxableSubtotal) + cents(quote.taxAmount));
  expect(cents(quote.taxableSubtotal)).toBe(
    Math.max(
      0,
      cents(quote.subtotal) - cents(quote.diagnosticFeeCredit) - cents(quote.discountAmount)
    )
  );
};

describe('PricingService.quote — order of operations', () => {
  it('credits the diagnostic fee against the taxable base, not against the total', async () => {
    // (1000 - 100) * 1.1. Crediting after tax would charge tax on money the
    // customer already paid and was already taxed on.
    const quote = PricingService.quote(
      { items: [item(1000)], diagnosticFeeCredit: 100 },
      policy(0.1)
    );

    expect(quote.subtotal).toBe(1000);
    expect(quote.diagnosticFeeCredit).toBe(100);
    expect(quote.taxableSubtotal).toBe(900);
    expect(quote.taxAmount).toBe(90);
    expect(quote.totalAmount).toBe(990);
  });

  it('applies a percentage discount after the credit, not to the gross subtotal', async () => {
    /**
     * 1000 gross, 100 already paid, 10% off.
     *
     * Ours: (1000 - 100) * 0.9 = 810.
     * Discounting the gross subtotal instead: 1000 - 100 - 100 = 800 — handing back
     * a tenth of money the customer had already handed over.
     */
    const quote = PricingService.quote(
      {
        items: [item(1000)],
        diagnosticFeeCredit: 100,
        taxRate: 0,
        discount: { type: 'percentage', value: 10 },
      },
      policy(0.5)
    );

    expect(quote.discountAmount).toBe(90);
    expect(quote.taxableSubtotal).toBe(810);
    expect(quote.totalAmount).toBe(810);
  });

  it('applies the discount before tax, not after', async () => {
    /**
     * 1000 gross, 100 credit, $100 off, 10% tax.
     *
     * Ours: (900 - 100) * 1.1 = 880.
     * Discounting after tax: 900 * 1.1 - 100 = 890 — which means collecting $10 of
     * tax from the customer that the business has no intention of remitting.
     */
    const quote = PricingService.quote(
      {
        items: [item(1000)],
        diagnosticFeeCredit: 100,
        discount: { type: 'fixed', value: 100 },
      },
      policy(0.1)
    );

    expect(quote.taxableSubtotal).toBe(800);
    expect(quote.taxAmount).toBe(80);
    expect(quote.totalAmount).toBe(880);
  });

  it('discounts the fees as well as the labour', async () => {
    // 200 labour + 50 emergency + 25 travel = 275, less 20% = 220.
    const quote = PricingService.quote(
      {
        items: [item(200)],
        emergency: true,
        travelFee: 25,
        taxRate: 0,
        discount: { type: 'percentage', value: 20 },
      },
      policy(0, 50)
    );

    expect(quote.subtotal).toBe(275);
    expect(quote.discountAmount).toBe(55);
    expect(quote.totalAmount).toBe(220);
  });

  it('never produces a negative taxable base from an oversized credit', async () => {
    const quote = PricingService.quote(
      { items: [item(100)], diagnosticFeeCredit: 500 },
      policy(0.0825)
    );

    expect(quote.taxableSubtotal).toBe(0);
    expect(quote.taxAmount).toBe(0);
    expect(quote.totalAmount).toBe(0);
  });
});

describe('PricingService.quote — the total always matches its parts', () => {
  const cases: Array<{
    label: string;
    input: Parameters<typeof PricingService.quote>[0];
    taxRate: number;
    emergencyFee?: number;
    expected: { subtotal: number; taxable: number; tax: number; total: number };
  }> = [
    {
      label: 'plain job',
      input: { items: [item(250)] },
      taxRate: 0.0825,
      expected: { subtotal: 250, taxable: 250, tax: 20.63, total: 270.63 },
    },
    {
      label: 'fractional cents in the tax',
      // 100.10 * 0.0825 = 8.25825, which is 826 cents, not 825.
      input: { items: [item(100.1)] },
      taxRate: 0.0825,
      expected: { subtotal: 100.1, taxable: 100.1, tax: 8.26, total: 108.36 },
    },
    {
      label: 'fractional cents in a percentage discount',
      // 333.33 less 10% = 33.333 dollars off, which is 3333 cents.
      input: { items: [item(333.33)], discount: { type: 'percentage', value: 10 } },
      taxRate: 0.0825,
      expected: { subtotal: 333.33, taxable: 300, tax: 24.75, total: 324.75 },
    },
    {
      label: 'quantities that break float addition',
      // 3 * 1.1 is 3.3000000000000003 in floating point. In cents it is 330.
      input: { items: [item(1.1, 3)] },
      taxRate: 0,
      expected: { subtotal: 3.3, taxable: 3.3, tax: 0, total: 3.3 },
    },
    {
      label: 'the classic 0.1 + 0.2',
      input: { items: [item(0.1), item(0.2)] },
      taxRate: 0,
      expected: { subtotal: 0.3, taxable: 0.3, tax: 0, total: 0.3 },
    },
    {
      label: 'everything at once',
      /**
       * 1234.56 + 175 emergency + 45 travel = 1454.56 gross.
       * Less the 89 credit = 1365.56. 12.5% of that is 17069.5 cents, which rounds
       * to 170.70 off — half a cent in the customer's favour, and the only place in
       * the whole calculation where a half-cent can arise. Taxable 1194.86; 7% of it
       * is 8364.02 cents, so 83.64 tax and 1278.50 to pay.
       */
      input: {
        items: [item(1234.56)],
        diagnosticFeeCredit: 89,
        emergency: true,
        travelFee: 45,
        discount: { type: 'percentage', value: 12.5, reason: 'Repeat customer' },
      },
      taxRate: 0.07,
      emergencyFee: 175,
      expected: { subtotal: 1454.56, taxable: 1194.86, tax: 83.64, total: 1278.5 },
    },
  ];

  for (const testCase of cases) {
    it(`holds for: ${testCase.label}`, async () => {
      const quote = PricingService.quote(
        testCase.input,
        policy(testCase.taxRate, testCase.emergencyFee ?? 0)
      );

      expect(quote.subtotal).toBe(testCase.expected.subtotal);
      expect(quote.taxableSubtotal).toBe(testCase.expected.taxable);
      expect(quote.taxAmount).toBe(testCase.expected.tax);
      expect(quote.totalAmount).toBe(testCase.expected.total);

      expectExactMoney(quote);

      // And the line items must add up to the subtotal they are printed under.
      expect(cents(quote.items.reduce((sum, i) => sum + cents(i.total), 0) / 100)).toBe(
        cents(quote.subtotal)
      );
    });
  }

  it('keeps the invariant exact across a wide sweep of prices', async () => {
    // A cheap property check: no price in this range may break the invariant, and
    // none may produce a figure that is not a whole number of cents.
    for (let value = 1; value <= 2000; value += 7) {
      expectExactMoney(PricingService.quote({ items: [item(value / 100)] }, policy(0.0825)));
      expectExactMoney(
        PricingService.quote(
          {
            items: [item(value / 100, 3)],
            diagnosticFeeCredit: 4.44,
            discount: { type: 'percentage', value: 33 },
          },
          policy(0.0925)
        )
      );
    }
  });
});

describe('PricingService.quote — line item totals are recomputed', () => {
  it('ignores a total supplied by the caller', async () => {
    /**
     * `worker.service.ts` used to write `part.totalCost || part.quantity * part.unitCost`,
     * so a part whose stored total disagreed with its own quantity and price billed
     * the stored figure — while the invoice printed the quantity and price beside it.
     */
    const quote = PricingService.quote(
      { items: [{ description: 'Capacitor', quantity: 2, unitPrice: 30, total: 9999 }], taxRate: 0 },
      policy(0)
    );

    expect(quote.items[0].total).toBe(60);
    expect(quote.subtotal).toBe(60);
  });

  it('handles fractional quantities without drift', async () => {
    // 1.5 hours at 95.50 = 143.25.
    const quote = PricingService.quote({ items: [item(95.5, 1.5)], taxRate: 0 }, policy(0));
    expect(quote.items[0].total).toBe(143.25);
  });

  it('rejects a negative quantity', async () => {
    expect(() => PricingService.quote({ items: [item(100, -1)] }, policy(0))).toThrow(
      /invalid quantity/i
    );
  });

  it('rejects a negative price', async () => {
    expect(() => PricingService.quote({ items: [item(-100)] }, policy(0))).toThrow(/invalid price/i);
  });
});

describe('PricingService.quote — tax rate', () => {
  it('falls back to the business policy rate', async () => {
    expect(PricingService.quote({ items: [item(100)] }, policy(0.06)).taxRate).toBe(0.06);
  });

  it('lets an explicit zero override a non-zero policy rate', async () => {
    // `||` would have thrown the 0 away and billed 6%.
    const quote = PricingService.quote({ items: [item(100)], taxRate: 0 }, policy(0.06));
    expect(quote.taxRate).toBe(0);
    expect(quote.totalAmount).toBe(100);
  });

  it('rejects a percentage passed where a fraction belongs', async () => {
    /**
     * `8.25` and `0.0825` mean the same thing to a human and differ by 100x here.
     * Coercing would occasionally coerce the wrong way on a real invoice, so this
     * refuses rather than guesses.
     */
    expect(() => PricingService.quote({ items: [item(100)], taxRate: 8.25 }, policy(0))).toThrow(
      /fraction, not a percentage/i
    );
  });

  it('rejects a negative tax rate', async () => {
    expect(() => PricingService.quote({ items: [item(100)], taxRate: -0.1 }, policy(0))).toThrow(
      /zero or more/i
    );
  });
});

describe('PricingService.quote — discounts', () => {
  it('records the type, the value as entered and the dollars actually taken off', async () => {
    const quote = PricingService.quote(
      {
        items: [item(400)],
        taxRate: 0,
        discount: { type: 'percentage', value: 25, reason: 'Storm damage goodwill' },
      },
      policy(0)
    );

    expect(quote.discountType).toBe('percentage');
    expect(quote.discountValue).toBe(25);
    expect(quote.discountAmount).toBe(100);
    expect(quote.discountReason).toBe('Storm damage goodwill');
  });

  it('caps a fixed discount at the bill rather than rejecting it', async () => {
    // A $200 goodwill credit on a $150 job zeroes the bill. It does not go negative,
    // and the business does not end up owing tax on a negative base.
    const quote = PricingService.quote(
      { items: [item(150)], discount: { type: 'fixed', value: 200 } },
      policy(0.0825)
    );

    expect(quote.discountValue).toBe(200);
    expect(quote.discountAmount).toBe(150);
    expect(quote.taxableSubtotal).toBe(0);
    expect(quote.taxAmount).toBe(0);
    expect(quote.totalAmount).toBe(0);
  });

  it('allows exactly 100% off', async () => {
    const quote = PricingService.quote(
      { items: [item(500)], discount: { type: 'percentage', value: 100 } },
      policy(0.0825)
    );

    expect(quote.discountAmount).toBe(500);
    expect(quote.totalAmount).toBe(0);
  });

  it('rejects more than 100% off', async () => {
    expect(() =>
      PricingService.quote(
        { items: [item(500)], discount: { type: 'percentage', value: 101 } },
        policy(0)
      )
    ).toThrow(/cannot exceed 100/i);
  });

  it('rejects a negative discount, which would be a surcharge in disguise', async () => {
    expect(() =>
      PricingService.quote(
        { items: [item(500)], discount: { type: 'fixed', value: -50 } },
        policy(0)
      )
    ).toThrow(/zero or more/i);
  });

  it('rejects an unrecognised discount type instead of silently applying nothing', async () => {
    expect(() =>
      PricingService.quote(
        { items: [item(500)], discount: { type: 'bogus' as any, value: 50 } },
        policy(0)
      )
    ).toThrow(/percentage.*fixed/i);
  });

  it('reports no discount when none was given', async () => {
    const quote = PricingService.quote({ items: [item(100)] }, policy(0));
    expect(quote.discountType).toBeUndefined();
    expect(quote.discountValue).toBe(0);
    expect(quote.discountAmount).toBe(0);
  });
});

describe('PricingService.quote — emergency fee', () => {
  it('bills the policy fee as a named line item', async () => {
    /**
     * The gap this closes: `BusinessPolicy.emergencyFee` existed, the AI was
     * authorised to quote it on the phone, and not one of the three invoice paths
     * ever charged it. An after-hours callout was billed as a routine visit.
     */
    const quote = PricingService.quote(
      { items: [item(300)], emergency: true, taxRate: 0 },
      policy(0, 150)
    );

    expect(quote.emergencyFee).toBe(150);
    expect(quote.subtotal).toBe(450);
    expect(quote.items).toHaveLength(2);
    expect(quote.items[1].description).toMatch(/emergency/i);
    expect(quote.items[1].total).toBe(150);
  });

  it('charges nothing and adds no line when the job is not an emergency', async () => {
    const quote = PricingService.quote({ items: [item(300)] }, policy(0, 150));
    expect(quote.emergencyFee).toBe(0);
    expect(quote.items).toHaveLength(1);
  });

  it('lets the caller override the fee for one job', async () => {
    const quote = PricingService.quote(
      { items: [item(300)], emergency: true, emergencyFee: 75, taxRate: 0 },
      policy(0, 150)
    );
    expect(quote.emergencyFee).toBe(75);
    expect(quote.totalAmount).toBe(375);
  });

  it('honours a zero override instead of falling back to the policy fee', async () => {
    const quote = PricingService.quote(
      { items: [item(300)], emergency: true, emergencyFee: 0, taxRate: 0 },
      policy(0, 150)
    );
    expect(quote.emergencyFee).toBe(0);
    expect(quote.items).toHaveLength(1);
  });
});

describe('PricingService.travelFeeForZip', () => {
  it('charges the fee configured on the zone covering that ZIP', async () => {
    const shop = await createWorkspace();
    await ServiceZone.create({
      businessId: shop.businessId,
      name: 'North',
      zipCodes: ['75001', '75002'],
      travelFee: 45,
    });

    expect(await PricingService.travelFeeForZip(shop.businessId, '75002')).toBe(45);
  });

  it('charges nothing for a ZIP no zone covers', async () => {
    // The safe direction: a job outside every configured zone is billed without a
    // travel charge rather than with an arbitrary one.
    const shop = await createWorkspace();
    await ServiceZone.create({
      businessId: shop.businessId,
      name: 'North',
      zipCodes: ['75001'],
      travelFee: 45,
    });

    expect(await PricingService.travelFeeForZip(shop.businessId, '99999')).toBe(0);
  });

  it('ignores a deactivated zone', async () => {
    const shop = await createWorkspace();
    await ServiceZone.create({
      businessId: shop.businessId,
      name: 'Retired',
      zipCodes: ['75001'],
      travelFee: 45,
      active: false,
    });

    expect(await PricingService.travelFeeForZip(shop.businessId, '75001')).toBe(0);
  });

  it('never reads another business’s zone', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();
    await ServiceZone.create({
      businessId: beta.businessId,
      name: 'Beta North',
      zipCodes: ['75001'],
      travelFee: 200,
    });

    expect(await PricingService.travelFeeForZip(alpha.businessId, '75001')).toBe(0);
  });

  it('charges nothing when the customer has no ZIP on file', async () => {
    const shop = await createWorkspace();
    await ServiceZone.create({
      businessId: shop.businessId,
      name: 'North',
      zipCodes: ['75001'],
      travelFee: 45,
    });

    expect(await PricingService.travelFeeForZip(shop.businessId, '')).toBe(0);
    expect(await PricingService.travelFeeForZip(shop.businessId, null)).toBe(0);
  });

  it('defaults an existing zone with no fee configured to zero', async () => {
    // Adding the field must not start charging anyone who never set it.
    const shop = await createWorkspace();
    await ServiceZone.create({
      businessId: shop.businessId,
      name: 'Legacy',
      zipCodes: ['75001'],
    });

    expect(await PricingService.travelFeeForZip(shop.businessId, '75001')).toBe(0);
  });
});

describe('PricingService.resolveJobContext', () => {
  const seedAppointment = async (businessId: string, priority: string, customerId: any) => {
    const service = await Service.create({
      businessId,
      name: 'AC Repair',
      category: 'Cooling',
      startingPrice: 250,
      durationMinutes: 90,
      status: 'active',
    });
    const startAt = new Date(Date.now() + 60 * 60 * 1000);
    return Appointment.create({
      businessId,
      customerId,
      serviceId: service._id,
      startAt,
      endAt: new Date(startAt.getTime() + 90 * 60 * 1000),
      status: 'scheduled',
      priority,
      address: '1 Test St, Testville, TX 75001',
    });
  };

  it('treats an urgent appointment as an emergency', async () => {
    const shop = await createWorkspace();
    const customer = await createCustomerRecord(shop.businessId);
    const apt = await seedAppointment(shop.businessId, 'urgent', customer._id);

    const context = await PricingService.resolveJobContext(shop.businessId, {
      appointmentId: apt._id,
    });

    expect(context.emergency).toBe(true);
  });

  it('does not treat a high-priority appointment as an emergency', async () => {
    // 'high' is a scheduling signal. Only 'urgent' costs the customer money.
    const shop = await createWorkspace();
    const customer = await createCustomerRecord(shop.businessId);
    const apt = await seedAppointment(shop.businessId, 'high', customer._id);

    const context = await PricingService.resolveJobContext(shop.businessId, {
      appointmentId: apt._id,
    });

    expect(context.emergency).toBe(false);
  });

  it('lets an explicit false override an urgent appointment', async () => {
    // An owner waiving the fee must actually waive it.
    const shop = await createWorkspace();
    const customer = await createCustomerRecord(shop.businessId);
    const apt = await seedAppointment(shop.businessId, 'urgent', customer._id);

    const context = await PricingService.resolveJobContext(shop.businessId, {
      appointmentId: apt._id,
      emergency: false,
    });

    expect(context.emergency).toBe(false);
  });

  it('will not read an appointment belonging to another business', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();
    const customer = await createCustomerRecord(beta.businessId);
    const apt = await seedAppointment(beta.businessId, 'urgent', customer._id);

    const context = await PricingService.resolveJobContext(alpha.businessId, {
      appointmentId: apt._id,
    });

    expect(context.emergency).toBe(false);
  });

  it('resolves the travel fee from the customer’s ZIP', async () => {
    const shop = await createWorkspace();
    const customer = await createCustomerRecord(shop.businessId);
    await ServiceZone.create({
      businessId: shop.businessId,
      name: 'North',
      zipCodes: ['75001'],
      travelFee: 35,
    });

    const context = await PricingService.resolveJobContext(shop.businessId, {
      customerId: customer._id,
    });

    expect(context.travelFee).toBe(35);
  });

  it('lets an explicit zero waive a zone’s travel fee', async () => {
    const shop = await createWorkspace();
    const customer = await createCustomerRecord(shop.businessId);
    await ServiceZone.create({
      businessId: shop.businessId,
      name: 'North',
      zipCodes: ['75001'],
      travelFee: 35,
    });

    const context = await PricingService.resolveJobContext(shop.businessId, {
      customerId: customer._id,
      travelFee: 0,
    });

    expect(context.travelFee).toBe(0);
  });

  it('charges no emergency fee when there is no appointment to ask', async () => {
    const shop = await createWorkspace();
    const context = await PricingService.resolveJobContext(shop.businessId, {});
    expect(context.emergency).toBe(false);
    expect(context.travelFee).toBe(0);
  });
});

describe('invoices raised through the API use the pricing engine', () => {
  it('charges the travel fee for the customer’s zone', async () => {
    const shop = await createWorkspace();
    await BusinessPolicy.create({ businessId: shop.businessId, taxRate: 0 });
    const customer = await createCustomerRecord(shop.businessId);
    await ServiceZone.create({
      businessId: shop.businessId,
      name: 'North',
      zipCodes: ['75001'],
      travelFee: 40,
    });

    const invoice = await InvoiceService.createInvoice(shop.businessId, {
      customerId: customer._id.toString(),
      items: [{ description: 'Service call', quantity: 1, unitPrice: 100 } as any],
    });

    expect(invoice.travelFee).toBe(40);
    expect(invoice.subtotal).toBe(140);
    expect(invoice.totalAmount).toBe(140);
    expect(invoice.items.some((i: any) => /travel/i.test(i.description))).toBe(true);
  });

  it('charges the emergency fee when the linked appointment is urgent', async () => {
    const shop = await createWorkspace();
    await BusinessPolicy.create({
      businessId: shop.businessId,
      taxRate: 0,
      emergencyFee: 125,
    });
    const customer = await createCustomerRecord(shop.businessId);
    const service = await Service.create({
      businessId: shop.businessId,
      name: 'AC Repair',
      category: 'Cooling',
      startingPrice: 250,
      durationMinutes: 90,
      status: 'active',
    });
    const startAt = new Date(Date.now() + 60 * 60 * 1000);
    const apt = await Appointment.create({
      businessId: shop.businessId,
      customerId: customer._id,
      serviceId: service._id,
      startAt,
      endAt: new Date(startAt.getTime() + 90 * 60 * 1000),
      status: 'scheduled',
      priority: 'urgent',
      address: '1 Test St, Testville, TX 75001',
    });

    const invoice = await InvoiceService.createInvoice(shop.businessId, {
      customerId: customer._id.toString(),
      appointmentId: apt._id.toString(),
      items: [{ description: 'Service call', quantity: 1, unitPrice: 300 } as any],
    });

    expect(invoice.emergencyFee).toBe(125);
    expect(invoice.totalAmount).toBe(425);
  });

  it('stores the discount and its reason on the invoice', async () => {
    const shop = await createWorkspace();
    await BusinessPolicy.create({ businessId: shop.businessId, taxRate: 0 });
    const customer = await createCustomerRecord(shop.businessId);

    const invoice = await InvoiceService.createInvoice(shop.businessId, {
      customerId: customer._id.toString(),
      items: [{ description: 'Service call', quantity: 1, unitPrice: 500 } as any],
      discount: { type: 'percentage', value: 10, reason: 'Maintenance plan member' },
    });

    expect(invoice.discountType).toBe('percentage');
    expect(invoice.discountValue).toBe(10);
    expect(invoice.discountAmount).toBe(50);
    expect(invoice.discountReason).toBe('Maintenance plan member');
    expect(invoice.totalAmount).toBe(450);
    expect(invoice.balanceDue).toBe(450);
  });

  it('leaves both fees at zero for a business that configured neither', async () => {
    // The regression that matters most: adding fields must not change any existing bill.
    const shop = await createWorkspace();
    await BusinessPolicy.create({ businessId: shop.businessId, taxRate: 0.0825 });
    const customer = await createCustomerRecord(shop.businessId);

    const invoice = await InvoiceService.createInvoice(shop.businessId, {
      customerId: customer._id.toString(),
      items: [{ description: 'Service call', quantity: 1, unitPrice: 200 } as any],
    });

    expect(invoice.emergencyFee).toBe(0);
    expect(invoice.travelFee).toBe(0);
    expect(invoice.discountAmount).toBe(0);
    expect(invoice.items).toHaveLength(1);
    expect(invoice.totalAmount).toBe(216.5);
    expect(invoice.totalAmount).toBe(invoice.subtotal + invoice.taxAmount);
  });
});

describe('the field app’s job completion uses the pricing engine', () => {
  const seedUrgentJob = async (businessId: string, priority: string) => {
    const customer = await createCustomerRecord(businessId);
    const service = await Service.create({
      businessId,
      name: 'Compressor Replacement',
      category: 'Cooling',
      startingPrice: 600,
      durationMinutes: 120,
      status: 'active',
    });
    const startAt = new Date(Date.now() + 60 * 60 * 1000);
    const appointment = await Appointment.create({
      businessId,
      customerId: customer._id,
      serviceId: service._id,
      startAt,
      endAt: new Date(startAt.getTime() + 120 * 60 * 1000),
      status: 'in_progress',
      priority,
      address: '1 Test St, Testville, TX 75001',
    });
    return { appointment, customer };
  };

  it('bills the emergency fee on an urgent job, which it never used to', async () => {
    const shop = await createWorkspace();
    await BusinessPolicy.create({
      businessId: shop.businessId,
      taxRate: 0,
      diagnosticFee: 0,
      emergencyFee: 200,
    });
    const { appointment } = await seedUrgentJob(shop.businessId, 'urgent');

    const { invoice } = await WorkerService.completeJobAndGenerateInvoice(
      shop.businessId,
      appointment._id.toString(),
      {}
    );

    expect(invoice.emergencyFee).toBe(200);
    expect(invoice.subtotal).toBe(800);
    expect(invoice.totalAmount).toBe(800);
  });

  it('bills no emergency fee on a routine job', async () => {
    const shop = await createWorkspace();
    await BusinessPolicy.create({
      businessId: shop.businessId,
      taxRate: 0,
      diagnosticFee: 0,
      emergencyFee: 200,
    });
    const { appointment } = await seedUrgentJob(shop.businessId, 'medium');

    const { invoice } = await WorkerService.completeJobAndGenerateInvoice(
      shop.businessId,
      appointment._id.toString(),
      {}
    );

    expect(invoice.emergencyFee).toBe(0);
    expect(invoice.totalAmount).toBe(600);
  });

  it('bills the travel fee for the customer’s zone', async () => {
    const shop = await createWorkspace();
    await BusinessPolicy.create({
      businessId: shop.businessId,
      taxRate: 0,
      diagnosticFee: 0,
    });
    await ServiceZone.create({
      businessId: shop.businessId,
      name: 'North',
      zipCodes: ['75001'],
      travelFee: 55,
    });
    const { appointment } = await seedUrgentJob(shop.businessId, 'low');

    const { invoice } = await WorkerService.completeJobAndGenerateInvoice(
      shop.businessId,
      appointment._id.toString(),
      {}
    );

    expect(invoice.travelFee).toBe(55);
    expect(invoice.totalAmount).toBe(655);
  });

  it('recomputes a part’s total rather than trusting the stored one', async () => {
    const shop = await createWorkspace();
    await BusinessPolicy.create({
      businessId: shop.businessId,
      taxRate: 0,
      diagnosticFee: 0,
    });
    const { appointment } = await seedUrgentJob(shop.businessId, 'low');

    // A stored total that disagrees with its own quantity and price.
    (appointment as any).partsUsed = [
      { partName: 'Capacitor', quantity: 2, unitCost: 30, totalCost: 9999 },
    ];
    await appointment.save();

    const { invoice } = await WorkerService.completeJobAndGenerateInvoice(
      shop.businessId,
      appointment._id.toString(),
      {}
    );

    const part = invoice.items.find((i: any) => /Capacitor/.test(i.description));
    expect(part?.total).toBe(60);
    expect(invoice.subtotal).toBe(660);
  });
});

describe('estimates price every tier through the same engine', () => {
  const buildTieredEstimate = async (shop: { businessId: string }) => {
    const customer = await createCustomerRecord(shop.businessId);
    await ServiceZone.create({
      businessId: shop.businessId,
      name: 'North',
      zipCodes: ['75001'],
      travelFee: 50,
    });

    return EstimateService.createEstimate(shop.businessId, {
      customerId: customer._id.toString(),
      items: [{ description: 'Repair', quantity: 1, unitPrice: 1000 } as any],
      diagnosticFeeCredit: 100,
      discount: { type: 'percentage', value: 10 },
      tiers: [
        { tierId: 'good', name: 'Good', items: [{ description: 'Patch', quantity: 1, unitPrice: 1000 }] },
        { tierId: 'best', name: 'Best', items: [{ description: 'Replace', quantity: 1, unitPrice: 5000 }] },
      ],
    });
  };

  it('applies the job’s fees, credit and discount to each tier', async () => {
    const shop = await createWorkspace();
    await BusinessPolicy.create({ businessId: shop.businessId, taxRate: 0.1 });
    const estimate = await buildTieredEstimate(shop);

    const good = estimate.tiers!.find((t) => t.tierId === 'good')!;
    const best = estimate.tiers!.find((t) => t.tierId === 'best')!;

    // Good: 1000 + 50 travel = 1050, less 100 credit = 950, less 10% = 855, +10% tax.
    expect(good.subtotal).toBe(1050);
    expect(good.discountAmount).toBe(95);
    expect(good.taxAmount).toBe(85.5);
    expect(good.totalAmount).toBe(940.5);

    // Best: 5000 + 50 = 5050, less 100 = 4950, less 10% = 4455, +10% tax.
    expect(best.subtotal).toBe(5050);
    expect(best.discountAmount).toBe(495);
    expect(best.taxAmount).toBe(445.5);
    expect(best.totalAmount).toBe(4900.5);

    // The percentage discount is recomputed per tier, not copied from the cheapest.
    expect(best.discountAmount).not.toBe(good.discountAmount);
  });

  it('carries the tier’s tax onto the estimate when it is approved', async () => {
    /**
     * The bug: approving a tier copied `items`, `subtotal` and `totalAmount` and left
     * `taxAmount` and `discountAmount` at the base items' values. So an estimate's
     * total came from the chosen tier while its tax came from a different one, and
     * the figures printed on it did not add up to the figure being demanded.
     */
    const shop = await createWorkspace();
    await BusinessPolicy.create({ businessId: shop.businessId, taxRate: 0.1 });
    const estimate = await buildTieredEstimate(shop);

    const approved = await EstimateService.approveEstimate(estimate.shareToken, {
      signedByName: 'Homeowner Person',
      signatureDataUrl: 'data:image/png;base64,AAAA',
      selectedTierId: 'best',
    });

    expect(approved.selectedTierId).toBe('best');
    expect(approved.subtotal).toBe(5050);
    expect(approved.discountAmount).toBe(495);
    expect(approved.taxAmount).toBe(445.5);
    expect(approved.totalAmount).toBe(4900.5);
    // The invariant, on the document the customer signed.
    expect(approved.totalAmount).toBe(
      approved.subtotal - approved.diagnosticFeeCredit - approved.discountAmount + approved.taxAmount
    );
  });

  it('carries the fees and the discount onto the converted invoice', async () => {
    /**
     * `convertToInvoice` builds its `Invoice` directly rather than going through
     * `InvoiceService.createInvoice`, so it has to copy these explicitly. It did not,
     * and an approved quote with a travel charge and a discount became an invoice
     * whose `travelFee` and `discountAmount` columns both read zero while the total
     * still contained them.
     */
    const shop = await createWorkspace();
    await BusinessPolicy.create({ businessId: shop.businessId, taxRate: 0.1 });
    const estimate = await buildTieredEstimate(shop);

    await EstimateService.approveEstimate(estimate.shareToken, {
      signedByName: 'Homeowner Person',
      signatureDataUrl: 'data:image/png;base64,AAAA',
      selectedTierId: 'best',
    });

    const { invoice } = await EstimateService.convertToInvoice(
      shop.businessId,
      estimate._id.toString()
    );

    expect(invoice.travelFee).toBe(50);
    expect(invoice.discountType).toBe('percentage');
    expect(invoice.discountValue).toBe(10);
    expect(invoice.discountAmount).toBe(495);
    expect(invoice.taxAmount).toBe(445.5);
    expect(invoice.totalAmount).toBe(4900.5);
    expect(invoice.balanceDue).toBe(4900.5);
  });

  it('leaves a tier-free estimate priced exactly as before', async () => {
    const shop = await createWorkspace();
    await BusinessPolicy.create({ businessId: shop.businessId, taxRate: 0.0825 });
    const customer = await createCustomerRecord(shop.businessId);

    const estimate = await EstimateService.createEstimate(shop.businessId, {
      customerId: customer._id.toString(),
      items: [{ description: 'Repair', quantity: 1, unitPrice: 200 } as any],
    });

    const stored = await Estimate.findById(estimate._id).lean();
    expect(stored!.tiers).toEqual([]);
    expect(stored!.subtotal).toBe(200);
    expect(stored!.taxAmount).toBe(16.5);
    expect(stored!.totalAmount).toBe(216.5);
    expect(stored!.emergencyFee).toBe(0);
    expect(stored!.travelFee).toBe(0);
  });
});

describe('the request schemas accept the fee overrides safely', () => {
  const baseInvoice = {
    customerId: new Types.ObjectId().toString(),
    items: [{ description: 'Service call', quantity: 1, unitPrice: 100 }],
  };

  it('reads the string "false" as false, not as true', async () => {
    /**
     * `z.coerce.boolean()` would turn the string `"false"` — which is what an HTML
     * form posts — into `true`, so an owner explicitly waiving the emergency fee
     * would have been charged it.
     */
    const parsed = createInvoiceSchema.parse({ ...baseInvoice, emergency: 'false' });
    expect(parsed.emergency).toBe(false);
  });

  it('reads the string "true" as true', async () => {
    expect(createInvoiceSchema.parse({ ...baseInvoice, emergency: 'true' }).emergency).toBe(true);
  });

  it('accepts a real boolean too', async () => {
    expect(createInvoiceSchema.parse({ ...baseInvoice, emergency: true }).emergency).toBe(true);
  });

  it('rejects a string that is neither', async () => {
    // Better a 400 than a guess about what "yes" was meant to mean on a bill.
    expect(() => createInvoiceSchema.parse({ ...baseInvoice, emergency: 'yes' })).toThrow();
  });

  it('carries the discount through with its reason', async () => {
    const parsed = createInvoiceSchema.parse({
      ...baseInvoice,
      discount: { type: 'fixed', value: 50, reason: 'Referral credit' },
    });

    expect(parsed.discount).toEqual({ type: 'fixed', value: 50, reason: 'Referral credit' });
  });

  it('rejects a discount type it does not recognise before it reaches pricing', async () => {
    expect(() =>
      createInvoiceSchema.parse({ ...baseInvoice, discount: { type: 'bogus', value: 50 } })
    ).toThrow();
  });

  it('rejects a negative travel fee override', async () => {
    expect(() => createInvoiceSchema.parse({ ...baseInvoice, travelFee: -10 })).toThrow();
  });

  it('accepts the same overrides on an estimate', async () => {
    const parsed = createEstimateSchema.parse({
      customerId: baseInvoice.customerId,
      items: baseInvoice.items,
      emergency: 'false',
      discount: { type: 'percentage', value: 15 },
    });

    expect(parsed.emergency).toBe(false);
    expect(parsed.discount?.value).toBe(15);
  });

  it('accepts a travel fee on a service zone', async () => {
    const parsed = serviceZoneSchema.parse({
      name: 'North',
      zipCodes: ['75001'],
      travelFee: 45,
    });

    expect(parsed.travelFee).toBe(45);
  });
});

describe('service zones store the travel fee they were given', () => {
  it('persists the fee so pricing can find it', async () => {
    const shop = await createWorkspace();

    const zone = await TechnicianDispatchService.createZone(shop.businessId, {
      name: 'North',
      zipCodes: [' 75001 '],
      travelFee: 65,
    });

    expect(zone.travelFee).toBe(65);
    expect(await PricingService.travelFeeForZip(shop.businessId, '75001')).toBe(65);
  });

  it('defaults the fee to zero when none is given', async () => {
    const shop = await createWorkspace();
    const zone = await TechnicianDispatchService.createZone(shop.businessId, {
      name: 'North',
      zipCodes: ['75001'],
    });

    expect(zone.travelFee).toBe(0);
  });

  it('honours a deliberate zero travel buffer instead of substituting 30', async () => {
    // `|| 30` silently overrode a zone configured with no buffer at all.
    const shop = await createWorkspace();
    const zone = await TechnicianDispatchService.createZone(shop.businessId, {
      name: 'Same block',
      zipCodes: ['75001'],
      travelBufferMinutes: 0,
    });

    expect(zone.travelBufferMinutes).toBe(0);
  });
});

describe('cents conversion survives floating-point representation', () => {
  /**
   * These prices are not arbitrary. `8.29 * 100` is `828.9999999999999` in IEEE-754,
   * and `0.29 * 100` is `28.999999999999996`. Truncating instead of rounding at the
   * dollars-to-cents boundary undercharges by a cent on prices like these — and
   * "a cent" compounds across every line item on every invoice.
   */
  const treacherous = [8.29, 0.29, 1.15, 16.08, 35.85, 1234.57];

  for (const price of treacherous) {
    it(`converts ${price} to whole cents without truncating`, async () => {
      const quote = PricingService.quote({ items: [item(price)], taxRate: 0 }, policy(0));
      expect(quote.items[0].total).toBe(price);
      expect(quote.subtotal).toBe(price);
      expect(quote.totalAmount).toBe(price);
    });
  }

  it('rounds a sub-cent price up rather than dropping the half cent', async () => {
    /**
     * 2.675 is the textbook float trap: `(2.675).toFixed(2)` is `"2.67"`, because the
     * literal is really 2.67499999999999982. Multiplying by 100 first lands on 267.5,
     * which rounds to 268 — the answer a person doing this on paper gets.
     */
    const quote = PricingService.quote({ items: [item(2.675)], taxRate: 0 }, policy(0));

    expect(quote.items[0].total).toBe(2.68);
    expect((2.675).toFixed(2)).toBe('2.67');
  });

  it('rounds a fractional-quantity line to the nearest cent', async () => {
    /**
     * 1.5 hours at $95.55 is 14332.5 cents. Left unrounded it becomes $143.325, which
     * is not an amount anyone can pay and which no display can render honestly.
     */
    const quote = PricingService.quote({ items: [item(95.55, 1.5)], taxRate: 0 }, policy(0));

    expect(quote.items[0].total).toBe(143.33);
    expect(quote.subtotal).toBe(143.33);
    expectExactMoney(quote);
  });

  it('keeps every figure a whole number of cents for a three-quarter-hour line', async () => {
    // 0.75 * 8933 cents = 6699.75.
    const quote = PricingService.quote({ items: [item(89.33, 0.75)] }, policy(0.0825));
    expect(quote.items[0].total).toBe(67);
    expectExactMoney(quote);
  });
});

describe('the travel-fee lookup is scoped and defensive', () => {
  it('does not bill a zone that holds an empty ZIP string to a customer with no ZIP', async () => {
    /**
     * `createZone` trims each entry, so `['  ']` becomes `['']`. A lookup for a
     * customer with no ZIP on file would then match that zone on the empty string and
     * charge its travel fee.
     */
    const shop = await createWorkspace();
    await ServiceZone.create({
      businessId: shop.businessId,
      name: 'Malformed',
      zipCodes: [''],
      travelFee: 75,
    });

    expect(await PricingService.travelFeeForZip(shop.businessId, '')).toBe(0);
    expect(await PricingService.travelFeeForZip(shop.businessId, '   ')).toBe(0);
    expect(await PricingService.travelFeeForZip(shop.businessId, undefined)).toBe(0);
  });

  it('will not read another business’s customer to find a ZIP', async () => {
    /**
     * Alpha has a zone covering 75001 and Beta has a customer living in it. Resolving
     * Alpha's pricing against Beta's customer id must find nothing rather than
     * charging Alpha's fee based on Beta's address.
     */
    const alpha = await createWorkspace();
    const beta = await createWorkspace();
    await ServiceZone.create({
      businessId: alpha.businessId,
      name: 'Alpha North',
      zipCodes: ['75001'],
      travelFee: 90,
    });
    const betaCustomer = await createCustomerRecord(beta.businessId);

    const context = await PricingService.resolveJobContext(alpha.businessId, {
      customerId: betaCustomer._id,
    });

    expect(context.travelFee).toBe(0);
  });
});

describe('the field app honours a deliberate zero', () => {
  it('accepts a zero diagnostic credit instead of falling back to the policy fee', async () => {
    /**
     * A job booked online never collected a diagnostic fee, so there is nothing to
     * credit. `||` would have thrown the 0 away and credited the policy's fee against
     * a bill the customer never paid it on — undercharging by that amount.
     */
    const shop = await createWorkspace();
    await BusinessPolicy.create({
      businessId: shop.businessId,
      taxRate: 0,
      diagnosticFee: 100,
    });
    const customer = await createCustomerRecord(shop.businessId);
    const service = await Service.create({
      businessId: shop.businessId,
      name: 'Tune-up',
      category: 'Cooling',
      startingPrice: 400,
      durationMinutes: 60,
      status: 'active',
    });
    const startAt = new Date(Date.now() + 60 * 60 * 1000);
    const appointment = await Appointment.create({
      businessId: shop.businessId,
      customerId: customer._id,
      serviceId: service._id,
      startAt,
      endAt: new Date(startAt.getTime() + 60 * 60 * 1000),
      status: 'in_progress',
      priority: 'low',
      address: '1 Test St, Testville, TX 75001',
    });

    const { invoice } = await WorkerService.completeJobAndGenerateInvoice(
      shop.businessId,
      appointment._id.toString(),
      { diagnosticFeeCredit: 0 }
    );

    expect(invoice.diagnosticFeeCredit).toBe(0);
    expect(invoice.totalAmount).toBe(400);
  });
});

describe('the dispatch route carries the travel fee through to the zone', () => {
  it('stores a fee posted to POST /api/dispatch/zones', async () => {
    /**
     * The controller destructures the body by hand, so a field the zod schema accepts
     * can still be dropped one line later and never reach the model. Nothing else in
     * the suite crosses that boundary for this field.
     */
    const shop = await createWorkspace();

    const res = await asUser(shop.ownerToken)
      .post('/api/dispatch/zones')
      .send({ name: 'North', zipCodes: ['75001'], travelFee: 85 });

    expect(res.status).toBe(201);
    expect(res.body.zone.travelFee).toBe(85);
    expect(await PricingService.travelFeeForZip(shop.businessId, '75001')).toBe(85);
  });
});
