import { describe, expect, it } from 'vitest';
import { Service } from '../../src/models/service.model';
import { Invoice } from '../../src/models/invoice.model';
import { Appointment } from '../../src/models/appointment.model';
import { BusinessPolicy } from '../../src/models/business-policy.model';
import { WorkerService } from '../../src/services/worker.service';
import { InvoiceService } from '../../src/services/invoice.service';
import { createCustomerRecord, createWorkspace } from '../helpers/factories';

/**
 * Pricing on the technician's job-completion path.
 *
 * This code read `svc.price` — a field that does not exist on the Service
 * schema, which carries `startingPrice`. The read was therefore always
 * `undefined` and every invoice fell through to a hardcoded `189`, so a $450
 * service was billed as $189 on every job completed from the field app. The bug
 * was invisible precisely because the fallback produced a plausible number.
 *
 * The same function also hardcoded $95 labour, an $89 diagnostic credit, and a
 * tax rate the caller could not override at all.
 */

/** Builds an appointment whose service has a known price. */
const seedJob = async (businessId: string, startingPrice: number | null) => {
  const customer = await createCustomerRecord(businessId);

  const service = await Service.create({
    businessId,
    name: 'Compressor Replacement',
    category: 'Cooling',
    durationMinutes: 120,
    status: 'active',
    ...(startingPrice === null ? {} : { startingPrice }),
  });

  const startAt = new Date(Date.now() + 60 * 60 * 1000);
  const appointment = await Appointment.create({
    businessId,
    customerId: customer._id,
    serviceId: service._id,
    startAt,
    endAt: new Date(startAt.getTime() + 120 * 60 * 1000),
    status: 'in_progress',
    address: '1 Test St, Testville, TX 75001',
  });

  return { appointment, service, customer };
};

describe('job completion invoice — service price', () => {
  it('bills the service’s actual price, not a hardcoded 189', async () => {
    const shop = await createWorkspace();
    const { appointment } = await seedJob(shop.businessId, 450);

    const { invoice } = await WorkerService.completeJobAndGenerateInvoice(
      shop.businessId,
      appointment._id.toString(),
      {}
    );

    // The regression this test exists for: a $450 service must not produce a
    // $189 line item.
    expect(invoice.items[0].unitPrice).toBe(450);
    expect(invoice.items[0].total).toBe(450);
    expect(invoice.subtotal).toBe(450);
    expect(invoice.items[0].unitPrice).not.toBe(189);
  });

  it('bills a cheap service at its own price too', async () => {
    // Guards against a fix that merely swapped one literal for another.
    const shop = await createWorkspace();
    const { appointment } = await seedJob(shop.businessId, 60);

    const { invoice } = await WorkerService.completeJobAndGenerateInvoice(
      shop.businessId,
      appointment._id.toString(),
      {}
    );

    expect(invoice.subtotal).toBe(60);
  });

  it('falls back to the authorised diagnostic fee when the service has no price', async () => {
    // Not an invented number: the diagnostic fee is the one figure the business
    // has explicitly authorised the assistant to quote.
    const shop = await createWorkspace();
    await BusinessPolicy.create({ businessId: shop.businessId, diagnosticFee: 120 });
    const { appointment } = await seedJob(shop.businessId, null);

    const { invoice } = await WorkerService.completeJobAndGenerateInvoice(
      shop.businessId,
      appointment._id.toString(),
      {}
    );

    expect(invoice.subtotal).toBe(120);
  });
});

