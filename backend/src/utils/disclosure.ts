/**
 * Spoken compliance notice played before an AI voice session begins.
 *
 * Two separate obligations are covered by one sentence:
 *
 *  - Recording/capture. Roughly a dozen US states require all parties to
 *    consent before a call is recorded (California, Florida, Pennsylvania,
 *    Washington, Illinois, Massachusetts and others). Full conversation
 *    transcripts are retained on every call, so callers are told.
 *  - Synthetic voice. Disclosure that the caller is speaking with an automated
 *    system, rather than being left to infer it.
 *
 * Previously no disclosure was played at all: the assistant answered, gave a
 * human first name, and the conversation was transcribed and stored.
 */

const MAX_SPOKEN_LENGTH = 400;

/**
 * US Two-Party / All-Party Consent wiretapping states (CIPA, Florida Chapter 934, etc.)
 * where recording or transcribing without notice carries severe criminal & civil penalties ($5,000/call).
 */
const TWO_PARTY_AREA_CODES = new Set([
  // California
  '209', '213', '310', '323', '408', '415', '424', '442', '510', '530', '559', '562', '619', '626', '628', '650', '657', '661', '669', '707', '714', '747', '760', '805', '818', '820', '831', '858', '909', '916', '925', '949', '951',
  // Florida
  '239', '305', '321', '352', '386', '407', '561', '727', '754', '772', '786', '813', '850', '863', '904', '941', '954',
  // Pennsylvania
  '215', '267', '272', '412', '484', '570', '610', '717', '724', '814', '878',
  // Illinois
  '217', '224', '309', '312', '331', '618', '630', '708', '773', '779', '815', '847', '872',
  // Massachusetts
  '339', '351', '413', '508', '617', '774', '781', '857', '978',
  // Maryland
  '240', '301', '410', '443', '667',
  // Washington
  '206', '253', '360', '425', '509', '564',
  // Connecticut
  '203', '475', '860', '959',
  // Delaware, Montana, New Hampshire, Michigan
  '302', '406', '603', '231', '248', '269', '313', '517', '586', '616', '734', '810', '906', '947', '989'
]);

/**
 * Safely extracts a 3-digit North American Numbering Plan (NANP) area code from any phone string.
 * Handles standard E.164 (+12135551234), 10-digit (2135551234), 11-digit (12135551234),
 * extensions (e.g. +12135551234ext567), and validates against NANP standard (/^[2-9]\d{2}$/).
 */
export function getUSAreaCode(phone?: string): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  // If explicitly formatted with an international prefix other than +1, not a US number
  if (trimmed.startsWith('+') && !trimmed.startsWith('+1')) {
    return '';
  }

  const digits = trimmed.replace(/[^\d]/g, '');

  // 11+ digits starting with '1' (US country code prefix)
  if (digits.startsWith('1') && digits.length >= 11) {
    const candidate = digits.slice(1, 4);
    if (/^[2-9]\d{2}$/.test(candidate)) return candidate;
  }

  // Exactly 10 digits without country code (standard US 10-digit format)
  if (digits.length === 10) {
    const candidate = digits.slice(0, 3);
    if (/^[2-9]\d{2}$/.test(candidate)) return candidate;
  }

  return '';
}

export function isTwoPartyConsentJurisdiction(phone?: string): boolean {
  const areaCode = getUSAreaCode(phone);
  return TWO_PARTY_AREA_CODES.has(areaCode);
}

/**
 * US States with Mini-TCPA statutes establishing an 8:00 PM quiet hours cutoff
 * (Florida FTSA, Oklahoma OTSA, Maryland MTAA) vs federal 9:00 PM.
 */
export const EARLY_QUIET_HOURS_AREA_CODES = new Set([
  // Florida
  '239', '305', '321', '352', '386', '407', '561', '727', '754', '772', '786', '813', '850', '863', '904', '941', '954',
  // Oklahoma
  '405', '539', '580', '918',
  // Maryland
  '240', '301', '410', '443', '667',
]);

