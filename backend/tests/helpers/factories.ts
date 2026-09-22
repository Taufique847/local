import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { User } from '../../src/models/user.model';
import { Business } from '../../src/models/business.model';
import { Technician } from '../../src/models/technician.model';
import { Customer } from '../../src/models/customer.model';
import { Service } from '../../src/models/service.model';
import { Appointment } from '../../src/models/appointment.model';
import { BusinessRole } from '../../src/types/auth.types';
import { generateToken } from '../../src/utils/token';

/**
 * Fixture builders.
 *
 * These construct records the same way the application does — notably hashing
 * passwords with the same bcrypt cost — so a test exercising login is exercising
 * the real comparison rather than a shortcut.
 */

export const PASSWORD = 'correct horse battery';

interface WorkspaceOptions {
  name?: string;
  ownerEmail?: string;
  phone?: string;
}

export interface Workspace {
  business: any;
  businessId: string;
  owner: any;
  ownerToken: string;
}

export const createUser = async (input: {
  email: string;
  name?: string;
  password?: string;
  role?: 'user' | 'admin';
  businessId?: string | Types.ObjectId | null;
  businessRole?: BusinessRole | null;
  technicianId?: string | Types.ObjectId | null;
  isActive?: boolean;
  emailVerified?: boolean;
}) => {
  const passwordHash = await bcrypt.hash(input.password ?? PASSWORD, 12);
  return User.create({
    name: input.name ?? 'Test Person',
    email: input.email.toLowerCase(),
    passwordHash,
    role: input.role ?? 'user',
    businessId: input.businessId ?? null,
    businessRole: input.businessRole ?? null,
    technicianId: input.technicianId ?? null,
    isActive: input.isActive ?? true,
    emailVerifiedAt: (input.emailVerified ?? true) ? new Date() : null,
  });
};

/**
 * Mints an access token for a user document.
 *
 * Reads `tokenVersion` off the document instead of hardcoding 0, because
 * authMiddleware rejects any token whose `tv` differs from the current value —
 * which is exactly what the session-revocation tests rely on.
 */
export const tokenFor = (user: any): string =>
  generateToken({
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    tv: user.tokenVersion ?? 0,
  });

/** An owner plus their business, linked both ways as the app does after onboarding. */
export const createWorkspace = async (options: WorkspaceOptions = {}): Promise<Workspace> => {
  const ownerEmail = options.ownerEmail ?? `owner-${new Types.ObjectId().toString()}@example.com`;
  const owner = await createUser({ email: ownerEmail, name: 'Owner Person' });

  const business = await Business.create({
    ownerId: owner._id,
    name: options.name ?? 'Test Heating & Air',
    businessType: 'HVAC',
    phone: options.phone ?? '+15551110000',
    onboardingStatus: 'completed',
    onboardingStep: 'completed',
  });

  owner.businessId = business._id;
  owner.businessRole = 'owner';
  await owner.save();

  return {
    business,
    businessId: business._id.toString(),
    owner,
    ownerToken: tokenFor(owner),
  };
};

export const createStaff = async (
  businessId: string | Types.ObjectId,
  businessRole: BusinessRole,
  options: { email?: string; technicianId?: string | Types.ObjectId | null } = {}
) => {
  const user = await createUser({
    email: options.email ?? `${businessRole}-${new Types.ObjectId().toString()}@example.com`,
    name: `${businessRole} Person`,
    businessId,
    businessRole,
    technicianId: options.technicianId ?? null,
  });
  return { user, token: tokenFor(user) };
};

export const createTechnicianRecord = (
  businessId: string | Types.ObjectId,
  name = 'Tech Person'
) =>
  Technician.create({
    businessId,
    name,
    phone: '+15559990000',
    skills: ['ac_repair'],
    status: 'available',
    active: true,
  });

export const createCustomerRecord = (businessId: string | Types.ObjectId) =>
  Customer.create({
    businessId,
    // The model stores first and last name separately; there is no `name` field.
    firstName: 'Homeowner',
    lastName: 'Person',
    phone: '+15552223333',
    email: 'homeowner@example.com',
    address: { street: '1 Test St', city: 'Testville', state: 'TX', zip: '75001' },
  });

export const createServiceRecord = (businessId: string | Types.ObjectId) =>
  Service.create({
    businessId,
    name: 'AC Repair',
    // Enum values are the display-cased ones on service.model.ts, and the price
    // field is `startingPrice`.
    category: 'Cooling',
    startingPrice: 250,
    durationMinutes: 90,
    status: 'active',
  });

/** An appointment, optionally assigned to a technician. */
export const createAppointment = async (
  businessId: string | Types.ObjectId,
  options: { technicianId?: string | Types.ObjectId | null } = {}
) => {
  const [customer, service] = await Promise.all([
    createCustomerRecord(businessId),
    createServiceRecord(businessId),
  ]);

  const startAt = new Date(Date.now() + 60 * 60 * 1000);

  return Appointment.create({
    businessId,
    customerId: customer._id,
    serviceId: service._id,
    technicianId: options.technicianId ?? null,
    startAt,
    endAt: new Date(startAt.getTime() + 90 * 60 * 1000),
    status: 'scheduled',
    address: '1 Test St, Testville, TX 75001',
  });
};
