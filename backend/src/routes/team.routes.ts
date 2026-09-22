import { Router } from 'express';
import { TeamController } from '../controllers/team.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { attachBusinessContext, requireOwner } from '../middleware/business-role';
import { authLimiter, publicFormLimiter } from '../middleware/rate-limit';
import { validateBody } from '../middleware/validate';
import {
  acceptInviteSchema,
  createInviteSchema,
  updateMemberSchema,
} from '../validation/schemas';

const router = Router();

/**
 * Public invite endpoints.
 *
 * Declared BEFORE the router-level auth guard below, because the invitee has no
 * account yet. Both are rate limited: they accept a secret token from anonymous
 * callers, so they are the two endpoints here an attacker can actually reach.
 */
router.get('/invites/peek', publicFormLimiter, TeamController.peekInvite);
router.post(
  '/invites/accept',
  authLimiter,
  validateBody(acceptInviteSchema),
  TeamController.acceptInvite
);

/**
 * Everything past this point requires a session AND a resolved workspace.
 *
 * Team management is owner-only. A dispatcher who could invite people could
 * invite themselves a second account, and a technician who could change roles
 * could promote themselves to owner and reach the company's billing.
 */
router.use(authMiddleware as any);
router.use(attachBusinessContext as any);
router.use(requireOwner as any);

router.get('/members', TeamController.listMembers as any);
router.patch(
  '/members/:memberId',
  validateBody(updateMemberSchema),
  TeamController.updateMember as any
);
router.delete('/members/:memberId', TeamController.removeMember as any);

router.get('/invites', TeamController.listInvites as any);
router.post('/invites', validateBody(createInviteSchema), TeamController.createInvite as any);
router.delete('/invites/:inviteId', TeamController.revokeInvite as any);

export default router;
