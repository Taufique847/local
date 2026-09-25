import { Types } from 'mongoose';
import { MessageTemplate, IMessageTemplate } from '../models/message-template.model';
import {
  MessageType,
  MessageChannel,
  MESSAGE_TYPES,
  MESSAGE_CHANNELS,
  NotificationVars,
  CHANNEL_BODY_LIMIT,
} from '../types/communication.types';
import {
  renderNotification,
  applyTemplate,
  allowedVariablesFor,
  extractPlaceholders,
  TEMPLATE_VARIABLES,
  DEFAULT_CHANNELS,
} from './notification-templates';
import { AppError } from '../types';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'message-templates' });

/**
 * Sample values for the editor preview.
 *
 * Obviously fake on purpose. Plausible-looking sample data in a preview is how an
 * owner ends up believing a placeholder is already filled in with their real
 * customer's details.
 */
export const PREVIEW_VARS: NotificationVars = {
  customerName: 'Sample Customer',
  businessName: 'Your Business',
  businessPhone: '(555) 010-0100',
  businessEmail: 'you@yourbusiness.com',
  dateTime: 'Tue, Mar 3 at 2:00 PM CST',
  address: '123 Sample St, Yourtown',
  serviceName: 'AC Tune-Up',
  technicianName: 'Sample Tech',
  amount: '$420.00',
  documentNumber: 'INV-1001',
  link: 'https://example.com/portal/invoice/sample',
  dueDate: 'Mar 17, 2026',
  paymentMethod: 'Card',
};

export interface TemplateRow {
  type: MessageType;
  channel: MessageChannel;
  /** True when this business has saved its own copy or toggle for this pair. */
  customised: boolean;
  enabled: boolean;
  /** The override, or empty when none is saved. */
  body: string;
  subject: string;
  /** The shipped wording, rendered with sample data. Read-only reference. */
  defaultPreview: string;
  defaultSubject: string;
  /** The override rendered with sample data, or the default when none is saved. */
  preview: string;
  previewSubject: string;
  /** Whether the shipped defaults have copy for this pair at all. */
  supported: boolean;
  /** True when this channel sends for this type with no row saved. */
  onByDefault: boolean;
  variables: Array<{ name: string; label: string }>;
}

export type ResolvedTemplate =
  | { status: 'ok'; subject?: string; body: string; source: 'override' | 'default' }
  /** The business switched this type off on this channel. */
  | { status: 'disabled' }
  /** Neither an override nor shipped copy exists for this pair. */
  | { status: 'no_template' };

export class MessageTemplateService {
  /**
   * Every type/channel pair, showing the default and any override.
   *
   * Returns the full grid rather than only the saved rows, because the editor's job
   * is to tell an owner what the platform sends — including the messages they have
   * never touched. A list of overrides would show an empty screen on a fresh
   * account, which is precisely the state where seeing the defaults matters.
   */
  public static async listForBusiness(
    businessId: Types.ObjectId | string
  ): Promise<TemplateRow[]> {
    const saved = await MessageTemplate.find({ businessId }).lean();
    const byKey = new Map(saved.map((row) => [`${row.type}:${row.channel}`, row]));

    const rows: TemplateRow[] = [];

    for (const type of MESSAGE_TYPES) {
      // 'custom' is an ad-hoc send with a body supplied by the caller. There is
      // nothing to template, and offering an editor for it would imply otherwise.
      if (type === 'custom') continue;

      for (const channel of MESSAGE_CHANNELS) {
        const shipped = renderNotification(type, channel, PREVIEW_VARS);
        const row = byKey.get(`${type}:${channel}`);

        // No shipped copy and no override means this pair cannot send at all.
        if (!shipped && !row?.body) {
          rows.push({
            type,
            channel,
            customised: Boolean(row),
            enabled: false,
            body: '',
            subject: '',
            defaultPreview: '',
            defaultSubject: '',
            preview: '',
            previewSubject: '',
            supported: false,
            onByDefault: false,
            variables: TEMPLATE_VARIABLES[type].map((v) => ({ name: v.name, label: v.label })),
          });
          continue;
        }

        const onByDefault = (DEFAULT_CHANNELS[type] ?? []).includes(channel);
        const hasOverride = Boolean(row?.body && row.body.trim());

        rows.push({
          type,
          channel,
          customised: Boolean(row),
          enabled: row ? row.enabled : onByDefault,
          body: row?.body ?? '',
          subject: row?.subject ?? '',
          defaultPreview: shipped?.body ?? '',
          defaultSubject: shipped?.subject ?? '',
          preview: hasOverride ? applyTemplate(row!.body!, PREVIEW_VARS) : shipped?.body ?? '',
          previewSubject: row?.subject
            ? applyTemplate(row.subject, PREVIEW_VARS)
            : shipped?.subject ?? '',
          supported: true,
          onByDefault,
          variables: TEMPLATE_VARIABLES[type].map((v) => ({ name: v.name, label: v.label })),
        });
      }
    }

    return rows;
  }

