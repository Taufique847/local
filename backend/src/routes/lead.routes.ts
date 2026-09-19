import { Router } from 'express';
import { LeadController } from '../controllers/lead.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All lead routes require authentication
router.use(authMiddleware as any);

router.get('/', LeadController.getLeads as any);
router.get('/stats', LeadController.getLeadStats as any);
router.get('/:id', LeadController.getLeadById as any);
router.post('/', LeadController.createLead as any);
router.patch('/:id', LeadController.updateLead as any);
router.patch('/:id/status', LeadController.updateLeadStatus as any);
router.post('/:id/qualify', LeadController.qualifyLead as any);
router.post('/:id/activities', LeadController.addActivity as any);
router.delete('/:id', LeadController.archiveLead as any);

export const leadRoutes = router;
