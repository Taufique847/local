import { describe, expect, it } from 'vitest';
import { asAnon } from '../helpers/agent';
import { Estimate } from '../../src/models/estimate.model';
import { Invoice } from '../../src/models/invoice.model';
import { generateShareToken } from '../../src/utils/share-token';
import { createCustomerRecord, createWorkspace } from '../helpers/factories';

/**
 * Customer portal authorization.
 *
 * These endpoints are fully public — a homeowner opens them from an SMS link with
 * no account anywhere in the product. The secret share token is therefore the
 * ONLY authorization factor on documents containing names, addresses, phone
 * numbers, prices and live payment links.
 *
 * The original lookup was `findOne({ $or: [{ shareToken: token }, { _id: token }] })`,
 * which meant passing a Mongo ObjectId retrieved from anywhere — a log, a
 * referrer header, an incrementing guess against a short id — returned the
 * document and bypassed the token completely.
 */

const seedEstimate = async (businessId: string) => {
  const customer = await createCustomerRecord(businessId);
  const shareToken = generateShareToken('est');

  const estimate = await Estimate.create({
    businessId,
    customerId: customer._id,
    estimateNumber: 'EST-9001',
    shareToken,
    status: 'sent',
    items: [{ description: 'Compressor replacement', quantity: 1, unitPrice: 1800, total: 1800 }],
    subtotal: 1800,
    taxAmount: 0,
    total: 1800,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return { estimate, shareToken, customer };
};

const seedInvoice = async (businessId: string) => {
  const customer = await createCustomerRecord(businessId);
  const shareToken = generateShareToken('inv');

  const invoice = await Invoice.create({
    businessId,
    customerId: customer._id,
    invoiceNumber: 'INV-9001',
    shareToken,
    // Invoice status enum has no 'sent' — an issued, unpaid invoice is 'unpaid'.
    status: 'unpaid',
    items: [{ description: 'Service call', quantity: 1, unitPrice: 250, total: 250 }],
    subtotal: 250,
    taxAmount: 0,
    total: 250,
    amountPaid: 0,
    balanceDue: 250,
  });

  return { invoice, shareToken, customer };
};

describe('portal estimates — share token is the only key', () => {
  it('serves the estimate for the correct token', async () => {
    const shop = await createWorkspace();
    const { shareToken } = await seedEstimate(shop.businessId);

    const res = await asAnon().get(`/api/portal/quotes/${shareToken}`);
    expect(res.status).toBe(200);
    expect(res.body.estimate).toBeTruthy();
  });

  it('refuses the raw ObjectId', async () => {
    const shop = await createWorkspace();
    const { estimate } = await seedEstimate(shop.businessId);

    // The exact bypass that existed: substitute the document id for the token.
    const res = await asAnon().get(`/api/portal/quotes/${estimate._id.toString()}`);
    expect(res.status).toBe(404);
    expect(res.body.estimate).toBeFalsy();
  });

  it('refuses a well-formed token that belongs to nothing', async () => {
    const shop = await createWorkspace();
    await seedEstimate(shop.businessId);

    const res = await asAnon().get(`/api/portal/quotes/${generateShareToken('est')}`);
    expect(res.status).toBe(404);
  });

  it('refuses another document’s token', async () => {
    const shop = await createWorkspace();
    await seedEstimate(shop.businessId);
    const { shareToken: invoiceToken } = await seedInvoice(shop.businessId);

    // An invoice token must not open an estimate, even inside one workspace.
    const res = await asAnon().get(`/api/portal/quotes/${invoiceToken}`);
    expect(res.status).toBe(404);
  });

  it('cannot be approved with a wrong token', async () => {
    const shop = await createWorkspace();
    const { estimate } = await seedEstimate(shop.businessId);

    const res = await asAnon()
      .post(`/api/portal/quotes/${estimate._id.toString()}/approve`)
      .send({
        signedByName: 'Not The Customer',
        signatureDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      });

    expect(res.status).toBe(404);

    // A signature must not have been recorded against the document.
    const reloaded = await Estimate.findById(estimate._id);
    expect(reloaded?.status).toBe('sent');
    expect((reloaded as any)?.signature?.signedByName).toBeFalsy();
  });
});

describe('portal invoices — share token is the only key', () => {
  it('serves the invoice for the correct token', async () => {
    const shop = await createWorkspace();
    const { shareToken } = await seedInvoice(shop.businessId);

    const res = await asAnon().get(`/api/portal/invoices/${shareToken}`);
    expect(res.status).toBe(200);
    expect(res.body.invoice).toBeTruthy();
  });

  it('refuses the raw ObjectId', async () => {
    const shop = await createWorkspace();
    const { invoice } = await seedInvoice(shop.businessId);

    const res = await asAnon().get(`/api/portal/invoices/${invoice._id.toString()}`);
    expect(res.status).toBe(404);
  });

  it('refuses an estimate token', async () => {
    const shop = await createWorkspace();
    const { shareToken: estimateToken } = await seedEstimate(shop.businessId);
    await seedInvoice(shop.businessId);

    const res = await asAnon().get(`/api/portal/invoices/${estimateToken}`);
    expect(res.status).toBe(404);
  });

  it('does not let a homeowner clear their own balance', async () => {
    const shop = await createWorkspace();
    const { invoice, shareToken } = await seedInvoice(shop.businessId);

    // Declaring intent to pay offline is allowed; settling the invoice is not.
    // Only the contractor can confirm money actually arrived.
    await asAnon()
      .post(`/api/portal/invoices/${shareToken}/declare-offline-payment`)
      .send({ paymentMethod: 'check' });

    const reloaded = await Invoice.findById(invoice._id);
    expect(reloaded?.status).not.toBe('paid');
    expect(reloaded?.amountPaid).toBe(0);
    expect(reloaded?.balanceDue).toBe(250);
  });
});
