/**
 * Escapes the five XML predefined entities.
 *
 * Needed wherever customer- or AI-generated text is interpolated into a TwiML
 * document: an unescaped `&` or `<` produces malformed XML that Twilio rejects
 * (dropping the call or message), and in the worst case allows injecting extra
 * TwiML verbs.
 */
export const escapeXml = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};
