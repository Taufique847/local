import { Response, NextFunction } from 'express';
import { PhoneNumberService } from '../services/phone-number.service';
import { TwilioService } from '../services/twilio.service';
import { BusinessContextService } from '../services/business-context.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class PhoneNumberController {
  /**
   * Resolves the caller's workspace by MEMBERSHIP, not by ownership.
   *
   * This used to be `getBusinessByOwnerId`, which answers "which business does
   * this person own" — correct for owners and empty for everyone else. Staff
   * accounts would have been told to complete a business profile they do not own.
   */
  private static async getBusinessId(userId: string): Promise<string> {
    const context = await BusinessContextService.resolve(userId);
    return context.businessId;
  }

  // GET /api/phone-numbers
  public static async getPhoneNumbers(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await PhoneNumberController.getBusinessId(req.user.id);
      const numbers = await PhoneNumberService.getPhoneNumbers(businessId);
      sendSuccess(res, { success: true, phoneNumbers: numbers }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/phone-numbers/primary
  public static async getPrimaryNumber(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await PhoneNumberController.getBusinessId(req.user.id);
      const number = await PhoneNumberService.getPrimaryNumber(businessId);
      sendSuccess(res, { success: true, phoneNumber: number }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/phone-numbers/available?country=US&areaCode=312
  public static async searchAvailable(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const country = (req.query.country as string) || 'US';
      const areaCode = req.query.areaCode ? Number(req.query.areaCode) : undefined;
      const available = await TwilioService.searchAvailableNumbers(country, areaCode);
      sendSuccess(res, { success: true, availableNumbers: available }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/phone-numbers/provision (Purchase/Claim via Twilio)
  public static async provisionNumber(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await PhoneNumberController.getBusinessId(req.user.id);
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        throw new AppError('phoneNumber is required for provisioning', 400);
      }

      const number = await PhoneNumberService.provisionTwilioNumber(businessId, phoneNumber);
      sendSuccess(res, { success: true, phoneNumber: number }, 201);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/phone-numbers (Manual assign / existing number register)
  public static async assignNumber(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await PhoneNumberController.getBusinessId(req.user.id);
      const { phoneNumber, phoneNumberSid, friendlyName, isPrimary } = req.body;

      if (!phoneNumber) {
        throw new AppError('phoneNumber is required', 400);
      }

      const number = await PhoneNumberService.assignPhoneNumber(businessId, {
        phoneNumber,
        phoneNumberSid,
        friendlyName,
        isPrimary,
      });

      sendSuccess(res, { success: true, phoneNumber: number }, 201);
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/phone-numbers/:id/primary
  public static async setPrimary(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await PhoneNumberController.getBusinessId(req.user.id);
      const number = await PhoneNumberService.setPrimaryNumber(businessId, req.params.id);
      sendSuccess(res, { success: true, phoneNumber: number }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/phone-numbers/status (Check Twilio connection)
  public static async getConnectionStatus(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const status = await TwilioService.verifyConnection();
      sendSuccess(res, { success: true, ...status }, 200);
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/phone-numbers/:id
  public static async deleteNumber(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await PhoneNumberController.getBusinessId(req.user.id);
      await PhoneNumberService.deletePhoneNumber(businessId, req.params.id);
      sendSuccess(res, { success: true, message: 'Phone number removed successfully' }, 200);
    } catch (error) {
      next(error);
    }
  }
}
