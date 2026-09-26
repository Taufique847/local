import { describe, expect, it } from 'vitest';
import { Appointment } from '../../src/models/appointment.model';
import { Business } from '../../src/models/business.model';
import { Customer } from '../../src/models/customer.model';
import { Service } from '../../src/models/service.model';
import { Technician } from '../../src/models/technician.model';
import { GeocodingService } from '../../src/services/geocoding.service';
import { TechnicianDispatchService } from '../../src/services/technician-dispatch.service';
import { zonedWallClockToUtc, zonedDateKey } from '../../src/utils/format';
import { asUser } from '../helpers/agent';
import {
  createCustomerRecord,
  createServiceRecord,
  createTechnicianRecord,
  createWorkspace,
} from '../helpers/factories';

/**
 * Days 21-23: Geocoding, Real Map Layer, Route Optimization & SMS Dispatch.
 */

const TZ = 'America/Chicago';

const seedDispatchEnv = async () => {
  const shop = await createWorkspace({ timezone: TZ });
  await Business.findByIdAndUpdate(shop.businessId, {
    timezone: TZ,
    address: { street: '100 Main St', city: 'Dallas', state: 'TX', zip: '75201' },
  });
  const [service, customer] = await Promise.all([
    createServiceRecord(shop.businessId),
    createCustomerRecord(shop.businessId, {
      address: { street: '1200 Addison Rd', city: 'Addison', state: 'TX', zip: '75001' },
    }),
  ]);
  return { shop, service, customer };
};

const localAhead = (daysAhead: number, minutesOfDay: number): Date => {
  const key = zonedDateKey(new Date(Date.now() + daysAhead * 86_400_000), TZ);
  const [y, m, d] = key.split('-').map(Number);
  return zonedWallClockToUtc(y, m, d, minutesOfDay, TZ);
};

describe('Day 21: GeocodingService', () => {
  it('geocodes known cities and zip codes deterministically', async () => {
    const dallas = await GeocodingService.geocode('123 Elm St, Dallas, TX 75201');
    expect(dallas).not.toBeNull();
    expect(dallas!.lat).toBeCloseTo(32.7767, 1);
    expect(dallas!.lng).toBeCloseTo(-96.7970, 1);

    const plano = await GeocodingService.geocode('5000 Legacy Dr, Plano, TX 75024');
    expect(plano).not.toBeNull();
    expect(plano!.lat).toBeGreaterThan(32.5);
    expect(plano!.lat).toBeLessThan(33.5);
    expect(plano!.lng).toBeGreaterThan(-97.5);
    expect(plano!.lng).toBeLessThan(-96.0);
  });

  it('calculates honest non-zero distance and driving time between coordinates', () => {
    const dallas = { lat: 32.7767, lng: -96.7970 };
    const plano = { lat: 33.0198, lng: -96.6989 };

    const leg = GeocodingService.calculateDistance(dallas, plano);
    // Straight line ~17 miles, with 1.32x road winding factor ~22-25 miles
    expect(leg.distanceMiles).toBeGreaterThan(15);
    expect(leg.distanceMiles).toBeLessThan(35);
    expect(leg.durationMinutes).toBeGreaterThan(25);
    expect(leg.durationMinutes).toBeLessThan(60);
  });

  it('orders stops chronologically and computes cumulative itinerary', () => {
    const homeBase = {
      address: 'Shop Depot, Dallas',
      coordinates: { lat: 32.7767, lng: -96.7970 },
    };

    const t1 = new Date('2026-10-01T14:00:00Z');
    const t2 = new Date('2026-10-01T16:00:00Z');

    const stops = [
      {
        id: 'job-2',
        title: 'Later Job',
        customerName: 'Bob',
        address: 'Plano, TX',
        coordinates: { lat: 33.0198, lng: -96.6989 },
        startAt: t2,
        status: 'scheduled',
      },
      {
        id: 'job-1',
        title: 'Earlier Job',
        customerName: 'Alice',
        address: 'Addison, TX',
        coordinates: { lat: 32.9618, lng: -96.8292 },
        startAt: t1,
        status: 'scheduled',
      },
    ];

    const itinerary = GeocodingService.computeRouteItinerary(homeBase, stops);
    expect(itinerary.orderedStops).toHaveLength(2);
    expect(itinerary.orderedStops[0].id).toBe('job-1');
    expect(itinerary.orderedStops[1].id).toBe('job-2');
    expect(itinerary.totalDistanceMiles).toBeGreaterThan(0);
    expect(itinerary.totalDriveTimeMinutes).toBeGreaterThan(0);
  });
});

