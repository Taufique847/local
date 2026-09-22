import { Response, NextFunction } from 'express';
import { CustomerService } from '../services/customer.service';
import { DataRetentionService } from '../services/data-retention.service';
import { BusinessService } from '../services/business.service';
import { AuthenticatedRequest } from '../types/auth.types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

export class CustomerController {
  // Helper to ensure authenticated user has an active business
  private static async getBusinessId(userId: string): Promise<string> {
    const business = await BusinessService.getBusinessByOwnerId(userId);
    if (!business) {
      throw new AppError('Please complete your business profile setup first', 400);
    }
    return business.id;
  }

  // GET /api/customers
  public static async getCustomers(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await CustomerController.getBusinessId(req.user.id);
      const result = await CustomerService.getCustomers(businessId, req.query);
      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/customers/:id/erase
   *
   * Satisfies a data deletion request. Scrubs the customer's identifying fields
   * and redacts the free text in their calls, messages, appointments, estimates
   * and invoices, while leaving dates and amounts so the contractor's books stay
   * intact. Irreversible.
   */
  public static async erasePersonalData(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await CustomerController.getBusinessId(req.user.id);
      const result = await DataRetentionService.erasePersonalData(businessId, req.params.id);
      sendSuccess(res, { success: true, ...result }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/customers/stats
  public static async getCustomerStats(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await CustomerController.getBusinessId(req.user.id);
      const stats = await CustomerService.getCustomerStats(businessId);
      sendSuccess(res, { success: true, stats }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/customers/:id
  public static async getCustomerById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await CustomerController.getBusinessId(req.user.id);
      const customer = await CustomerService.getCustomerById(businessId, req.params.id);
      sendSuccess(res, { success: true, customer }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/customers
  public static async createCustomer(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await CustomerController.getBusinessId(req.user.id);
      const customer = await CustomerService.createCustomer(businessId, req.body);
      sendSuccess(res, { success: true, message: 'Customer created successfully', customer }, 201);
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/customers/:id
  public static async updateCustomer(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await CustomerController.getBusinessId(req.user.id);
      const customer = await CustomerService.updateCustomer(businessId, req.params.id, req.body);
      sendSuccess(res, { success: true, message: 'Customer updated successfully', customer }, 200);
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/customers/:id
  public static async deleteCustomer(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) throw new AppError('Authentication required', 401);
      const businessId = await CustomerController.getBusinessId(req.user.id);
      await CustomerService.deleteCustomer(businessId, req.params.id);
      sendSuccess(res, { success: true, message: 'Customer deleted successfully' }, 200);
    } catch (error) {
      next(error);
    }
  }
}
