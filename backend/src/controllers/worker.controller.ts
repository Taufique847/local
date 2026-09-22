import { Request, Response, NextFunction } from 'express';
import { WorkerService } from '../services/worker.service';
import { BusinessService } from '../services/business.service';
import { AppError } from '../types';

export class WorkerController {
  private static async getBusinessId(req: any): Promise<string> {
    if (req.business?._id) return req.business._id.toString();
    if (req.user?.businessId) return req.user.businessId.toString();
    if (req.user?.id) {
      const business = await BusinessService.getBusinessByOwnerId(req.user.id);
      if (business) return business.id;
    }
    throw new AppError('Business workspace not found', 400);
  }

  public static async getTechnicians(req: any, res: Response, next: NextFunction) {
    try {
      const businessId = await WorkerController.getBusinessId(req);
      const technicians = await WorkerService.getTechnicians(businessId);
      res.status(200).json({ success: true, technicians });
    } catch (err) {
      next(err);
    }
  }

  public static async getTodayJobs(req: any, res: Response, next: NextFunction) {
    try {
      const businessId = await WorkerController.getBusinessId(req);
      const jobs = await WorkerService.getTodayJobs(businessId, req.query.technicianId);
      res.status(200).json({ success: true, jobs });
    } catch (err) {
      next(err);
    }
  }

  /*
   * The three job-mutating handlers below did not resolve a businessId at all,
   * while the two read handlers above did. Combined with an unscoped
   * `Appointment.findById` in the service, any signed-in account could drive
   * another business's job: change its status, read the customer's name, phone
   * and email out of the response, and raise a real invoice with a live payment
   * link in that business's name.
   */

  public static async updateJobStatus(req: any, res: Response, next: NextFunction) {
    try {
      const businessId = await WorkerController.getBusinessId(req);
      const { appointmentId } = req.params;
      const { status, latitude, longitude, address } = req.body;
      const appointment = await WorkerService.updateJobStatus(
        businessId,
        appointmentId,
        status,
        { latitude, longitude, address }
      );
      res.status(200).json({ success: true, appointment });
    } catch (err) {
      next(err);
    }
  }

  public static async updateJobExecution(req: any, res: Response, next: NextFunction) {
    try {
      const businessId = await WorkerController.getBusinessId(req);
      const { appointmentId } = req.params;
      const appointment = await WorkerService.updateJobExecution(
        businessId,
        appointmentId,
        req.body
      );
      res.status(200).json({ success: true, appointment });
    } catch (err) {
      next(err);
    }
  }

  public static async completeJobAndGenerateInvoice(req: any, res: Response, next: NextFunction) {
    try {
      const businessId = await WorkerController.getBusinessId(req);
      const { appointmentId } = req.params;
      const result = await WorkerService.completeJobAndGenerateInvoice(
        businessId,
        appointmentId,
        req.body
      );
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
}
