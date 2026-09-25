import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createWorkspace,
  createCustomerRecord,
  createStaff,
  type Workspace,
} from '../helpers/factories';
import { asUser } from '../helpers/agent';
import { Business } from '../../src/models/business.model';
import { BusinessPhoneNumber } from '../../src/models/phone-number.model';
import { CommunicationLog } from '../../src/models/communication-log.model';
import { MessageTemplate } from '../../src/models/message-template.model';
import { CommunicationService } from '../../src/services/communication.service';
import { EmailService } from '../../src/services/email.service';
import { NotificationService } from '../../src/services/notification.service';
import { MessageTemplateService } from '../../src/services/message-template.service';
import {
  applyTemplate,
  extractPlaceholders,
  allowedVariablesFor,
  renderNotification,
} from '../../src/services/notification-templates';

/**
 * Per-business notification copy.
 *
 * The property that matters most is the negative one: a business with no saved
 * rows must behave exactly as it did before this feature existed. The shipped
 * defaults carry the carrier-expected opt-out notice, so a scheme where an empty
 * template quietly replaces them would turn a compliance default into an opt-in.
 */

const setupWorkspace = async (): Promise<Workspace> => {
  const ws = await createWorkspace();

  await BusinessPhoneNumber.create({
    businessId: ws.businessId,
    phoneNumber: '+15557770000',
    status: 'active',
    isPrimary: true,
  });

  await Business.findByIdAndUpdate(ws.businessId, { email: 'shop@example.com' });
  return ws;
};

const stubTransports = () => {
  const smsCreate = vi.fn().mockResolvedValue({ sid: 'SM_stub' });
  vi.spyOn(CommunicationService as any, 'getClient').mockReturnValue({
    messages: { create: smsCreate },
  });
  const email = vi.spyOn(EmailService, 'send').mockResolvedValue({ id: 'resend_1' });
  vi.spyOn(CommunicationService, 'isWithinQuietHours').mockReturnValue(false);
  return { smsCreate, email };
};

describe('placeholder substitution', () => {
  it('replaces declared variables', () => {
    const out = applyTemplate('Hi {{customerName}}, {{businessName}} here.', {
      customerName: 'Dana',
      businessName: 'Acme Air',
    });

    expect(out).toBe('Hi Dana, Acme Air here.');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(applyTemplate('Hi {{ customerName }}', { customerName: 'Dana' })).toBe('Hi Dana');
  });

  /**
   * The single worst failure mode for a template engine in customer-facing copy:
   * shipping the braces. A missing value falls back to the same neutral wording the
   * shipped defaults use.
   */
  it('never leaves braces in the output', () => {
    const out = applyTemplate('Your appointment is {{dateTime}} at {{address}}.', {});

    expect(out).not.toContain('{{');
    expect(out).not.toContain('}}');
    expect(out).toContain('your scheduled time');
  });

  it('strips a placeholder it does not recognise', () => {
    const out = applyTemplate('Hi {{customerName}}, ref {{madeUpField}}.', {
      customerName: 'Dana',
    });

    expect(out).toBe('Hi Dana, ref .');
    expect(out).not.toContain('madeUpField');
  });

  it('extracts the placeholders a template uses, deduplicated', () => {
    const found = extractPlaceholders('{{a}} {{b}} {{a}} { not } {{ c }}');
    expect(found.sort()).toEqual(['a', 'b', 'c']);
  });

  it('declares different variables for an appointment and an invoice', () => {
    expect(allowedVariablesFor('appointment_reminder')).toContain('dateTime');
    expect(allowedVariablesFor('appointment_reminder')).not.toContain('documentNumber');
    expect(allowedVariablesFor('invoice_issued')).toContain('documentNumber');
    expect(allowedVariablesFor('invoice_issued')).toContain('dueDate');
  });
});

