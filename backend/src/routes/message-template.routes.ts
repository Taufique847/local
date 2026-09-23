import { Router } from 'express';
import { MessageTemplateController } from '../controllers/message-template.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { attachBusinessContext, requireOwner } from '../middleware/business-role';
import { validateBody } from '../middleware/validate';
import { messageTemplateSchema, messageTemplatePreviewSchema } from '../validation/schemas';

const router = Router();

router.use(authMiddleware as any);
router.use(attachBusinessContext as any);

/**
 * Owner-only, including the reads.
 *
 * Changing this copy changes what every customer of the business receives, and the
 * standard wording carries the opt-out notice carriers expect. That is not a
 * dispatcher's call. Reads are gated too, because the editor is the only consumer
 * and leaving it open would imply a dispatcher screen that exists and does not.
 */
router.use(requireOwner as any);

router.get('/', MessageTemplateController.list as any);
router.post(
  '/preview',
  validateBody(messageTemplatePreviewSchema),
  MessageTemplateController.preview as any
);
router.put('/', validateBody(messageTemplateSchema), MessageTemplateController.upsert as any);
router.delete('/:type/:channel', MessageTemplateController.reset as any);

export const messageTemplateRoutes = router;
export default router;
