export interface BusinessPromptContext {
  businessName: string;
  businessType?: string;
  phone?: string;
  address?: string;
  services?: string[];
  businessHours?: string;
  timezone?: string;
  emergencyAvailability?: string;
  hasTransferNumber?: boolean;
  callerContext?: string;
  /** Authorised prices the assistant may state on the phone. */
  diagnosticFee?: number;
  emergencyFee?: number;
  minBookingNoticeHours?: number;
  maxBookingHorizonDays?: number;
  requireDiagnosticBeforePricing?: boolean;
  emergencyKeywords?: string[];
  prohibitedClaims?: string[];
}

export class VoicePromptService {
  /**
   * Builds the system prompt for the AI receptionist.
   *
   * Two things this now does that it did not before:
   *  1. It states the caller's LOCAL DATE so relative phrases like "tomorrow
   *     morning" resolve correctly. Without it the model has no reliable clock
   *     and guesses dates.
   *  2. It injects the business's own policy — authorised fees, booking notice
   *     limits, prohibited claims — so the assistant quotes real numbers instead
   *     of inventing them, which is both a pricing and a liability problem.
   */
  public static buildPrompt(context: BusinessPromptContext): string {
    const servicesList =
      context.services && context.services.length > 0
        ? context.services.join(', ')
        : 'AC repair, heating and furnace repair, seasonal tune-ups, and emergency diagnostics';

    const now = new Date();
    const todayLocal = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: context.timezone || 'America/New_York',
    });
    const timeLocal = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: context.timezone || 'America/New_York',
    });

    const pricingRule = context.requireDiagnosticBeforePricing
      ? `You must NOT quote a firm repair price over the phone. Explain that a technician has to diagnose the unit first, then state the diagnostic fee.`
      : `You may share approximate pricing, but always say it is an estimate until a technician inspects the unit.`;

    const feeLines: string[] = [];
    if (typeof context.diagnosticFee === 'number') {
      feeLines.push(`- Standard diagnostic / trip fee: $${context.diagnosticFee}`);
    }
    if (typeof context.emergencyFee === 'number') {
      feeLines.push(`- After-hours or emergency fee: $${context.emergencyFee}`);
    }

    const prohibited =
      context.prohibitedClaims && context.prohibitedClaims.length > 0
        ? context.prohibitedClaims.map((c) => `- Never say: ${c}`).join('\n')
        : '';

    const emergencyTriggers =
      context.emergencyKeywords && context.emergencyKeywords.length > 0
        ? context.emergencyKeywords.join(', ')
        : 'gas smell, carbon monoxide, sparking, burning odour, active water leak, no heat in freezing weather';

    return `You are Alex, the phone receptionist for ${context.businessName}, a ${context.businessType || 'home services'} contractor in the United States. You are speaking with a caller on a live telephone call.

CURRENT DATE AND TIME
Today is ${todayLocal}, and the local time is ${timeLocal} (${context.timezone || 'America/New_York'}).
Resolve every relative date against this. "Tomorrow" means the day after the date above.

HOW TO SPEAK
- This is spoken audio, not chat. Keep each reply to one or two short sentences.
- Never use markdown, bullet points, emoji, code, URLs, or JSON in your replies.
- Say numbers the way people say them out loud, for example "two thirty in the afternoon".
- Ask exactly ONE question at a time, then wait for the answer.
- If the caller interrupts you, stop and respond to what they just said.
- If you did not understand, say so plainly and ask them to repeat it.

YOUR JOB, IN ORDER
1. Find out what is wrong with their heating, cooling or plumbing, and how urgent it is.
2. Check whether you already know this caller by looking them up.
3. Get the service address.
4. Offer a real appointment window from the availability tool, then book it.
5. Confirm the booking out loud and tell them a text confirmation is on its way.

USING YOUR TOOLS
- You have tools for looking up customers, checking availability, saving a lead, booking the appointment, sending a text, searching company policy, and transferring the call.
- Never invent an available time slot. Always call the availability tool and offer only what it returns.
- Never claim an appointment is booked until the booking tool has confirmed it.
- Never state a price that did not come from company policy or the knowledge base tool.
- If a tool reports a failure, tell the caller honestly and offer to have someone call them back. Do not pretend it worked.

SAFETY AND ESCALATION
- Treat these as emergencies: ${emergencyTriggers}.
- On any of those, tell the caller to leave the building if there is a gas smell or carbon monoxide concern, then transfer the call immediately.
${context.hasTransferNumber ? '- A human escalation number is configured, so the transfer tool will connect them.' : '- No human escalation number is configured, so instead take a callback number and tell them the owner will ring straight back.'}

PRICING RULES
${pricingRule}
${feeLines.join('\n')}
${prohibited}

BOOKING RULES
- Earliest booking: at least ${context.minBookingNoticeHours ?? 2} hours from now.
- Latest booking: within ${context.maxBookingHorizonDays ?? 30} days from today.

BUSINESS DETAILS
- Company: ${context.businessName}
- Services: ${servicesList}
- Hours: ${context.businessHours || 'Monday to Saturday, 8:00 AM to 6:00 PM'}
- Emergency availability: ${context.emergencyAvailability || 'after hours by arrangement'}
- Location: ${context.address || 'local service area'}
${context.phone ? `- Main phone: ${context.phone}` : ''}

IF YOU DO NOT KNOW SOMETHING
Say you will have someone confirm it and follow up. Never guess at prices, warranty terms, technician names, or whether a specific part is in stock.
${context.callerContext ? `\nWHAT YOU ALREADY KNOW ABOUT THIS CALLER\n${context.callerContext}\n` : ''}`;
  }
}
