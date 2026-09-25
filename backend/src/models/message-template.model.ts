import { Schema, model, Document, Types } from 'mongoose';
import {
  MessageType,
  MessageChannel,
  MESSAGE_TYPES,
  MESSAGE_CHANNELS,
  CHANNEL_BODY_LIMIT,
} from '../types/communication.types';

export interface IMessageTemplate extends Document {
  _id: Types.ObjectId;
  businessId: Types.ObjectId;
  type: MessageType;
  channel: MessageChannel;
  /**
   * Whether this business sends this type on this channel at all.
   *
   * Explicitly three-state in effect: a row with `enabled: true`, a row with
   * `enabled: false`, and *no row*. No row means "use the shipped default",
   * which is not the same as off — see `NotificationService.resolveChannels`.
   */
  enabled: boolean;
  /** Email only. Ignored on the SMS channel. */
  subject?: string;
  /**
   * The override copy, with `{{variable}}` placeholders.
   *
   * Empty means "keep the shipped wording but honour `enabled`", so a business can
   * turn a channel off without having to retype the message first.
   */
  body?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Per-business notification copy.
 *
 * Feature #41 existed as six string literals in a `switch`, of which exactly one
 * was ever rendered — the rest of real traffic was inline literals at a dozen
 * call sites. There was no per-business copy anywhere except the voice
 * disclosure.
 *
 * Deliberately an override table and not a replacement: a business with no rows
 * behaves exactly as it does today. That matters because the shipped defaults
 * carry compliance wording ("Reply STOP to cancel notifications"), and a scheme
 * where a business must supply copy before anything sends would mean an empty
 * template silently stops a reminder.
 *
 * Placeholders are `{{name}}` rather than ES template literals, because the copy
 * now comes from the database and interpolating it as code would be an injection
 * hole.
 */
const messageTemplateSchema = new Schema<IMessageTemplate>(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: MESSAGE_TYPES,
      required: true,
    },
    channel: {
      type: String,
      enum: MESSAGE_CHANNELS,
      required: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    subject: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    body: {
      type: String,
      trim: true,
      // The email ceiling, since one schema serves both channels. The per-channel
      // limit is enforced on save by the validation schema, which knows the channel.
      maxlength: CHANNEL_BODY_LIMIT.email,
    },
  },
  { timestamps: true }
);

/**
 * One row per business, type and channel.
 *
 * Unique so a double-submit cannot leave two overrides for the same message and
 * make which copy a customer receives depend on document order.
 */
messageTemplateSchema.index(
  { businessId: 1, type: 1, channel: 1 },
  { unique: true, name: 'one_template_per_type_and_channel' }
);

export const MessageTemplate = model<IMessageTemplate>('MessageTemplate', messageTemplateSchema);