describe('saving an override', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
  });

  it('rejects a placeholder that does not exist for that type', async () => {
    const res = await asUser(ws.ownerToken).put('/api/message-templates').send({
      type: 'invoice_issued',
      channel: 'email',
      body: 'Invoice {{invioceNumber}} is ready.',
    });

    expect(res.status).toBe(400);
    expect(res.body.message ?? res.body.error).toContain('invioceNumber');
    expect(await MessageTemplate.countDocuments({})).toBe(0);
  });

  it('rejects a variable that exists but not for this type', async () => {
    const res = await asUser(ws.ownerToken).put('/api/message-templates').send({
      type: 'appointment_cancelled',
      channel: 'sms',
      body: 'Cancelled. Your total was {{amount}}. Reply STOP to opt out.',
    });

    expect(res.status).toBe(400);
  });

  /**
   * Not a style rule. The shipped confirmation includes "Reply STOP" because
   * carriers and the TCPA expect it, and letting an owner delete it silently turns a
   * compliance default into an opt-in.
   */
  it('refuses an SMS override that drops the opt-out notice', async () => {
    const res = await asUser(ws.ownerToken).put('/api/message-templates').send({
      type: 'appointment_confirmation',
      channel: 'sms',
      body: "You're booked for {{dateTime}}. See you then!",
    });

    expect(res.status).toBe(400);
    expect(res.body.message ?? res.body.error).toMatch(/opt out|STOP/i);
  });

  it('accepts the same override once the opt-out notice is present', async () => {
    const res = await asUser(ws.ownerToken).put('/api/message-templates').send({
      type: 'appointment_confirmation',
      channel: 'sms',
      body: "You're booked for {{dateTime}}. Reply STOP to opt out.",
    });

    expect(res.status).toBe(200);
  });

  it('refuses a subject on the SMS channel', async () => {
    const res = await asUser(ws.ownerToken).put('/api/message-templates').send({
      type: 'appointment_reminder',
      channel: 'sms',
      subject: 'Reminder',
      body: 'Reminder for {{dateTime}}',
    });

    expect(res.status).toBe(400);
  });

  it('refuses an SMS body past the segment ceiling', async () => {
    const res = await asUser(ws.ownerToken).put('/api/message-templates').send({
      type: 'appointment_reminder',
      channel: 'sms',
      body: 'x'.repeat(1601),
    });

    expect(res.status).toBe(400);
    expect(res.body.message ?? res.body.error).toMatch(/1600/);
  });

  it('accepts an email body far longer than that', async () => {
    const res = await asUser(ws.ownerToken).put('/api/message-templates').send({
      type: 'appointment_reminder',
      channel: 'email',
      body: 'x'.repeat(5000),
    });

    expect(res.status).toBe(200);
  });

  it('keeps one row per type and channel however many times it is saved', async () => {
    for (const body of ['First {{dateTime}}', 'Second {{dateTime}}', 'Third {{dateTime}}']) {
      await asUser(ws.ownerToken)
        .put('/api/message-templates')
        .send({ type: 'appointment_reminder', channel: 'email', body });
    }

    const rows = await MessageTemplate.find({ businessId: ws.businessId });
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe('Third {{dateTime}}');
  });

  it('is owner-only', async () => {
    const dispatcher = await createStaff(ws.businessId, 'dispatcher');

    const write = await asUser(dispatcher.token).put('/api/message-templates').send({
      type: 'appointment_reminder',
      channel: 'email',
      body: 'Reminder {{dateTime}}',
    });
    expect(write.status).toBe(403);

    const read = await asUser(dispatcher.token).get('/api/message-templates');
    expect(read.status).toBe(403);
  });

  it('does not let one business read or write another\'s copy', async () => {
    const other = await setupWorkspace();

    await asUser(ws.ownerToken)
      .put('/api/message-templates')
      .send({ type: 'appointment_reminder', channel: 'email', body: 'Mine {{dateTime}}' });

    const theirs = await asUser(other.ownerToken).get('/api/message-templates');
    const row = theirs.body.templates.find(
      (t: any) => t.type === 'appointment_reminder' && t.channel === 'email'
    );

    expect(row.customised).toBe(false);
    expect(row.body).toBe('');
  });
});

