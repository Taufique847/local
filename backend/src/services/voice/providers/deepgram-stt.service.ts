import WebSocket from 'ws';
import { config } from '../../../config/env';
import { logger } from '../../../utils/logger';
import { mulawDurationSeconds } from './mulaw';

const log = logger.child({ module: 'deepgram-stt' });

export interface SttCallbacks {
  /** Fired for every transcript, interim or final. */
  onTranscript: (text: string, isFinal: boolean) => void;
  /** Fired once Deepgram is confident the caller finished a turn. */
  onUtteranceEnd: () => void;
  /** Fired when Deepgram first detects speech in the stream. */
  onSpeechStarted?: () => void;
  onError: (error: Error) => void;
  onClose?: () => void;
}

/**
 * Streaming speech-to-text over Deepgram's live WebSocket.
 *
 * This replaces having no STT at all: the previous "realtime" provider decoded
 * inbound audio only to measure loudness, pushed it into an array nothing ever
 * read, and derived replies from `if (text.includes('ac'))` keyword matching on
 * a string that was never produced from real speech.
 *
 * Audio is forwarded exactly as Twilio delivers it (8 kHz mono μ-law), so no
 * resampling is required.
 */
export class DeepgramSttStream {
  private ws: WebSocket | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private closed = false;
  private ready = false;
  /** Audio buffered while the socket is still opening. */
  private pending: Buffer[] = [];
  private audioBytesSent = 0;

  constructor(private readonly callbacks: SttCallbacks) {}

  public get audioSeconds(): number {
    return mulawDurationSeconds(this.audioBytesSent);
  }

  public static isConfigured(): boolean {
    return Boolean(config.deepgramApiKey);
  }

  public async connect(): Promise<void> {
    if (!config.deepgramApiKey) {
      throw new Error('DEEPGRAM_API_KEY is not configured');
    }

    const params = new URLSearchParams({
      model: config.deepgramSttModel,
      // Twilio Media Streams carry raw headerless G.711 μ-law at 8 kHz.
      encoding: 'mulaw',
      sample_rate: '8000',
      channels: '1',
      language: 'en-US',
      punctuate: 'true',
      smart_format: 'true',
      // interim_results is a prerequisite for UtteranceEnd messages.
      interim_results: 'true',
      // 300 ms of silence ends a segment: responsive without clipping a caller
      // who pauses mid-sentence.
      endpointing: '300',
      // Backstop turn signal when endpointing does not fire (e.g. background noise).
      utterance_end_ms: '1000',
      vad_events: 'true',
      // Bias the model toward the vocabulary that actually occurs on these calls.
      keywords: [
        'HVAC:2',
        'furnace:2',
        'condenser:2',
        'thermostat:2',
        'refrigerant:2',
        'heat pump:2',
        'AC:2',
      ].join('&keywords='),
    });

    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url, {
        headers: { Authorization: `Token ${config.deepgramApiKey}` },
        handshakeTimeout: 8000,
      });

      const onOpenError = (err: Error) => {
        socket.removeAllListeners();
        reject(err);
      };

      socket.once('open', () => {
        socket.removeListener('error', onOpenError);
        this.ws = socket;
        this.ready = true;
        this.attachHandlers(socket);
        this.startKeepAlive();

        // Flush anything that arrived during the handshake so the first words of
        // the call are not lost.
        for (const chunk of this.pending) socket.send(chunk);
        this.pending = [];

        log.debug('stt_connected', { model: config.deepgramSttModel });
        resolve();
      });

      socket.once('error', onOpenError);
    });
  }

  private attachHandlers(socket: WebSocket): void {
    socket.on('message', (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case 'Results': {
            const alternative = msg.channel?.alternatives?.[0];
            const text: string = alternative?.transcript ?? '';
            if (!text.trim()) return;

            // `speech_final` means Deepgram detected end-of-speech, which is the
            // signal to hand the turn to the language model.
            const isFinal = Boolean(msg.speech_final);
            this.callbacks.onTranscript(text, isFinal);
            if (isFinal) this.callbacks.onUtteranceEnd();
            return;
          }

          case 'UtteranceEnd':
            this.callbacks.onUtteranceEnd();
            return;

          case 'SpeechStarted':
            this.callbacks.onSpeechStarted?.();
            return;

          case 'Metadata':
            return;

          default:
            return;
        }
      } catch (err: any) {
        log.warn('stt_message_parse_failed', { reason: err?.message });
      }
    });

    socket.on('error', (err: Error) => {
      if (this.closed) return;
      log.error('stt_socket_error', { err });
      this.callbacks.onError(err);
    });

    socket.on('close', (code: number) => {
      this.ready = false;
      this.stopKeepAlive();
      if (!this.closed) {
        log.warn('stt_socket_closed_unexpectedly', { code });
        this.callbacks.onClose?.();
      }
    });
  }

  /**
   * Deepgram closes idle sockets; a periodic KeepAlive keeps the connection up
   * during long silences (a caller reading a serial number off their unit, say).
   */
  private startKeepAlive(): void {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
      }
    }, 5000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  public sendAudio(payloadBase64: string): void {
    if (this.closed) return;

    const buffer = Buffer.from(payloadBase64, 'base64');
    this.audioBytesSent += buffer.length;

    if (this.ready && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(buffer);
    } else if (this.pending.length < 250) {
      // Bounded: ~5 seconds of audio. Beyond that the socket is not coming back
      // and buffering further would only grow memory.
      this.pending.push(buffer);
    }
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.stopKeepAlive();

    const socket = this.ws;
    this.ws = null;
    if (!socket) return;

    try {
      if (socket.readyState === WebSocket.OPEN) {
        // Ask Deepgram to flush any trailing audio before tearing down.
        socket.send(JSON.stringify({ type: 'CloseStream' }));
      }
      socket.close();
    } catch {
      socket.terminate();
    }
  }
}
