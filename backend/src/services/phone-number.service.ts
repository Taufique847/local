import { Types } from 'mongoose';
import { BusinessPhoneNumber } from '../models/phone-number.model';
import { Business } from '../models/business.model';
import { TwilioService } from './twilio.service';
import { config } from '../config/env';
import {
  IBusinessPhoneNumber,
  AssignPhoneNumberInput,
} from '../types/telephony.types';
import { AppError } from '../types';

export class PhoneNumberService {
  /**
   * Get all phone numbers assigned to a business.
   */
  public static async getPhoneNumbers(
    businessId: Types.ObjectId | string
  ): Promise<IBusinessPhoneNumber[]> {
    return BusinessPhoneNumber.find({ businessId }).sort({ isPrimary: -1, createdAt: -1 });
  }

  /**
   * Get the primary active phone number for a business.
   */
  public static async getPrimaryNumber(
    businessId: Types.ObjectId | string
  ): Promise<IBusinessPhoneNumber | null> {
    return BusinessPhoneNumber.findOne({ businessId, isPrimary: true, status: 'active' });
  }

  /**
   * Assign or manually register a phone number for the business.
   */
  public static async assignPhoneNumber(
    businessId: Types.ObjectId | string,
    input: AssignPhoneNumberInput
  ): Promise<IBusinessPhoneNumber> {
    const business = await Business.findById(businessId);
    if (!business) {
      throw new AppError('Business not found', 404);
    }

    // Format phone number to E.164 if possible
    let cleanedNumber = input.phoneNumber.replace(/[^\d+]/g, '');
    if (!cleanedNumber.startsWith('+')) {
      cleanedNumber = `+1${cleanedNumber.replace(/^1/, '')}`;
    }

    // Check if number already registered to another business
    const existing = await BusinessPhoneNumber.findOne({
      phoneNumber: cleanedNumber,
      status: 'active',
    });

    if (existing && existing.businessId.toString() !== businessId.toString()) {
      throw new AppError('This phone number is already connected to another business account', 409);
    }

    const isFirst = (await BusinessPhoneNumber.countDocuments({ businessId, status: 'active' })) === 0;
    const shouldBePrimary = input.isPrimary !== undefined ? input.isPrimary : isFirst;

    if (shouldBePrimary) {
      await BusinessPhoneNumber.updateMany(
        { businessId },
        { $set: { isPrimary: false } }
      );
    }

    const baseUrl = config.twilioWebhookBaseUrl || 'http://localhost:5000';
    const voiceWebhookUrl = `${baseUrl}/api/webhooks/twilio/voice`;
    const smsWebhookUrl = `${baseUrl}/api/webhooks/twilio/sms`;

    if (existing && existing.businessId.toString() === businessId.toString()) {
      existing.friendlyName = input.friendlyName || existing.friendlyName;
      existing.phoneNumberSid = input.phoneNumberSid || existing.phoneNumberSid;
      existing.isPrimary = shouldBePrimary;
      existing.status = 'active';
      await existing.save();
      return existing;
    }

    const newNumber = await BusinessPhoneNumber.create({
      businessId,
      provider: 'twilio',
      phoneNumber: cleanedNumber,
      phoneNumberSid: input.phoneNumberSid || `PN_${Date.now()}`,
      friendlyName: input.friendlyName || `${business.name} Main Line`,
      country: input.country || 'US',
      capabilities: { voice: true, sms: true },
      status: 'active',
      voiceWebhookUrl,
      smsWebhookUrl,
      isPrimary: shouldBePrimary,
    });

    return newNumber;
  }

  /**
   * Provision a phone number through Twilio and bind to business.
   */
  public static async provisionTwilioNumber(
    businessId: Types.ObjectId | string,
    phoneNumber: string
  ): Promise<IBusinessPhoneNumber> {
    const business = await Business.findById(businessId);
    if (!business) {
      throw new AppError('Business not found', 404);
    }

    const baseUrl = config.twilioWebhookBaseUrl || 'http://localhost:5000';
    const voiceWebhookUrl = `${baseUrl}/api/webhooks/twilio/voice`;
    const statusCallbackUrl = `${baseUrl}/api/webhooks/twilio/status`;

    const twilioResult = await TwilioService.provisionNumber(
      phoneNumber,
      voiceWebhookUrl,
      statusCallbackUrl
    );

    return this.assignPhoneNumber(businessId, {
      phoneNumber: twilioResult.phoneNumber,
      phoneNumberSid: twilioResult.phoneNumberSid,
      friendlyName: `${business.name} Main Line`,
      isPrimary: true,
    });
  }

  /**
   * Set a specific number as primary for this business.
   */
  public static async setPrimaryNumber(
    businessId: Types.ObjectId | string,
    phoneNumberId: string
  ): Promise<IBusinessPhoneNumber> {
    const number = await BusinessPhoneNumber.findOne({ _id: phoneNumberId, businessId });
    if (!number) {
      throw new AppError('Phone number not found', 404);
    }

    await BusinessPhoneNumber.updateMany({ businessId }, { $set: { isPrimary: false } });
    number.isPrimary = true;
    await number.save();
    return number;
  }

  /**
   * Delete or deactivate phone number.
   */
  public static async deletePhoneNumber(
    businessId: Types.ObjectId | string,
    phoneNumberId: string
  ): Promise<void> {
    const result = await BusinessPhoneNumber.deleteOne({ _id: phoneNumberId, businessId });
    if (result.deletedCount === 0) {
      throw new AppError('Phone number not found', 404);
    }
  }
}