describe('Day 22: Live Dispatch Map Data', () => {
  it('returns appointments, technicians and zones scoped to the business', async () => {
    const ctx = await seedDispatchEnv();
    const other = await seedDispatchEnv();

    const tech = await createTechnicianRecord(ctx.shop.businessId, 'Dave Tech');
    await Technician.findByIdAndUpdate(tech._id, {
      homeBase: {
        address: 'Dallas Hub',
        coordinates: { lat: 32.7767, lng: -96.7970 },
      },
    });

    const slot = localAhead(2, 10 * 60);
    const dateKey = zonedDateKey(slot, TZ);

    // My appointment
    await Appointment.create({
      businessId: ctx.shop.businessId,
      customerId: ctx.customer._id,
      serviceId: ctx.service._id,
      technicianId: tech._id,
      startAt: slot,
      endAt: new Date(slot.getTime() + 60 * 60 * 1000),
      status: 'scheduled',
      timezone: TZ,
      address: '1200 Addison Rd, Addison, TX 75001',
    });

    // Other business's appointment
    await Appointment.create({
      businessId: other.shop.businessId,
      customerId: other.customer._id,
      serviceId: other.service._id,
      startAt: slot,
      endAt: new Date(slot.getTime() + 60 * 60 * 1000),
      status: 'scheduled',
      timezone: TZ,
      address: 'Other Business Address',
    });

    const mapData = await TechnicianDispatchService.getMapData(ctx.shop.businessId, dateKey);
    expect(mapData.appointments).toHaveLength(1);
    expect(mapData.appointments[0].address).toContain('Addison');
    expect(mapData.appointments[0].coordinates).not.toBeNull();
    expect(mapData.appointments[0].coordinates.lat).toBeGreaterThan(30);

    expect(mapData.technicians).toHaveLength(1);
    expect(mapData.technicians[0].name).toBe('Dave Tech');

    // HTTP endpoint test
    const res = await asUser(ctx.shop.ownerToken).get(`/api/dispatch/map-data?date=${dateKey}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.appointments).toHaveLength(1);
    expect(res.body.stats.totalAppointments).toBe(1);
    expect(res.body.stats.geocodedAppointments).toBe(1);
  });
});

describe('Day 23: Route Optimization & SMS Dispatch', () => {
  it('computes daily route and chained efficiency for a technician', async () => {
    const ctx = await seedDispatchEnv();
    const tech = await createTechnicianRecord(ctx.shop.businessId, 'Sam Tech', {
      phone: '+12145550199',
    });

    await Technician.findByIdAndUpdate(tech._id, {
      homeBase: {
        address: '100 Main St, Dallas, TX 75201',
        coordinates: { lat: 32.7767, lng: -96.7970 },
      },
    });

    const slot1 = localAhead(2, 9 * 60);
    const slot2 = localAhead(2, 13 * 60);
    const dateKey = zonedDateKey(slot1, TZ);

    await Appointment.create({
      businessId: ctx.shop.businessId,
      customerId: ctx.customer._id,
      serviceId: ctx.service._id,
      technicianId: tech._id,
      technicianName: 'Sam Tech',
      startAt: slot1,
      endAt: new Date(slot1.getTime() + 60 * 60 * 1000),
      status: 'scheduled',
      timezone: TZ,
      address: 'Addison, TX 75001',
    });

    await Appointment.create({
      businessId: ctx.shop.businessId,
      customerId: ctx.customer._id,
      serviceId: ctx.service._id,
      technicianId: tech._id,
      technicianName: 'Sam Tech',
      startAt: slot2,
      endAt: new Date(slot2.getTime() + 60 * 60 * 1000),
      status: 'scheduled',
      timezone: TZ,
      address: 'Plano, TX 75024',
    });

    const route = await TechnicianDispatchService.getDailyRoute(
      ctx.shop.businessId,
      tech._id.toString(),
      dateKey
    );

    expect(route.orderedStops).toHaveLength(2);
    expect(route.totalDistanceMiles).toBeGreaterThan(0);
    expect(route.totalDriveTimeMinutes).toBeGreaterThan(0);
    expect(route.efficiencyPercent).toBeGreaterThanOrEqual(0);

    // HTTP Route Query
    const res = await asUser(ctx.shop.ownerToken).get(
      `/api/dispatch/route?technicianId=${tech._id}&date=${dateKey}`
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.route.orderedStops).toHaveLength(2);
  });

  it('dispatches the route itinerary with Google Maps multi-waypoint navigation', async () => {
    const ctx = await seedDispatchEnv();
    const tech = await createTechnicianRecord(ctx.shop.businessId, 'Marcus Field', {
      phone: '+12145550188',
    });

    const slot = localAhead(1, 11 * 60);
    const dateKey = zonedDateKey(slot, TZ);

    await Appointment.create({
      businessId: ctx.shop.businessId,
      customerId: ctx.customer._id,
      serviceId: ctx.service._id,
      technicianId: tech._id,
      technicianName: 'Marcus Field',
      startAt: slot,
      endAt: new Date(slot.getTime() + 60 * 60 * 1000),
      status: 'scheduled',
      timezone: TZ,
      address: '500 Main St, Dallas, TX 75201',
    });

    const dispatchResult = await TechnicianDispatchService.dispatchDailyRoute(
      ctx.shop.businessId,
      tech._id.toString(),
      dateKey
    );

    expect(dispatchResult.success).toBe(true);
    expect(typeof dispatchResult.technicianNotified).toBe('boolean');
    expect(dispatchResult.dispatchedToPhone).toBe(tech.phone);
    expect(dispatchResult.mapsUrl).toContain('google.com/maps/dir');
    expect(dispatchResult.routeSummary).toContain('DAILY ROUTE');

    // HTTP Send Route
    const res = await asUser(ctx.shop.ownerToken).post('/api/dispatch/send-route').send({
      technicianId: tech._id.toString(),
      date: dateKey,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.totalStops).toBe(1);
  });
});