describe('the editor listing', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
  });

  /**
   * The full grid, not only saved rows. On a fresh account a list of overrides is an
   * empty screen — exactly the state where seeing what the platform sends matters
   * most.
   */
  it('shows every supported type and channel with the shipped wording', async () => {
    const res = await asUser(ws.ownerToken).get('/api/message-templates');

    expect(res.status).toBe(200);

    const rows = res.body.templates as any[];
    expect(rows.length).toBeGreaterThan(10);

    const reminderSms = rows.find(
      (t) => t.type === 'appointment_reminder' && t.channel === 'sms'
    );
    expect(reminderSms.supported).toBe(true);
    expect(reminderSms.customised).toBe(false);
    expect(reminderSms.enabled).toBe(true);
    expect(reminderSms.defaultPreview).toContain('Reply C to confirm');
    // With no override, the preview IS the default.
    expect(reminderSms.preview).toBe(reminderSms.defaultPreview);

    // 'custom' is an ad-hoc send with a caller-supplied body; offering an editor
    // for it would imply a template that does not exist.
    expect(rows.some((t) => t.type === 'custom')).toBe(false);
  });

  it('marks a pair the platform cannot send as unsupported', async () => {
    const res = await asUser(ws.ownerToken).get('/api/message-templates');
    const rows = res.body.templates as any[];

    // Speed-to-lead messages are SMS-only by design; there is no email copy.
    const leadEmail = rows.find((t) => t.type === 'lead_followup' && t.channel === 'email');
    expect(leadEmail.supported).toBe(false);
    expect(leadEmail.enabled).toBe(false);
  });

  it('previews the override once one is saved', async () => {
    await asUser(ws.ownerToken).put('/api/message-templates').send({
      type: 'appointment_reminder',
      channel: 'email',
      subject: 'See you {{dateTime}}',
      body: 'Hi {{customerName}}, we are coming {{dateTime}}.',
    });

    const res = await asUser(ws.ownerToken).get('/api/message-templates');
    const row = (res.body.templates as any[]).find(
      (t) => t.type === 'appointment_reminder' && t.channel === 'email'
    );

    expect(row.customised).toBe(true);
    expect(row.preview).toContain('Sample Customer');
    expect(row.preview).not.toContain('{{');
    expect(row.previewSubject).toContain('Tue, Mar 3');
    // The default is still returned alongside, so the owner can compare.
    expect(row.defaultPreview).not.toBe(row.preview);
  });

  it('renders a draft without saving it', async () => {
    const res = await asUser(ws.ownerToken).post('/api/message-templates/preview').send({
      type: 'invoice_issued',
      body: 'Invoice {{documentNumber}} for {{amount}} — pay at {{link}}',
    });

    expect(res.status).toBe(200);
    expect(res.body.preview).toContain('INV-1001');
    expect(res.body.preview).toContain('$420.00');
    expect(await MessageTemplate.countDocuments({})).toBe(0);
  });

  it('reverts to the standard wording', async () => {
    await asUser(ws.ownerToken).put('/api/message-templates').send({
      type: 'appointment_reminder',
      channel: 'email',
      body: 'Custom {{dateTime}}',
    });

    const res = await asUser(ws.ownerToken).delete(
      '/api/message-templates/appointment_reminder/email'
    );

    expect(res.status).toBe(200);
    expect(await MessageTemplate.countDocuments({})).toBe(0);

    const after = await asUser(ws.ownerToken).get('/api/message-templates');
    const row = (after.body.templates as any[]).find(
      (t) => t.type === 'appointment_reminder' && t.channel === 'email'
    );
    expect(row.customised).toBe(false);
    expect(row.preview).toBe(row.defaultPreview);
  });

  it('404s when there is nothing to revert', async () => {
    const res = await asUser(ws.ownerToken).delete(
      '/api/message-templates/appointment_reminder/email'
    );
    expect(res.status).toBe(404);
  });
});

