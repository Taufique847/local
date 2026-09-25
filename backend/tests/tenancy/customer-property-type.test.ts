import { describe, expect, it } from 'vitest';
import { Customer } from '../../src/models/customer.model';
import { CustomerService } from '../../src/services/customer.service';
import { asUser } from '../helpers/agent';
import { createWorkspace } from '../helpers/factories';

/**
 * Customer property type.
 *
 * The customer form has always had a residential/commercial toggle, the customers
 * list has always sent a `propertyType` filter, and five screens have always
 * displayed the value. None of it was backed by anything: `propertyType` was not a
 * field on the Customer schema, so Mongoose stripped it on save, the service never
 * read the filter, and every screen read `undefined` and fell back to printing
 * "Residential" for every customer.
 */

const makeCustomer = (
  businessId: string,
  overrides: Record<string, unknown> = {}
) =>
  CustomerService.createCustomer(businessId, {
    firstName: 'Prop',
    lastName: 'Person',
    phone: '+15552223333',
    ...overrides,
  } as any);

describe('propertyType persists', () => {
  it('saves the value the form sends', async () => {
    const shop = await createWorkspace();

    const dto = await makeCustomer(shop.businessId, { propertyType: 'commercial' });

    // The regression: this was silently discarded on every save.
    expect(dto.propertyType).toBe('commercial');
    const stored = await Customer.findById(dto.id);
    expect(stored?.propertyType).toBe('commercial');
  });

  it('is absent rather than assumed residential when not supplied', async () => {
    // The old UI printed "Residential" for everyone. Not recording a value and
    // asserting residential are different things.
    const shop = await createWorkspace();

    const dto = await makeCustomer(shop.businessId);

    expect(dto.propertyType).toBeUndefined();
  });

  it('can be changed on update', async () => {
    const shop = await createWorkspace();
    const dto = await makeCustomer(shop.businessId, { propertyType: 'residential' });

    const updated = await CustomerService.updateCustomer(shop.businessId, dto.id, {
      propertyType: 'commercial',
    } as any);

    expect(updated.propertyType).toBe('commercial');
  });

  it('is returned on the list DTO', async () => {
    const shop = await createWorkspace();
    await makeCustomer(shop.businessId, { propertyType: 'commercial' });

    const res = await CustomerService.getCustomers(shop.businessId, {} as any);

    expect(res.customers[0].propertyType).toBe('commercial');
  });

  it('is rejected when not one of the two values', async () => {
    const shop = await createWorkspace();

    const res = await asUser(shop.ownerToken).post('/api/customers').send({
      firstName: 'Bad',
      lastName: 'Value',
      phone: '+15551234567',
      propertyType: 'industrial',
    });

    expect(res.status).toBe(400);
  });
});

describe('the propertyType filter actually filters', () => {
  it('returns only matching customers', async () => {
    const shop = await createWorkspace();
    await makeCustomer(shop.businessId, {
      firstName: 'Home',
      propertyType: 'residential',
    });
    await makeCustomer(shop.businessId, {
      firstName: 'Office',
      propertyType: 'commercial',
    });
    await makeCustomer(shop.businessId, { firstName: 'Unrecorded' });

    const commercial = await CustomerService.getCustomers(shop.businessId, {
      propertyType: 'commercial',
    } as any);

    // The regression: the parameter was accepted and discarded, so this used to
    // return all three.
    expect(commercial.customers.map((c) => c.firstName)).toEqual(['Office']);
    expect(commercial.total).toBe(1);
  });

  it('ignores a value outside the enum rather than returning nothing', async () => {
    const shop = await createWorkspace();
    await makeCustomer(shop.businessId, { propertyType: 'residential' });

    const res = await CustomerService.getCustomers(shop.businessId, {
      propertyType: 'industrial',
    } as any);

    expect(res.total).toBe(1);
  });

  it('works through the HTTP endpoint the page calls', async () => {
    const shop = await createWorkspace();
    await makeCustomer(shop.businessId, {
      firstName: 'Office',
      propertyType: 'commercial',
    });
    await makeCustomer(shop.businessId, {
      firstName: 'Home',
      propertyType: 'residential',
    });

    const res = await asUser(shop.ownerToken).get(
      '/api/customers?propertyType=commercial'
    );

    expect(res.status).toBe(200);
    expect((res.body.customers || []).map((c: any) => c.firstName)).toEqual(['Office']);
  });

  it('does not leak across businesses', async () => {
    const alpha = await createWorkspace();
    const beta = await createWorkspace();
    await makeCustomer(alpha.businessId, {
      firstName: 'AlphaOffice',
      propertyType: 'commercial',
    });
    await makeCustomer(beta.businessId, {
      firstName: 'BetaOffice',
      propertyType: 'commercial',
    });

    const res = await CustomerService.getCustomers(alpha.businessId, {
      propertyType: 'commercial',
    } as any);

    expect(res.customers.map((c) => c.firstName)).toEqual(['AlphaOffice']);
  });

  it('combines with the status filter', async () => {
    const shop = await createWorkspace();
    await makeCustomer(shop.businessId, {
      firstName: 'ActiveOffice',
      propertyType: 'commercial',
      status: 'active',
    });
    await makeCustomer(shop.businessId, {
      firstName: 'InactiveOffice',
      propertyType: 'commercial',
      status: 'inactive',
    });

    const res = await CustomerService.getCustomers(shop.businessId, {
      propertyType: 'commercial',
      status: 'active',
    } as any);

    expect(res.customers.map((c) => c.firstName)).toEqual(['ActiveOffice']);
  });
});
