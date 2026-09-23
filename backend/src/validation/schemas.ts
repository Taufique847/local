import { z } from 'zod';

/**
 * Central request schemas.
 *
 * Previously all validation was ad-hoc `if (!x) throw` inside services, and
 * several controllers forwarded `req.body` straight into Mongoose writes. These
 * schemas both reject bad input and strip unknown keys so clients cannot set
 * fields the API never intended to expose.
 */

const trimmed = (max: number) => z.string().trim().max(max);

export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id');

export const usPhone = z
  .string()
  .trim()
  .min(10, 'Enter a valid US phone number')
  .max(20)
  .regex(/^[+()\-.\s\d]+$/, 'Enter a valid US phone number');

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const signupSchema = z.object({
  name: trimmed(120).min(2, 'Please enter your full name'),
  email: z.string().trim().toLowerCase().email('Please provide a valid email address').max(254),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    // bcrypt silently truncates beyond 72 bytes, so cap it explicitly rather
    // than letting users believe a longer passphrase is fully applied.
    .max(72, 'Password must be 72 characters or fewer'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please provide a valid email address').max(254),
  password: z.string().min(1, 'Password is required').max(72),
});

/**
 * Password recovery.
 *
 * The password rules are copied from signupSchema rather than shared, because a
 * reset must never become the weaker of the two paths by accident. Token length
 * is bounded so an oversized body is rejected before any hashing happens.
 */
const emailedToken = z
  .string()
  .trim()
  .min(20, 'This link is not valid')
  .max(512, 'This link is not valid');

const newPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(72, 'Password must be 72 characters or fewer');

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please provide a valid email address').max(254),
});

export const resetPasswordSchema = z.object({
  token: emailedToken,
  password: newPassword,
});

// ---------------------------------------------------------------------------
// Team & invitations
// ---------------------------------------------------------------------------

export const createInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please provide a valid email address').max(254),
  name: trimmed(100).optional(),
  // 'owner' is accepted by the schema and rejected by the service with an
  // explanation, which is a clearer answer than "invalid enum value".
  businessRole: z.enum(['owner', 'dispatcher', 'technician']),
  technicianId: objectId.optional(),
});

export const acceptInviteSchema = z.object({
  token: emailedToken,
  name: trimmed(100).min(2, 'Please enter your full name'),
  password: newPassword,
});

/** At least one field must be present, or the request is a no-op. */
export const updateMemberSchema = z
  .object({
    businessRole: z.enum(['owner', 'dispatcher', 'technician']).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide a role or an active flag to change',
  });

// ---------------------------------------------------------------------------
// Invoices & estimates
// ---------------------------------------------------------------------------

export const lineItemSchema = z.object({
  description: trimmed(300).min(1, 'Line item description is required'),
  quantity: z.coerce.number().positive('Quantity must be greater than zero').max(10000),
  unitPrice: z.coerce.number().min(0, 'Unit price cannot be negative').max(1_000_000),
});

export const createInvoiceSchema = z.object({
  customerId: objectId,
  appointmentId: objectId.optional(),
  estimateId: objectId.optional(),
  title: trimmed(200).optional(),
  items: z.array(lineItemSchema).min(1, 'Add at least one line item'),
  diagnosticFeeCredit: z.coerce.number().min(0).max(100_000).optional(),
  taxRate: z.coerce.number().min(0).max(1).optional(),
  dueDate: z.coerce.date().optional(),
  notes: trimmed(2000).optional(),
});

export const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive('Payment amount must be greater than zero').max(1_000_000).optional(),
  paymentMethod: z.enum(['card', 'cash', 'check', 'bank_transfer', 'other']),
  paymentReference: trimmed(120).optional(),
});

export const estimateTierSchema = z.object({
  tierId: z.enum(['good', 'better', 'best']),
  name: trimmed(120),
  badge: trimmed(60).optional(),
  description: trimmed(500).optional(),
  items: z.array(lineItemSchema).min(1),
  isRecommended: z.boolean().optional(),
});

export const createEstimateSchema = z.object({
  customerId: objectId,
  appointmentId: objectId.optional(),
  leadId: objectId.optional(),
  title: trimmed(200).optional(),
  items: z.array(lineItemSchema).min(1, 'Add at least one line item'),
  tiers: z.array(estimateTierSchema).max(3).optional(),
  diagnosticFeeCredit: z.coerce.number().min(0).max(100_000).optional(),
  taxRate: z.coerce.number().min(0).max(1).optional(),
  terms: trimmed(4000).optional(),
});

// ---------------------------------------------------------------------------
// Public customer portal
// ---------------------------------------------------------------------------