export function isEarlyQuietHoursJurisdiction(phone?: string): boolean {
  const areaCode = getUSAreaCode(phone);
  return EARLY_QUIET_HOURS_AREA_CODES.has(areaCode);
}

const PACIFIC_AREA_CODES = new Set([
  // CA
  '209', '213', '310', '323', '408', '415', '424', '442', '510', '530', '559', '562', '619', '626', '628', '650', '657', '661', '669', '707', '714', '747', '760', '805', '818', '820', '831', '858', '909', '916', '925', '949', '951',
  // WA, OR, NV
  '206', '253', '360', '425', '509', '564', '458', '503', '541', '971', '702', '725', '775',
]);

const MOUNTAIN_AREA_CODES = new Set([
  // CO, UT, NM, WY, MT, ID
  '303', '719', '720', '970', '385', '435', '801', '505', '575', '307', '406', '208', '986',
]);

const ARIZONA_AREA_CODES = new Set([
  // AZ (Mountain Standard Time - no DST)
  '480', '520', '602', '623', '928',
]);

const ALASKA_HAWAII_AREA_CODES: Record<string, string> = {
  '907': 'America/Anchorage',
  '808': 'Pacific/Honolulu',
};

const CENTRAL_AREA_CODES = new Set([
  // TX
  '210', '214', '254', '281', '325', '346', '361', '409', '430', '432', '469', '512', '713', '726', '737', '806', '817', '830', '832', '903', '915', '936', '940', '956', '972', '979',
  // IL
  '217', '224', '309', '312', '331', '618', '630', '708', '773', '779', '815', '847', '872',
  // OK
  '405', '539', '580', '918',
  // MN, WI, MO, LA, AL, MS, AR, IA, KS, NE, ND, SD, TN
  '218', '320', '507', '612', '651', '763', '952',
  '262', '414', '534', '608', '715', '920',
  '314', '417', '573', '636', '660', '816',
  '225', '318', '337', '504', '985',
  '205', '251', '256', '334', '938',
  '228', '601', '662', '769',
  '479', '501', '870',
  '319', '515', '563', '641', '712',
  '316', '620', '785', '913',
  '308', '402', '531',
  '701', '605',
  '423', '615', '629', '731', '865', '901', '931',
]);

/**
 * Maps a US area code to the recipient's primary IANA timezone for TCPA quiet hours compliance.
 */
export function getTimezoneForAreaCode(areaCode?: string): string | null {
  if (!areaCode || !/^[2-9]\d{2}$/.test(areaCode)) return null;
  if (PACIFIC_AREA_CODES.has(areaCode)) return 'America/Los_Angeles';
  if (ARIZONA_AREA_CODES.has(areaCode)) return 'America/Phoenix';
  if (MOUNTAIN_AREA_CODES.has(areaCode)) return 'America/Denver';
  if (ALASKA_HAWAII_AREA_CODES[areaCode]) return ALASKA_HAWAII_AREA_CODES[areaCode];
  if (CENTRAL_AREA_CODES.has(areaCode)) return 'America/Chicago';
  return 'America/New_York';
}

/**
 * Resolves recipient's IANA timezone from phone number. Defaults to fallback if not resolved.
 */
export function getTimezoneForPhoneNumber(phone?: string, fallback: string = 'America/New_York'): string {
  const areaCode = getUSAreaCode(phone);
  return getTimezoneForAreaCode(areaCode) || fallback;
}

/**
 * Sanitizes custom disclosure text to prevent prompt injection and abusive speech synthesis.
 * Strips out LLM jailbreaks, system instruction overrides, URLs, and executable scripts.
 */