  /**
   * Saves one override.
   *
   * Validates placeholders against the declared set for this type, so an owner is
   * told about `{{invioceNumber}}` while they are looking at the editor rather than
   * after a customer has received it.
   */
  public static async upsert(
    businessId: Types.ObjectId | string,
    input: {
      type: MessageType;
      channel: MessageChannel;
      enabled?: boolean;
      body?: string;
      subject?: string;
    }
  ): Promise<IMessageTemplate> {
    if (input.type === 'custom') {
      throw new AppError('Ad-hoc messages have no template to customise.', 400);
    }

    const allowed = allowedVariablesFor(input.type);
    const body = (input.body ?? '').trim();
    const subject = (input.subject ?? '').trim();

    const unknown = [...extractPlaceholders(body), ...extractPlaceholders(subject)].filter(
      (name) => !allowed.includes(name)
    );

    if (unknown.length) {
      throw new AppError(
        `Unknown placeholder${unknown.length > 1 ? 's' : ''} ${unknown
          .map((u) => `{{${u}}}`)
          .join(', ')}. Available here: ${allowed.map((a) => `{{${a}}}`).join(', ')}.`,
        400
      );
    }

    // Per-channel, because the shared schema can only carry the looser limit.
    const limit = CHANNEL_BODY_LIMIT[input.channel];
    if (body.length > limit) {
      throw new AppError(
        `That message is ${body.length} characters. The limit for ${input.channel} is ${limit}.`,
        400
      );
    }

    if (input.channel === 'sms' && subject) {
      throw new AppError('Text messages have no subject line.', 400);
    }

    /**
     * An SMS override must still carry the opt-out notice where the shipped copy
     * does.
     *
     * Not a style rule. `appointment_confirmation` is the first message many
     * customers receive, and the shipped wording includes "Reply STOP" because
     * carriers and the TCPA expect it. Letting an owner silently delete it turns a
     * compliance default into an opt-in.
     */
    if (input.channel === 'sms' && body) {
      const shipped = renderNotification(input.type, 'sms', PREVIEW_VARS)?.body ?? '';
      if (/reply stop/i.test(shipped) && !/stop/i.test(body)) {
        throw new AppError(
          'Text messages of this type must tell the customer how to opt out. Include the word STOP (for example: "Reply STOP to cancel notifications").',
          400
        );
      }
    }

    const template = await MessageTemplate.findOneAndUpdate(
      { businessId, type: input.type, channel: input.channel },
      {
        $set: {
          enabled: input.enabled ?? true,
          body,
          subject,
        },
        $setOnInsert: { businessId, type: input.type, channel: input.channel },
      },
      { new: true, upsert: true, runValidators: true }
    );

    log.info('template_saved', {
      businessId: String(businessId),
      type: input.type,
      channel: input.channel,
      enabled: template.enabled,
      hasBody: Boolean(body),
    });

    return template;
  }

  /**
   * Discards an override so the shipped wording applies again.
   *
   * Deleting the row rather than blanking the body, so "back to default" really
   * means no override exists — a row with an empty body still overrides the
   * channel toggle, which would leave a business unable to get back to the
   * platform's own on/off behaviour.
   */
  public static async reset(
    businessId: Types.ObjectId | string,
    type: MessageType,
    channel: MessageChannel
  ): Promise<void> {
    const result = await MessageTemplate.deleteOne({ businessId, type, channel });
    if (!result.deletedCount) {
      throw new AppError('There is no saved override for that message.', 404);
    }
  }

  /**
   * Resolution used at send time.
   *
   * The three outcomes are kept distinct rather than collapsed into "no copy".
   * "The owner switched this off" and "the platform has nothing to send" both mean
   * nothing goes out, but an operator reading a log needs to know which — one is a
   * decision they made and the other is a gap to fill.
   */
  public static async resolveForSend(
    businessId: Types.ObjectId | string,
    type: MessageType,
    channel: MessageChannel,
    vars: NotificationVars
  ): Promise<ResolvedTemplate> {
    let row: IMessageTemplate | null = null;

    try {
      row = (await MessageTemplate.findOne({ businessId, type, channel }).lean()) as any;
    } catch (err: any) {
      // A template lookup failure must not stop a transactional message. Falling
      // through to the shipped default is strictly better than not sending.
      log.error('template_lookup_failed', {
        businessId: String(businessId),
        type,
        reason: err?.message,
      });
    }

    /**
     * Honoured here as well as in `channelsForSend`, and this is the copy that
     * matters.
     *
     * `channelsForSend` decides which channels a *trigger* uses, but a caller
     * passing an explicit `channels` option skips it entirely. Without this check
     * that option would resurrect a channel the owner deliberately switched off.
     */
    if (row && row.enabled === false) return { status: 'disabled' };

    const shipped = renderNotification(type, channel, vars);

    if (row?.body && row.body.trim()) {
      return {
        status: 'ok',
        body: applyTemplate(row.body, vars),
        subject: row.subject ? applyTemplate(row.subject, vars) : shipped?.subject,
        source: 'override',
      };
    }

    if (!shipped) return { status: 'no_template' };

    return { status: 'ok', body: shipped.body, subject: shipped.subject, source: 'default' };
  }

  /**
   * Channels to send this type on for this business.
   *
   * Three inputs, in order of authority: an explicit row wins, then the shipped
   * per-type default, then nothing. The union matters — a business can switch ON a
   * channel the platform leaves off by default, which a scheme that only filtered
   * the defaults could not express.
   */
  public static async channelsForSend(
    businessId: Types.ObjectId | string,
    type: MessageType
  ): Promise<MessageChannel[]> {
    let rows: IMessageTemplate[] = [];

    try {
      rows = (await MessageTemplate.find({ businessId, type }).lean()) as any;
    } catch (err: any) {
      log.error('template_channels_lookup_failed', {
        businessId: String(businessId),
        type,
        reason: err?.message,
      });
      return DEFAULT_CHANNELS[type] ?? ['sms'];
    }

    const explicit = new Map(rows.map((r) => [r.channel, r]));
    const defaults = DEFAULT_CHANNELS[type] ?? [];

    return MESSAGE_CHANNELS.filter((channel) => {
      const row = explicit.get(channel);
      if (row) return row.enabled;
      return defaults.includes(channel);
    });
  }
}
