import { Request, Response, NextFunction } from 'express';
import { WorkerService } from '../services/worker.service';
import { BusinessContextService } from '../services/business-context.service';
import { AppError } from '../types';

export class WorkerController {
  /**
   * Resolves the caller's workspace by MEMBERSHIP.
   *
   * `req.businessId` is set by `attachBusinessContext`; the fallback covers
   * routes that have not been given that middleware yet. The previous version
   * checked `req.business` and `req.user.businessId`, neither of which was ever
   * populated, then fell through to an owner-only lookup.
   */
  private static async getBusinessId(req: any): Promise<string> {
    if (req.businessId) return req.businessId as string;
    if (!req.user?.id) throw new AppError('Authentication required', 401);
    const context = await BusinessContextService.resolve(req.user.id);
    return context.businessId;
  }

  /**
   * Which technician's jobs this request may see.
   *
   * A technician user is pinned to their own dispatch record and the
   * `technicianId` query parameter is ignored for them. Owners and dispatchers
   * keep the parameter, because filtering the board by person is their job.
   *
   * This is the difference between a technician *account* and the technician
   * *picker* the PWA used to show: previously the worker app ran on the owner's
   * session and the "logged-in technician" was a dropdown, so anyone with the
   * session could read every technician's schedule, including customer names,
   * phone numbers and addresses.
   */
  private static resolveTechnicianScope(req: any): string | undefined {
    if (req.businessRole === 'technician') {
      // A technician whose account is not linked to a dispatch record has no
      // jobs of their own. Returning an impossible id is wrong; returning
      // undefined would show them the whole board. So this is refused loudly.
      if (!req.user?.technicianId) {
        throw new AppError(
          'Your account is not linked to a technician record yet. Ask your manager to set this up.',
          409
        );
      }
      return req.user.technicianId as string;
    }

    const requested = req.query?.technicianId;
    return typeof requested === 'string' && requested ? requested : undefined;
  }

  /**
   * Restriction applied to job MUTATIONS.
   *
   * Unlike the read scope this never honours a query parameter: an owner or
   * dispatcher may act on any job in the workspace, and a technician only on
   * their own. Passing a technicianId here would let one technician name another
   * and edit their jobs.
   */
  private static jobScope(req: any): { technicianId?: string | null } {
    if (req.businessRole !== 'technician') return {};
    if (!req.user?.technicianId) {
      throw new AppError(
        'Your account is not linked to a technician record yet. Ask your manager to set this up.',
        409
      );
    }
    return { technicianId: req.user.technicianId as string };
  }

  public static async getTechnicians(req: any, res: Response, next: NextFunction) {
    try {
      const businessId = await WorkerController.getBusinessId(req);

      // A technician does not need the roster — the PWA only used it to populate
      // the picker, and showing one person the whole team is needless exposure.
      if (req.businessRole === 'technician') {
        const technicians = await WorkerService.getTechnicians(businessId, {
          onlyId: req.user?.technicianId,
        });
        res.status(200).json({ success: true, technicians });
        return;
      }

      const technicians = await WorkerService.getTechnicians(businessId);
      res.status(200).json({ success: true, technicians });
    } catch (err) {
      next(err);
    }
  }

  public static async getTodayJobs(req: any, res: Response, next: NextFunction) {
    try {
      const businessId = await WorkerController.getBusinessId(req);
      const technicianId = WorkerController.resolveTechnicianScope(req);
      const jobs = await WorkerService.getTodayJobs(businessId, technicianId);
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
        { latitude, longitude, address },
        WorkerController.jobScope(req)
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
        req.body,
        WorkerController.jobScope(req)
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
        req.body,
        WorkerController.jobScope(req)
      );
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }
}
