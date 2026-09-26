import { Router } from 'express';
import { PhoneNumberController } from '../controllers/phone-number.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { attachBusinessContext, requireOwner } from '../middleware/business-role';

const router = Router();

// All phone number management routes require authentication and workspace context
router.use(authMiddleware as any);
router.use(attachBusinessContext as any);

// Read-only queries for workspace members
router.get('/', PhoneNumberController.getPhoneNumbers as any);
router.get('/primary', PhoneNumberController.getPrimaryNumber as any);
router.get('/status', PhoneNumberController.getConnectionStatus as any);

// Mutating, provisioning, setting primary, and deleting numbers is strictly owner-only
router.get('/available', requireOwner as any, PhoneNumberController.searchAvailable as any);
router.post('/provision', requireOwner as any, PhoneNumberController.provisionNumber as any);
router.post('/', requireOwner as any, PhoneNumberController.assignNumber as any);
router.patch('/:id/primary', requireOwner as any, PhoneNumberController.setPrimary as any);
router.delete('/:id', requireOwner as any, PhoneNumberController.deleteNumber as any);

export const phoneNumberRoutes = router;
export default router;

