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
 * Builds the notice for a business.
 *
 * Returns null when disclosure is switched off in policy, so callers can skip
 * the verb entirely rather than speaking an empty string.
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
}): string | null {
  if (params.enabled === false) return null;

  const custom = params.customText?.trim();
  if (custom) return custom.slice(0, MAX_SPOKEN_LENGTH);

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

/** Notice played before a voicemail recording starts. */
export const VOICEMAIL_RECORDING_NOTICE =
  'Your message will be recorded so our team can call you back.';