export const approveEstimateSchema = z.object({
  signedByName: trimmed(120).min(2, 'Please type your full name to sign'),
  signatureDataUrl: z
    .string()
    .startsWith('data:image/', 'A signature drawing is required')
    .max(500_000, 'Signature image is too large'),
  selectedTierId: z.enum(['good', 'better', 'best']).optional(),
});

export const declareOfflinePaymentSchema = z.object({
  paymentMethod: z.enum(['cash', 'check', 'bank_transfer', 'other']).default('check'),
});

// ---------------------------------------------------------------------------
// Marketing site demo request
// ---------------------------------------------------------------------------

export const demoRequestSchema = z.object({
  fullName: trimmed(120).min(2, 'Name must be at least 2 characters'),
  businessName: trimmed(160).min(2, 'Company name is required'),
  trade: z.enum(['hvac', 'plumbing', 'electrical', 'roofing', 'multi_trade']),
  phone: usPhone,
  email: z.string().trim().toLowerCase().email('Please enter a valid business email address').max(254),
  monthlyCalls: trimmed(40).min(1, 'Please select your estimated monthly call volume'),
  // Honeypot: real users never fill a hidden field, bots usually do.
  companyWebsite: z.string().max(0).optional(),
  sourcePath: trimmed(300).optional(),
});

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const checkoutSchema = z.object({
  tier: z.enum(['starter', 'pro', 'enterprise']),
  interval: z.enum(['month', 'year']).default('month'),
  successUrl: z.string().url().max(500).optional(),
  cancelUrl: z.string().url().max(500).optional(),
});

// ---------------------------------------------------------------------------
// AI guardrails / policies
// ---------------------------------------------------------------------------

/**
 * Field names match backend/src/models/business-policy.model.ts exactly. The
 * settings UI previously posted `minAdvanceNoticeHours`, which is not a field on
 * that schema, so the value was silently dropped on every save.
 */
export const policySchema = z.object({
  minBookingNoticeHours: z.coerce.number().min(0).max(48),
  maxBookingHorizonDays: z.coerce.number().min(1).max(180),
  emergencyKeywords: z.array(trimmed(60).min(2)).max(100),
  diagnosticFee: z.coerce.number().min(0).max(10_000),
  emergencyFee: z.coerce.number().min(0).max(10_000),
  // A fraction (0.0825 = 8.25%), matching the model. Optional so an existing
  // settings form that does not yet post it keeps working.
  taxRate: z.coerce.number().min(0).max(1).optional(),
  laborRate: z.coerce.number().min(0).max(10_000).optional(),
  requireDiagnosticBeforePricing: z.boolean().optional(),
  afterHoursDispatchEnabled: z.boolean().optional(),
  emergencyTransferPhone: usPhone.optional().or(z.literal('')),
  prohibitedClaims: z.array(trimmed(200).min(2)).max(50).optional(),
  aiDisclosureEnabled: z.boolean().optional(),
  aiDisclosureText: z.union([trimmed(400), z.literal('')]).optional(),
});

/**
 * Onboarding telephony step. Both fields are optional so a contractor who has
 * not yet decided on an escalation number is not blocked from finishing setup.
 */
export const onboardingPhoneSchema = z.object({
  emergencyTransferPhone: z.union([usPhone, z.literal('')]).optional(),
  googleReviewUrl: z
    .union([
      z.string().trim().url('Enter a full URL starting with https://').max(500),
      z.literal(''),
    ])
    .optional(),
});

export const knowledgeItemSchema = z.object({
  question: trimmed(500).min(5, 'Question must be at least 5 characters'),
  answer: trimmed(4000).min(5, 'Answer must be at least 5 characters'),
  category: trimmed(80).optional(),
});

// ---------------------------------------------------------------------------
// Dispatch service zones
// ---------------------------------------------------------------------------

export const serviceZoneSchema = z.object({
  name: trimmed(120).min(2, 'Zone name is required'),
  zipCodes: z
    .array(z.string().trim().regex(/^\d{5}$/, 'Each ZIP code must be 5 digits'))
    .min(1, 'Add at least one ZIP code')
    .max(500),
  travelBufferMinutes: z.coerce.number().min(0).max(240).default(30),
  assignedTechnicianIds: z.array(objectId).max(200).optional(),
  active: z.boolean().optional(),
});

export const technicianSchema = z.object({
  name: trimmed(120).min(2, 'Technician name is required'),
  phone: usPhone,
  email: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal('')),
  // Skill tags gate which jobs this technician can be matched to.
  skills: z.array(trimmed(60).min(2)).max(40).optional(),
  assignedZoneIds: z.array(objectId).max(100).optional(),
});

