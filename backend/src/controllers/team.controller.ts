import { Request, Response, NextFunction } from 'express';
import { TeamService } from '../services/team.service';
import { AuthService } from '../services/auth.service';
import { BusinessScopedRequest } from '../types/auth.types';
import { setAuthCookie, setRefreshCookie } from '../utils/token';
import { sendSuccess } from '../utils/response';
import { AppError } from '../types';

const sessionContext = (req: Request) => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'] as string | undefined,
});

/**
 * Team management.
 *
 * Every handler below reads the workspace from `req.businessId`, which
 * `attachBusinessContext` resolved from the session. None of them accept a
 * business id from the caller — that is the whole basis of tenant isolation
 * here, and the QA report found a cross-tenant hole precisely where a handler
 * skipped it.
 */
export class TeamController {
  private static scope(req: BusinessScopedRequest): { businessId: string; callerId: string } {
    if (!req.user) throw new AppError('Authentication required', 401);
    if (!req.businessId) throw new AppError('Business workspace not found', 400);
    return { businessId: req.businessId, callerId: req.user.id };
  }

  // GET /api/team/members
  public static async listMembers(
    req: BusinessScopedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { businessId, callerId } = TeamController.scope(req);
      const members = await TeamService.listMembers(businessId, callerId);
      sendSuccess(res, { success: true, members }, 200);
    } catch (error) {
      next(error);
    }
  }

  // GET /api/team/invites
  public static async listInvites(
    req: BusinessScopedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { businessId } = TeamController.scope(req);
      const invites = await TeamService.listInvites(businessId);
      sendSuccess(res, { success: true, invites }, 200);
    } catch (error) {
      next(error);
    }
  }

  // POST /api/team/invites
  public static async createInvite(
    req: BusinessScopedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { businessId, callerId } = TeamController.scope(req);
      const { email, name, businessRole, technicianId } = req.body || {};
      const result = await TeamService.createInvite(businessId, callerId, {
        email,
        name,
        businessRole,
        technicianId,
      });

      sendSuccess(
        res,
        {
          success: true,
          message: `Invitation sent to ${result.invite.email}.`,
          invite: result.invite,
        },
        201
      );
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/team/invites/:inviteId
  public static async revokeInvite(
    req: BusinessScopedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { businessId } = TeamController.scope(req);
      await TeamService.revokeInvite(businessId, req.params.inviteId);
      sendSuccess(res, { success: true, message: 'Invitation revoked.' }, 200);
    } catch (error) {
      next(error);
    }
  }

  // PATCH /api/team/members/:memberId
  public static async updateMember(
    req: BusinessScopedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { businessId, callerId } = TeamController.scope(req);
      const { businessRole, isActive } = req.body || {};
      const member = await TeamService.updateMember(businessId, callerId, req.params.memberId, {
        businessRole,
        isActive,
      });
      sendSuccess(res, { success: true, member }, 200);
    } catch (error) {
      next(error);
    }
  }

  // DELETE /api/team/members/:memberId
  public static async removeMember(
    req: BusinessScopedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { businessId, callerId } = TeamController.scope(req);
      await TeamService.removeMember(businessId, callerId, req.params.memberId);
      sendSuccess(res, { success: true, message: 'Team member removed.' }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/team/invites/peek?token=...
   *
   * Public: the invitee has no account yet, so there is nothing to authenticate
   * with. The token in the link is the credential.
   */
  public static async peekInvite(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const token = typeof req.query.token === 'string' ? req.query.token : '';
      const invite = await TeamService.peekInvite(token);
      sendSuccess(res, { success: true, invite }, 200);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/team/invites/accept
   *
   * Public, and signs the new member straight in — they have just proved control
   * of the invited address and chosen a password, so bouncing them to a login
   * form would ask for the same credential twice.
   */
  public static async acceptInvite(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { token, name, password } = req.body || {};
      const user = await TeamService.acceptInvite({ token, name, password });

      const session = await AuthService.startSessionForUser(user, sessionContext(req));
      setAuthCookie(res, session.token);
      setRefreshCookie(res, session.refreshToken);

      sendSuccess(
        res,
        {
          success: true,
          message: 'Welcome aboard. Your account is ready.',
          user: session.user,
        },
        201
      );
    } catch (error) {
      next(error);
    }
  }
}
