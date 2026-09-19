import { Types } from 'mongoose';
import { BusinessPolicy, IBusinessPolicy } from '../models/business-policy.model';

export class PolicyGuardrailsService {
  /**
   * Retrieves or creates default policy for a business
   */
  public static async getPolicy(businessId: Types.ObjectId | string): Promise<IBusinessPolicy> {
    let policy = await BusinessPolicy.findOne({ businessId });
    if (!policy) {
      policy = await BusinessPolicy.create({
        businessId,
        minBookingNoticeHours: 2,
        maxBookingHorizonDays: 30,
        requireDiagnosticBeforePricing: true,
      });
    }
    return policy;
  }

  public static async updatePolicy(
    businessId: Types.ObjectId | string,
    updates: Partial<IBusinessPolicy>
  ): Promise<IBusinessPolicy> {
    const policy = await BusinessPolicy.findOneAndUpdate(
      { businessId },
      { $set: updates },
      { new: true, upsert: true, runValidators: true }
    );
    return policy;
  }

  /**
   * Evaluates whether booking start time obeys notice and horizon rules
   */
  public static async validateBookingTime(
    businessId: Types.ObjectId | string,
    startAt: Date
  ): Promise<{ valid: boolean; reason?: string }> {
    const policy = await this.getPolicy(businessId);
    const now = Date.now();
    const startTime = new Date(startAt).getTime();

    const minNoticeMs = policy.minBookingNoticeHours * 60 * 60 * 1000;
    const maxHorizonMs = policy.maxBookingHorizonDays * 24 * 60 * 60 * 1000;

    if (startTime < now + minNoticeMs) {
      return {
        valid: false,
        reason: `Service appointment requires at least ${policy.minBookingNoticeHours} hours advance notice. For immediate dispatch, emergency service is available.`,
      };
    }

    if (startTime > now + maxHorizonMs) {
      return {
        valid: false,
        reason: `Appointments can only be scheduled up to ${policy.maxBookingHorizonDays} days in advance.`,
      };
    }

    return { valid: true };
  }

  /**
   * Scans conversational text for emergency / hazard conditions
   */
  public static async checkEmergencyKeywords(
    businessId: Types.ObjectId | string,
    text: string
  ): Promise<{ isEmergency: boolean; matchedKeywords: string[]; requiresTransfer: boolean }> {
    const policy = await this.getPolicy(businessId);
    const lower = text.toLowerCase();
    const matched: string[] = [];

    for (const kw of policy.emergencyKeywords) {
      if (lower.includes(kw.toLowerCase())) {
        matched.push(kw);
      }
    }

    return {
      isEmergency: matched.length > 0,
      matchedKeywords: matched,
      requiresTransfer: matched.length > 0 && policy.afterHoursDispatchEnabled,
    };
  }

  /**
   * Policy interceptor before AI tool execution (M18 Guardrail)
   */
  public static async validateToolInvocation(
    businessId: Types.ObjectId | string,
    toolName: string,
    args: Record<string, any>
  ): Promise<{ allowed: boolean; violation?: string }> {
    if (toolName === 'book_appointment' && args.startAt) {
      const validation = await this.validateBookingTime(businessId, new Date(args.startAt));
      if (!validation.valid) {
        return { allowed: false, violation: validation.reason };
      }
    }

    return { allowed: true };
  }
}