export const sendMessageSchema = z.object({
  to: usPhone,
  body: trimmed(1600).min(1, 'Message body is required'),
  customerId: objectId.optional(),
  leadId: objectId.optional(),
  appointmentId: objectId.optional(),
  type: trimmed(60).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type DemoRequestInput = z.infer<typeof demoRequestSchema>;
export type ServiceZoneInput = z.infer<typeof serviceZoneSchema>;

// ---------------------------------------------------------------------------
// Customers, leads and appointments
//
// These route families previously had no schema at all. Services validated with
// `if (!input.phone?.trim())`, which crashes rather than rejects when the client
// sends a non-string — a JSON number for `phone` produced
// `500 "data.phone.trim is not a function"`. Schema validation both rejects the
// value with a 400 and strips keys the API never meant to accept.
// ---------------------------------------------------------------------------

const addressSchema = z.object({
  street: trimmed(200).optional(),
  city: trimmed(120).optional(),
  state: trimmed(60).optional(),
  zip: trimmed(20).optional(),
});

export const createCustomerSchema = z.object({
  // Max lengths mirror customer.model.ts so the schema rejects before Mongoose
  // does, with a field-level message instead of a raw validation dump.
  firstName: trimmed(60).min(1, 'First name is required'),
  lastName: trimmed(60).min(1, 'Last name is required'),
  phone: usPhone,
  email: z.union([z.string().trim().toLowerCase().email('Enter a valid email address').max(254), z.literal('')]).optional(),
  address: addressSchema.optional(),
  serviceAddresses: z.array(addressSchema).max(20).optional(),
  notes: trimmed(2000).optional(),
  tags: z.array(trimmed(40)).max(20).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  source: trimmed(60).optional(),
  propertyType: z.enum(['residential', 'commercial']).optional(),
});

/** Every field optional, but at least one must be present. */
export const updateCustomerSchema = createCustomerSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export const createLeadSchema = z.object({
  customerId: objectId.optional(),
  title: trimmed(200).min(1, 'A title is required'),
  description: trimmed(2000).optional(),
  serviceType: trimmed(120).optional(),
  urgency: z.enum(['low', 'medium', 'high', 'emergency']).optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'quoted', 'won', 'lost', 'archived']).optional(),
  source: trimmed(60).optional(),
  estimatedValue: z.coerce.number().min(0).max(1_000_000).optional(),
  contactName: trimmed(120).optional(),
  contactPhone: z.union([usPhone, z.literal('')]).optional(),
  contactEmail: z.union([z.string().trim().toLowerCase().email().max(254), z.literal('')]).optional(),
  address: trimmed(300).optional(),
  notes: trimmed(2000).optional(),
});

export const updateLeadSchema = createLeadSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export const createAppointmentSchema = z.object({
  customerId: objectId,
  serviceId: objectId,
  leadId: objectId.optional(),
  // Coerced to a Date so an unparseable value is a 400 here rather than an
  // `Invalid Date` reaching the conflict check.
  startAt: z.coerce.date({ errorMap: () => ({ message: 'Enter a valid start date and time' }) }),
  endAt: z.coerce.date().optional(),
  description: trimmed(2000).optional(),
  address: trimmed(300).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  source: z.enum(['manual', 'ai_call', 'website', 'referral', 'other']).optional(),
  // The real assignment. `technicianName` is derived from this when present.
  technicianId: objectId.optional(),
  technicianName: trimmed(120).optional(),
  customerNotes: trimmed(2000).optional(),
  internalNotes: trimmed(2000).optional(),
});

/**
 * PUT /api/appointments/:id
 *
 * This route had no schema at all, so it accepted any body and relied on the
 * service to ignore unknown keys. `technicianId` in particular has to be
 * validated as an id before it reaches a tenant-scoped lookup.
 *
 * `technicianId: null` is accepted and means "unassign".
 */
export const updateAppointmentSchema = z
  .object({
    description: trimmed(2000).optional(),
    address: trimmed(300).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    status: z
      .enum([
        'scheduled',
        'confirmed',
        'rescheduled',
        'en_route',
        'arrived',
        'in_progress',
        'completed',
        'cancelled',
        'no_show',
      ])
      .optional(),
    technicianId: z.union([objectId, z.null()]).optional(),
    technicianName: trimmed(120).optional(),
    customerNotes: trimmed(2000).optional(),
    internalNotes: trimmed(2000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

export const appointmentStatusSchema = z.object({
  status: z.enum([
    'scheduled',
    'confirmed',
    'rescheduled',
    'en_route',
    'arrived',
    'in_progress',
    'completed',
    'cancelled',
    'no_show',
  ]),
  cancellationReason: trimmed(500).optional(),
});

export const workerJobStatusSchema = z.object({
  status: z.enum([
    'scheduled',
    'confirmed',
    'en_route',
    'arrived',
    'in_progress',
    'completed',
    'cancelled',
    'no_show',
  ]),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  address: trimmed(300).optional(),
});
