import { Router } from 'express';
import { PhoneNumberController } from '../controllers/phone-number.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All phone number management routes require authentication
router.use(authMiddleware as any);

router.get('/', PhoneNumberController.getPhoneNumbers as any);
router.get('/primary', PhoneNumberController.getPrimaryNumber as any);
router.get('/available', PhoneNumberController.searchAvailable as any);
router.get('/status', PhoneNumberController.getConnectionStatus as any);
router.post('/provision', PhoneNumberController.provisionNumber as any);
router.post('/', PhoneNumberController.assignNumber as any);
router.patch('/:id/primary', PhoneNumberController.setPrimary as any);
router.delete('/:id', PhoneNumberController.deleteNumber as any);

export const phoneNumberRoutes = router;
export default router;
