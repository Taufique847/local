import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';

const log = logger.child({ module: 'deepgram-tts' });

const SPEAK_URL = 'https://api.deepgram.com/v1/speak';
const REQUEST_TIMEOUT_MS = 6000;

/**
 * Deepgram's docs use both `mulaw` and `mu-law` for this encoding depending on
 * the page, so the primary spelling is tried first and the alternate is used as
 * a fallback rather than failing the call.
 */
const ENCODING_CANDIDATES = ['mulaw', 'mu-law'];

export interface TtsResult {
  /** Raw 8 kHz mono G.711 μ-law audio, ready for Twilio Media Streams. */
  audio: Buffer;
  characters: number;
  latencyMs: number;
}

/**
 * Text-to-speech that returns genuine Twilio-compatible telephony audio.
 *
 * The previous implementation sent `Buffer.alloc(160, 0xaa)` — 160 bytes of a
 * constant value — and labelled it a "first byte audio packet". Callers heard a
 * buzz, never words.
 */
export class DeepgramTtsService {
  private static encodingIndex = 0;

  public static isConfigured(): boolean {
    return Boolean(config.deepgramApiKey);
  }

  /**
   * Synthesizes one utterance. Returns null (rather than throwing) so a TTS
   * outage degrades the call instead of dropping it — the caller still hears the
   * Twilio-level fallback prompt.
   */
  public static async synthesize(text: string): Promise<TtsResult | null> {
    if (!config.deepgramApiKey) return null;

    const trimmed = text.trim();
    if (!trimmed) return null;

    const startedAt = Date.now();

    // Try the currently-known-good encoding spelling first, then the alternate.
    for (let attempt = 0; attempt < ENCODING_CANDIDATES.length; attempt++) {
      const encoding = ENCODING_CANDIDATES[(DeepgramTtsService.encodingIndex + attempt) % ENCODING_CANDIDATES.length];

      const params = new URLSearchParams({
        model: config.deepgramTtsModel,
        encoding,
        sample_rate: '8000',
        // Raw headerless audio: a WAV header would be played as noise by Twilio.
        container: 'none',
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await fetch(`${SPEAK_URL}?${params.toString()}`, {
          method: 'POST',
          headers: {
            Authorization: `Token ${config.deepgramApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text: trimmed }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          // A 400 usually means the encoding spelling was rejected, so allow the
          // loop to try the alternate. Other statuses are not retried here.
          if (res.status === 400 && attempt < ENCODING_CANDIDATES.length - 1) {
            log.warn('tts_encoding_rejected_trying_alternate', { encoding, status: res.status });
            continue;
          }
          log.error('tts_request_failed', {
            status: res.status,
            encoding,
            detail: detail.slice(0, 300),
          });
          return null;
        }

        const audio = Buffer.from(await res.arrayBuffer());
        if (audio.length === 0) {
          log.warn('tts_returned_empty_audio', { encoding });
          return null;
        }

        // Remember the spelling that worked so later turns skip the probe.
        DeepgramTtsService.encodingIndex =
          (DeepgramTtsService.encodingIndex + attempt) % ENCODING_CANDIDATES.length;

        return {
          audio,
          characters: trimmed.length,
          latencyMs: Date.now() - startedAt,
        };
      } catch (err: any) {
        const aborted = err?.name === 'AbortError';
        log.error('tts_request_error', {
          encoding,
          timedOut: aborted,
          reason: aborted ? `exceeded ${REQUEST_TIMEOUT_MS}ms` : err?.message,
        });
        return null;
      } finally {
        clearTimeout(timeout);
      }
    }

    return null;
  }
}
