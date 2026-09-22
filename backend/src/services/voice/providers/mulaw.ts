/**
 * G.711 μ-law helpers for Twilio Media Streams.
 *
 * Twilio sends and expects 8 kHz mono μ-law, base64-encoded, in 20 ms frames
 * (160 bytes). Anything else produces silence or noise on the call, which is
 * why the previous implementation's `Buffer.alloc(160, 0xaa)` filler was
 * audible as a tone rather than speech.
 */

/** Bytes in one 20 ms μ-law frame at 8 kHz. */
export const MULAW_FRAME_BYTES = 160;

/** Duration of one frame in milliseconds. */
export const MULAW_FRAME_MS = 20;

/** μ-law byte value that encodes digital silence. */
export const MULAW_SILENCE_BYTE = 0xff;

/**
 * Expands one 8-bit μ-law sample to 16-bit signed linear PCM.
 */
export const muLawToLinear = (byte: number): number => {
  const inverted = ~byte & 0xff;
  const sign = inverted & 0x80 ? -1 : 1;
  const exponent = (inverted >> 4) & 0x07;
  const mantissa = inverted & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return sign * sample;
};

/**
 * Root-mean-square amplitude and variance of a μ-law buffer, used by the
 * barge-in detector to tell human speech from steady HVAC equipment hum.
 */
export const analyzeMulawSignal = (buffer: Buffer): { rms: number; variance: number } => {
  if (buffer.length === 0) return { rms: 0, variance: 0 };

  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < buffer.length; i++) {
    const sample = muLawToLinear(buffer[i]);
    sum += sample;
    sumSq += sample * sample;
  }

  const mean = sum / buffer.length;
  const meanSq = sumSq / buffer.length;
  return {
    rms: Math.sqrt(meanSq),
    variance: Math.max(0, meanSq - mean * mean),
  };
};

/**
 * Splits a raw μ-law buffer into 20 ms frames, padding the final frame with
 * silence so Twilio never receives a short frame.
 */
export const chunkIntoFrames = (audio: Buffer): string[] => {
  const frames: string[] = [];

  for (let offset = 0; offset < audio.length; offset += MULAW_FRAME_BYTES) {
    const slice = audio.subarray(offset, offset + MULAW_FRAME_BYTES);

    if (slice.length === MULAW_FRAME_BYTES) {
      frames.push(slice.toString('base64'));
    } else {
      const padded = Buffer.alloc(MULAW_FRAME_BYTES, MULAW_SILENCE_BYTE);
      slice.copy(padded);
      frames.push(padded.toString('base64'));
    }
  }

  return frames;
};

/** Duration in seconds of a μ-law payload at 8 kHz. */
export const mulawDurationSeconds = (byteLength: number): number => byteLength / 8000;
