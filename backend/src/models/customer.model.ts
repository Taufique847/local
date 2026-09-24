import { Schema, model } from 'mongoose';
import { ICustomer } from '../types/customer.types';

const customerSchema = new Schema<ICustomer>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [60, 'First name cannot exceed 60 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [60, 'Last name cannot exceed 60 characters'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please enter a valid email address',
      ],
    },
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      zip: { type: String, trim: true },
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Notes cannot exceed 2000 characters'],
    },
    tags: {
      type: [String],
      default: [],
      index: true,
    },
    /**
     * Total money actually received from this customer.
     *
     * Declared since the first version of this schema and written by nothing, so it
     * was permanently `0` — `customer-360.service.ts` even computes a fallback on
     * read because the stored value could never be trusted. That made it useless for
     * filtering: a "customers worth more than $500" segment would always be empty.
     *
     * Now incremented in `InvoiceService.applyPayment`, the single function every
     * payment route funnels through. Payments received, not invoices raised: an
     * unpaid invoice is not lifetime value.
     */
    lifetimeValue: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    /**
     * When work was last completed for this customer.
     *
     * Denormalised deliberately. Deriving it per query means an aggregation over
     * appointments for every segment count on the page, and segment counts are shown
     * live next to each saved segment. Maintained on the completion path and
     * backfillable with `npm run backfill:customer-rollups`.
     */
    lastServiceAt: {
      type: Date,
      default: null,
      index: true,
    },
    serviceAddresses: [
      {
        street: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        zip: { type: String, trim: true },
      },
    ],
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    source: {
      type: String,
      default: 'manual',
    },
    /**
     * Set when the customer's personal data was erased on request.
     *
     * The record itself is kept rather than deleted, because appointments and
     * invoices reference it and a business has to retain financial history. The
     * identifying fields are scrubbed; this timestamp records that it happened.
     */
    personalDataErasedAt: {
      type: Date,
      default: null,
    },
    /**
     * SMS consent. True once the customer has texted a carrier opt-out keyword.
     *
     * This field was missing entirely while two code paths in
     * `communication.service.ts` read and wrote it through `as any`. Mongoose is
     * strict by default, so the write was silently dropped on every save and the
     * read was always `undefined` — meaning a customer who texted STOP kept
     * receiving messages. That is a TCPA violation, not a cosmetic bug.
     */
    isOptedOut: {
      type: Boolean,
      default: false,
      index: true,
    },
    /** Audit trail for the opt-out, which a TCPA complaint would ask for. */
    optedOutAt: {
      type: Date,
      default: null,
    },
    /**
     * Marketing **email** consent. Entirely separate from `isOptedOut` above.
     *
     * These are two different consents under two different laws and conflating them
     * breaks the product in both directions. `isOptedOut` is TCPA and is set by an SMS
     * `STOP`; a customer who stops texts still needs their own invoice by email. This
     * flag is CAN-SPAM and is set by clicking unsubscribe in a campaign email.
     *
     * Suppresses **campaign** email only. Transactional email — confirmations,
     * reminders, quotes, invoices, receipts — is exempt, because the customer asked for
     * the underlying thing, and withholding an invoice because someone unsubscribed
     * from marketing would be the wrong reading of a narrower request.
     */
    emailOptedOut: {
      type: Boolean,
      default: false,
      index: true,
    },
    /** When they unsubscribed. The audit trail a CAN-SPAM complaint would ask for. */
    emailOptedOutAt: {
      type: Date,
      default: null,
    },
    /**
     * Residential or commercial.
     *
     * The customer form has always had a toggle for this and five screens have
     * always displayed it, but it was never declared here — so Mongoose stripped
     * it on every save and all five screens showed "Residential" for everyone.
     * Left optional rather than defaulted, so an existing record reads as
     * "not recorded" instead of being silently asserted to be residential.
     */
    propertyType: {
      type: String,
      enum: ['residential', 'commercial'],
      index: true,
    },
    /**
     * Structured facts about getting into and around the property.
     *
     * These were free text: a gate code lived inside an `AgentMemory` value reading
     * "Gate/entry code is 1234", and the dispatch SMS filled its "Access/Gate" line
     * by taking whichever `instruction` memory its loop saw last — so a customer with
     * a dog and no gate code had "Customer mentioned dogs/pets on the property" printed
     * as their gate code.
     *
     * A sub-object rather than flat fields so the whole group can be permissioned or
     * redacted as one thing later, and so `property` reads as what it is.
     */
    property: {
      /**
       * Gate, lockbox or keypad code.
       *
       * Stored in plain text, and worth being clear about: this is a physical access
       * credential readable by anyone with database access or a staff login. It is no
       * worse than where it lived before (an `AgentMemory` value) and it has to reach
       * the assigned technician's phone to be useful. It is deliberately excluded from
       * every customer-facing channel and only ever appears in the dispatch SMS.
       * Field-level encryption needs key management that does not exist here yet.
       */
      gateCode: { type: String, trim: true, maxlength: 40 },
      /** "Use the side gate", "buzz unit 4B", "park on the street". */
      accessInstructions: { type: String, trim: true, maxlength: 500 },
      /**
       * Tri-state on purpose. `undefined` means nobody has asked, which is not the
       * same as "no pets" — a technician deciding whether to open a gate needs to know
       * the difference.
       */
      hasPets: { type: Boolean },
      petNotes: { type: String, trim: true, maxlength: 300 },
      parkingNotes: { type: String, trim: true, maxlength: 300 },
      /** Storeys, crawl space access, anything that changes what to bring. */
      propertyNotes: { type: String, trim: true, maxlength: 500 },
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for business isolation and fast query performance
customerSchema.index({ businessId: 1, createdAt: -1 });
customerSchema.index({ businessId: 1, status: 1 });
customerSchema.index({ businessId: 1, phone: 1 });

export const Customer = model<ICustomer>('Customer', customerSchema);
