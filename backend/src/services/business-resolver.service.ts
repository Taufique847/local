import { Business } from '../models/business.model';
import { BusinessPhoneNumber } from '../models/phone-number.model';
import { config } from '../config/env';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'business-resolver' });

/**
 * Resolves which tenant an inbound call/SMS belongs to, based on the number
 * that was dialled.
 *
 * Security: call.service and voice-session.service previously fell back to
 * `Business.findOne()` — literally "the first business in the database" — when
 * the dialled number was not provisioned. In a multi-tenant deployment that
 * silently attributed a stranger's call, and any customer/lead created from it,
 * to an unrelated business.
 *
 * The fallback is now only permitted when the operator has explicitly enabled
 * insecure local development mode AND exactly one business exists, which makes
 * it safe for a single-tenant dev database and impossible in production.
 */
export const resolveBusinessForInboundNumber = async (
  toNumber: string
): Promise<{ business: any | null; phoneRecord: any | null; usedFallback: boolean }> => {
  let phoneRecord = await BusinessPhoneNumber.findOne({
    phoneNumber: toNumber,
    status: 'active',
  });

  // Numbers can be stored in differing formats (+1XXXXXXXXXX vs (XXX) XXX-XXXX),
  // so retry on the trailing digits before giving up.
  if (!phoneRecord) {
    const digits = toNumber.replace(/[^\d]/g, '');
    const last10 = digits.slice(-10);
    if (last10.length === 10) {
      phoneRecord = await BusinessPhoneNumber.findOne({
        phoneNumber: { $regex: new RegExp(`${last10}$`) },
        status: 'active',
      });
    }
  }

  if (phoneRecord) {
    const business = await Business.findById(phoneRecord.businessId);
    if (business) return { business, phoneRecord, usedFallback: false };
  }

  if (config.allowInsecureWebhooks) {
    const count = await Business.countDocuments();
    if (count === 1) {
      const business = await Business.findOne();
      log.warn('inbound_number_unmatched_using_single_tenant_fallback', { toNumber });
      return { business, phoneRecord: null, usedFallback: true };
    }
    log.warn('inbound_number_unmatched_fallback_refused_multi_tenant', { toNumber, businessCount: count });
  }

  log.warn('inbound_number_not_provisioned', { toNumber });
  return { business: null, phoneRecord: null, usedFallback: false };
};