describe('job completion invoice — rates come from business policy', () => {
  it('uses the business’s tax rate rather than a fixed 8.25%', async () => {
    const shop = await createWorkspace();
    await BusinessPolicy.create({
      businessId: shop.businessId,
      taxRate: 0.05,
      diagnosticFee: 0,
    });
    const { appointment } = await seedJob(shop.businessId, 1000);

    const { invoice } = await WorkerService.completeJobAndGenerateInvoice(
      shop.businessId,
      appointment._id.toString(),
      {}
    );

    expect(invoice.taxRate).toBe(0.05);
    expect(invoice.taxAmount).toBe(50);
    expect(invoice.totalAmount).toBe(1050);
  });

  it('uses the business’s labour rate for extra hours', async () => {
    const shop = await createWorkspace();
    await BusinessPolicy.create({
      businessId: shop.businessId,
      laborRate: 150,
      taxRate: 0,
      diagnosticFee: 0,
    });
    const { appointment } = await seedJob(shop.businessId, 200);

    const { invoice } = await WorkerService.completeJobAndGenerateInvoice(
      shop.businessId,
      appointment._id.toString(),
      { additionalLaborHours: 2 }
    );

    const labour = invoice.items.find((i: any) => i.description.includes('Labor'));
    expect(labour?.unitPrice).toBe(150);
    expect(labour?.total).toBe(300);
    expect(invoice.subtotal).toBe(500);
  });

  it('lets the caller override the labour rate for one job', async () => {
    const shop = await createWorkspace();
    await BusinessPolicy.create({
      businessId: shop.businessId,
      laborRate: 150,
      taxRate: 0,
      diagnosticFee: 0,
    });
    const { appointment } = await seedJob(shop.businessId, 0);

    const { invoice } = await WorkerService.completeJobAndGenerateInvoice(
      shop.businessId,
      appointment._id.toString(),
      { additionalLaborHours: 1, laborRate: 200 }
    );

    expect(invoice.items.find((i: any) => i.description.includes('Labor'))?.unitPrice).toBe(200);
  });

  it('honours a zero labour rate override instead of treating it as unset', async () => {
    // `||` would have silently replaced 0 with the policy rate. `??` does not.
    const shop = await createWorkspace();
    await BusinessPolicy.create({
      businessId: shop.businessId,
      laborRate: 150,
      taxRate: 0,
      diagnosticFee: 0,
    });
    const { appointment } = await seedJob(shop.businessId, 100);

    const { invoice } = await WorkerService.completeJobAndGenerateInvoice(
      shop.businessId,
      appointment._id.toString(),
      { additionalLaborHours: 3, laborRate: 0 }
    );

    expect(invoice.items.find((i: any) => i.description.includes('Labor'))?.total).toBe(0);
    expect(invoice.subtotal).toBe(100);
  });

  it('credits the business’s diagnostic fee against the taxable base', async () => {
    const shop = await createWorkspace();
    await BusinessPolicy.create({
      businessId: shop.businessId,
      diagnosticFee: 100,
      taxRate: 0.1,
    });
    const { appointment } = await seedJob(shop.businessId, 600);

    const { invoice } = await WorkerService.completeJobAndGenerateInvoice(
      shop.businessId,
      appointment._id.toString(),
      {}
    );

    // The credit reduces the taxable base, not just the total: (600-100)*1.1.
    expect(invoice.subtotal).toBe(600);
    expect(invoice.diagnosticFeeCredit).toBe(100);
    expect(invoice.taxAmount).toBe(50);
    expect(invoice.totalAmount).toBe(550);
    expect(invoice.balanceDue).toBe(550);
  });

  it('never produces a negative taxable base', async () => {
    const shop = await createWorkspace();
    await BusinessPolicy.create({
      businessId: shop.businessId,
      diagnosticFee: 500,
      taxRate: 0.0825,
    });
    const { appointment } = await seedJob(shop.businessId, 100);

    const { invoice } = await WorkerService.completeJobAndGenerateInvoice(
      shop.businessId,
      appointment._id.toString(),
      {}
    );

    expect(invoice.taxAmount).toBe(0);
    expect(invoice.totalAmount).toBe(0);
  });
});

describe('invoices raised through the API', () => {
  it('defaults tax to the business’s rate when the caller omits it', async () => {
    const shop = await createWorkspace();
    await BusinessPolicy.create({ businessId: shop.businessId, taxRate: 0.2 });
    const customer = await createCustomerRecord(shop.businessId);

    const invoice = await InvoiceService.createInvoice(shop.businessId, {
      customerId: customer._id.toString(),
      items: [{ description: 'Service call', quantity: 1, unitPrice: 100 } as any],
    });

    expect(invoice.taxRate).toBe(0.2);
    expect(invoice.totalAmount).toBe(120);
  });

  it('still lets the caller set tax per invoice', async () => {
    const shop = await createWorkspace();
    await BusinessPolicy.create({ businessId: shop.businessId, taxRate: 0.2 });
    const customer = await createCustomerRecord(shop.businessId);

    const invoice = await InvoiceService.createInvoice(shop.businessId, {
      customerId: customer._id.toString(),
      items: [{ description: 'Service call', quantity: 1, unitPrice: 100 } as any],
      taxRate: 0,
    });

    expect(invoice.taxRate).toBe(0);
    expect(invoice.totalAmount).toBe(100);
  });

  it('does not read another business’s tax rate', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();
    await BusinessPolicy.create({ businessId: alpha.businessId, taxRate: 0.01 });
    await BusinessPolicy.create({ businessId: beta.businessId, taxRate: 0.5 });

    const customer = await createCustomerRecord(alpha.businessId);
    const invoice = await InvoiceService.createInvoice(alpha.businessId, {
      customerId: customer._id.toString(),
      items: [{ description: 'Service call', quantity: 1, unitPrice: 100 } as any],
    });

    expect(invoice.taxRate).toBe(0.01);
  });
});

describe('job completion stays idempotent', () => {
  it('does not raise a second invoice on a repeat completion', async () => {
    const shop = await createWorkspace();
    const { appointment } = await seedJob(shop.businessId, 300);
    const id = appointment._id.toString();

    const first = await WorkerService.completeJobAndGenerateInvoice(shop.businessId, id, {});
    const second = await WorkerService.completeJobAndGenerateInvoice(shop.businessId, id, {});

    expect(second.alreadyInvoiced).toBe(true);
    expect(second.invoice._id.toString()).toBe(first.invoice._id.toString());
    expect(await Invoice.countDocuments({ businessId: shop.businessId })).toBe(1);
  });
});