export function sanitizeDisclosureText(text?: string): string {
  if (!text) return '';
  let cleaned = text.trim();

  // Strip scripts and HTML tags completely
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');
  cleaned = cleaned.replace(/<[^>]*>/g, '');

  // Strip known prompt injection / role-break attempts
  const injectionPatterns = [
    /ignore\s+(?:all\s+|any\s+|previous\s+|prior\s+)?instructions/gi,
    /disregard\s+(?:all\s+|any\s+|previous\s+|prior\s+)?instructions/gi,
    /you\s+are\s+now\s+(?:a|an)?/gi,
    /\b(?:system\s*prompt|system\s*:|assistant\s*:|human\s*:|user\s*:)\b/gi,
    /\b(?:jailbreak|dan\s+mode|developer\s+mode)\b/gi,
    /https?:\/\/\S+/gi,
  ];

  for (const pattern of injectionPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Only keep alphanumeric characters, standard punctuation, and spaces
  cleaned = cleaned.replace(/[^\w\s.,!?'"()\-–—]/g, ' ').replace(/\s{2,}/g, ' ').trim();

  return cleaned.slice(0, MAX_SPOKEN_LENGTH);
}

/**
 * All-Party / Two-Party Consent wiretapping states where physical presence of either
 * the business or caller legally mandates recording and automated assistant notice.
 * (California CIPA § 632, Florida Ch. 934, Pennsylvania, Massachusetts, Illinois, etc.)
 */
export const TWO_PARTY_STATES = new Set([
  'CA', 'FL', 'PA', 'IL', 'MA', 'MD', 'WA', 'CT', 'DE', 'MT', 'NH', 'MI',
  'CALIFORNIA', 'FLORIDA', 'PENNSYLVANIA', 'ILLINOIS', 'MASSACHUSETTS', 'MARYLAND', 'WASHINGTON', 'CONNECTICUT', 'DELAWARE', 'MONTANA', 'NEW HAMPSHIRE', 'MICHIGAN'
]);

export function isTwoPartyState(state?: string): boolean {
  if (!state) return false;
  return TWO_PARTY_STATES.has(state.trim().toUpperCase());
}

/**
 * Builds the notice for a business.
 *
 * Returns null when disclosure is switched off in policy, EXCEPT in Two-Party
 * consent states (California, Florida, etc.) where recording/processing disclosure is
 * non-waivable by state wiretapping law (based on caller area code or business jurisdiction).
 */
export function buildAiDisclosure(params: {
  businessName?: string;
  enabled?: boolean;
  customText?: string;
  /**
   * Whether a human can actually be reached. The notice only offers a
   * representative when there is a number to transfer to, so it does not
   * promise something the assistant cannot deliver.
   */
  canTransfer?: boolean;
  callerPhone?: string;
  businessState?: string;
}): string | null {
  const mandatoryTwoParty =
    isTwoPartyConsentJurisdiction(params.callerPhone) ||
    isTwoPartyState(params.businessState);

  if (params.enabled === false && !mandatoryTwoParty) return null;

  const custom = sanitizeDisclosureText(params.customText);
  if (custom && custom.length >= 10) {
    if (mandatoryTwoParty) {
      // In Two-Party / All-Party wiretapping states (CA, FL, PA, etc.), recording disclosure
      // is non-waivable by law. If custom text omits recording notice, append it to prevent
      // CIPA § 632 / Fla. Stat. § 934 statutory damages ($5,000 per call).
      const hasRecordingNotice = /record|transcrib/i.test(custom);
      if (!hasRecordingNotice) {
        return `${custom} This call is recorded and transcribed for quality and scheduling.`.slice(0, MAX_SPOKEN_LENGTH);
      }
    }
    return custom;
  }

  const name = params.businessName?.trim();
  // Deliberately not "Thanks for calling X" — the assistant's own greeting says
  // that, and callers would hear the business name twice in a row.
  const who = name ? `You've reached ${name}.` : '';

  const core = `${who} You're speaking with an automated assistant, and this call is recorded and transcribed for quality and scheduling.`.trim();

  const transferOffer = params.canTransfer
    ? ' If you would rather speak with a person, just say "representative" at any time.'
    : '';

  return `${core}${transferOffer}`.slice(0, MAX_SPOKEN_LENGTH);
}

/** Notice played before a voicemail recording starts (Includes PCI & Wiretap notice). */
export const VOICEMAIL_RECORDING_NOTICE =
  'Your message will be recorded so our team can call you back. Please do not leave credit card or payment information on this recording.';