describe('what actually gets sent', () => {
  let ws: Workspace;

  beforeEach(async () => {
    ws = await setupWorkspace();
  });

  /**
   * The regression that matters. A business that has never opened the editor must
   * receive byte-for-byte what it did before per-business templates existed.
   */
  it('sends the shipped wording verbatim when nothing is customised', async () => {
    const { smsCreate } = stubTransports();
    const customer = await createCustomerRecord(ws.businessId);

    await NotificationService.send(
      ws.businessId,
      'appointment_reminder',
      { customerId: customer._id.toString() },
      { dateTime: 'Tue, Mar 3 at 2:00 PM CST' },
      { channels: 'sms' }
    );

    const expected = renderNotification('appointment_reminder', 'sms', {
      businessName: 'Test Heating & Air',
      businessPhone: '+15551110000',
      businessEmail: 'shop@example.com',
      customerName: 'Homeowner Person',
      dateTime: 'Tue, Mar 3 at 2:00 PM CST',
    })!.body;

    expect(smsCreate).toHaveBeenCalledTimes(1);
    expect(smsCreate.mock.calls[0][0].body).toBe(expected);
  });

  it('uses the override when one is saved', async () => {
    const { smsCreate } = stubTransports();
    const customer = await createCustomerRecord(ws.businessId);

    await MessageTemplateService.upsert(ws.businessId, {
      type: 'appointment_reminder',
      channel: 'sms',
      body: 'Yo {{customerName}} — {{businessName}} rolling up {{dateTime}}. STOP to opt out.',
    });

    await NotificationService.send(
      ws.businessId,
      'appointment_reminder',
      { customerId: customer._id.toString() },
      { dateTime: 'Tue, Mar 3 at 2:00 PM CST' },
      { channels: 'sms' }
    );

    const sent = smsCreate.mock.calls[0][0].body;
    expect(sent).toContain('Yo Homeowner Person');
    expect(sent).toContain('Test Heating & Air');
    expect(sent).toContain('Tue, Mar 3 at 2:00 PM CST');
    expect(sent).not.toContain('{{');
  });

  it('uses the override subject on email and drops the default HTML with it', async () => {
    const { email } = stubTransports();
    const customer = await createCustomerRecord(ws.businessId);

    await MessageTemplateService.upsert(ws.businessId, {
      type: 'invoice_issued',
      channel: 'email',
      subject: 'Bill {{documentNumber}}',
      body: 'Invoice {{documentNumber}} for {{amount}}. Pay: {{link}}',
    });

    await NotificationService.send(
      ws.businessId,
      'invoice_issued',
      { customerId: customer._id.toString() },
      { documentNumber: 'INV-9', amount: '$50.00', link: 'https://portal.test/x' },
      { channels: 'email' }
    );

    const message = email.mock.calls[0][0];
    expect(message.subject).toBe('Bill INV-9');
    expect(message.text).toContain('Invoice INV-9 for $50.00');
    /**
     * The editor is a textarea, not an HTML editor. Pairing plain-text override copy
     * with the default's HTML would send two different messages in one email and
     * leave which one the customer sees up to their mail client.
     */
    expect(message.html).toBeUndefined();
  });

  it('keeps the HTML twin when the wording is the shipped default', async () => {
    const { email } = stubTransports();
    const customer = await createCustomerRecord(ws.businessId);

    await NotificationService.send(
      ws.businessId,
      'invoice_issued',
      { customerId: customer._id.toString() },
      { documentNumber: 'INV-9', amount: '$50.00', link: 'https://portal.test/x' },
      { channels: 'email' }
    );

    expect(email.mock.calls[0][0].html).toContain('<html>');
  });

  /**
   * Switching a channel off is a decision, and it has to beat the per-type default.
   */
  it('does not send a channel the business has switched off', async () => {
    const { smsCreate, email } = stubTransports();
    const customer = await createCustomerRecord(ws.businessId);

    await MessageTemplateService.upsert(ws.businessId, {
      type: 'appointment_reminder',
      channel: 'sms',
      enabled: false,
    });

    const result = await NotificationService.send(
      ws.businessId,
      'appointment_reminder',
      { customerId: customer._id.toString() },
      { dateTime: 'Tue, Mar 3 at 2:00 PM CST' }
    );

    expect(smsCreate).not.toHaveBeenCalled();
    // Email is untouched by an SMS toggle.
    expect(email).toHaveBeenCalledTimes(1);
    expect(result.results.map((r) => r.channel)).toEqual(['email']);
  });

  /**
   * The owner's decision beats an explicit request from a caller.
   *
   * `channelsForSend` is skipped when a caller names a channel, so this is the only
   * guard on that path. `options.channels` exists to narrow a send to one address,
   * not to resurrect a channel the owner deliberately switched off.
   */
  it('refuses a disabled channel even when the caller asks for it by name', async () => {
    const { smsCreate } = stubTransports();
    const customer = await createCustomerRecord(ws.businessId);

    await MessageTemplateService.upsert(ws.businessId, {
      type: 'appointment_reminder',
      channel: 'sms',
      enabled: false,
    });

    const result = await NotificationService.send(
      ws.businessId,
      'appointment_reminder',
      { customerId: customer._id.toString() },
      { dateTime: 'Tue, Mar 3 at 2:00 PM CST' },
      { channels: 'sms' }
    );

    expect(smsCreate).not.toHaveBeenCalled();
    // Reported as the owner's decision, not as a missing template. An operator
    // reading this needs to know which of the two it was.
    expect(result.results[0]).toMatchObject({
      channel: 'sms',
      status: 'skipped',
      reason: 'channel_disabled_by_business',
    });
  });

  it('refuses a disabled email channel the same way', async () => {
    const { email } = stubTransports();
    const customer = await createCustomerRecord(ws.businessId);

    await MessageTemplateService.upsert(ws.businessId, {
      type: 'invoice_issued',
      channel: 'email',
      enabled: false,
      body: 'Invoice {{documentNumber}}',
    });

    const result = await NotificationService.send(
      ws.businessId,
      'invoice_issued',
      { customerId: customer._id.toString() },
      { documentNumber: 'INV-1' },
      { channels: 'email' }
    );

    expect(email).not.toHaveBeenCalled();
    expect(result.results[0].reason).toBe('channel_disabled_by_business');
  });

  /**
   * Channel settings are per business. One contractor turning text receipts on must
   * not turn them on for everyone.
   */
  it('does not let one business\'s channel settings leak into another', async () => {
    const other = await setupWorkspace();

    await MessageTemplateService.upsert(ws.businessId, {
      type: 'payment_receipt',
      channel: 'sms',
      enabled: true,
      body: 'Payment of {{amount}} received. Reply STOP to opt out.',
    });

    await MessageTemplateService.upsert(ws.businessId, {
      type: 'appointment_reminder',
      channel: 'email',
      enabled: false,
    });

    expect(
      (await MessageTemplateService.channelsForSend(ws.businessId, 'payment_receipt')).sort()
    ).toEqual(['email', 'sms']);
    expect(
      await MessageTemplateService.channelsForSend(other.businessId, 'payment_receipt')
    ).toEqual(['email']);

    expect(
      await MessageTemplateService.channelsForSend(ws.businessId, 'appointment_reminder')
    ).toEqual(['sms']);
    expect(
      (await MessageTemplateService.channelsForSend(other.businessId, 'appointment_reminder')).sort()
    ).toEqual(['email', 'sms']);
  });

  it('switching a channel off does not require retyping the message', async () => {
    const customer = await createCustomerRecord(ws.businessId);
    stubTransports();

    await MessageTemplateService.upsert(ws.businessId, {
      type: 'appointment_reminder',
      channel: 'sms',
      enabled: false,
      // No body at all.
    });

    const row = await MessageTemplate.findOne({ businessId: ws.businessId });
    expect(row!.body).toBe('');
    expect(row!.enabled).toBe(false);

    const channels = await MessageTemplateService.channelsForSend(
      ws.businessId,
      'appointment_reminder'
    );
    expect(channels).toEqual(['email']);
    expect(customer).toBeDefined();
  });

  /**
   * The union, not a filter. `payment_receipt` ships email-only; a business that
   * wants a text receipt has to be able to turn one on, which a scheme that could
   * only subtract from the defaults could not express.
   */
  it('lets a business switch on a channel the platform leaves off', async () => {
    const { smsCreate } = stubTransports();
    const customer = await createCustomerRecord(ws.businessId);

    const before = await MessageTemplateService.channelsForSend(ws.businessId, 'payment_receipt');
    expect(before).toEqual(['email']);

    await MessageTemplateService.upsert(ws.businessId, {
      type: 'payment_receipt',
      channel: 'sms',
      enabled: true,
      body: 'Payment of {{amount}} received, thanks! Reply STOP to opt out.',
    });

    const after = await MessageTemplateService.channelsForSend(ws.businessId, 'payment_receipt');
    expect(after.sort()).toEqual(['email', 'sms']);

    await NotificationService.send(
      ws.businessId,
      'payment_receipt',
      { customerId: customer._id.toString() },
      { amount: '$75.00', documentNumber: 'INV-3', link: 'https://portal.test/x' }
    );

    expect(smsCreate).toHaveBeenCalledTimes(1);
    expect(smsCreate.mock.calls[0][0].body).toContain('$75.00');
  });

  it('logs the sent body, not the raw template', async () => {
    stubTransports();
    const customer = await createCustomerRecord(ws.businessId);

    await MessageTemplateService.upsert(ws.businessId, {
      type: 'appointment_reminder',
      channel: 'sms',
      body: 'Coming {{dateTime}}. Reply STOP to opt out.',
    });

    await NotificationService.send(
      ws.businessId,
      'appointment_reminder',
      { customerId: customer._id.toString() },
      { dateTime: 'Tue, Mar 3 at 2:00 PM CST' },
      { channels: 'sms' }
    );

    const row = await CommunicationLog.findOne({ businessId: ws.businessId, channel: 'sms' });
    expect(row!.body).toContain('Tue, Mar 3 at 2:00 PM CST');
    expect(row!.body).not.toContain('{{');
  });

  it('does not apply one business\'s override to another', async () => {
    const { smsCreate } = stubTransports();
    const other = await setupWorkspace();
    const theirCustomer = await createCustomerRecord(other.businessId);

    await MessageTemplateService.upsert(ws.businessId, {
      type: 'appointment_reminder',
      channel: 'sms',
      body: 'MY CUSTOM COPY {{dateTime}}. Reply STOP to opt out.',
    });

    await NotificationService.send(
      other.businessId,
      'appointment_reminder',
      { customerId: theirCustomer._id.toString() },
      { dateTime: 'Tue, Mar 3 at 2:00 PM CST' },
      { channels: 'sms' }
    );

    expect(smsCreate.mock.calls[0][0].body).not.toContain('MY CUSTOM COPY');
  });
});
