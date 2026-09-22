import { WebSocketServer, WebSocket, RawData } from 'ws';
import { IncomingMessage } from 'http';
import { VoiceSessionService } from './voice-session.service';
import { VoiceProviderService } from './voice-provider.service';
import { logger } from '../../utils/logger';
import {
  verifyVoiceStreamToken,
  VoiceStreamTokenPayload,
} from '../../utils/voice-stream-token';

const log = logger.child({ module: 'voice-stream' });

/** What the authorized upgrade hands to the connection handler. */
interface StreamGrant {
  payload: VoiceStreamTokenPayload;
  /** Kept so the token can be spent (single-use) at the `start` frame. */
  rawToken: string | null;
}

/**
 * Twilio Media Streams bridge.
 *
 * Twilio connects here over WebSocket and exchanges JSON frames carrying
 * base64 8 kHz μ-law audio in both directions. Outbound frames are produced by
 * the voice provider's TTS stage; `clear` purges Twilio's playback buffer for
 * barge-in.
 *
 * Authorization: a single-use token in the upgrade query string, minted when the
 * `<Stream>` TwiML was generated behind a verified Twilio signature. See
 * utils/voice-stream-token.ts for why the endpoint cannot rely on a signature of
 * its own. The call's `from`/`to` are read from that signed token rather than
 * from the `start` frame, so the peer cannot choose which tenant its audio is
 * billed and recorded against.
 */
export class VoiceStreamHandler {
  private static wss: WebSocketServer | null = null;
  private static connectionsByStreamSid: Map<string, WebSocket> = new Map();
  private static connectionsByCallSid: Map<string, WebSocket> = new Map();

  public static initialize(server: any): WebSocketServer {
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request: IncomingMessage, socket: any, head: any) => {
      const [pathname, query] = (request.url || '').split('?');
      if (pathname !== '/api/voice/media-stream') {
        // Other paths are deliberately left alone so any additional upgrade
        // handlers on the same server still work.
        return;
      }

      // Rejected before a WebSocket is allocated. Twilio does not sign upgrades,
      // so this token is the only thing standing between the public internet and
      // a billable STT + LLM + TTS session.
      //
      // `consume: false` — the token is spent at the `start` frame instead.
      // Consuming it here would let a connection that dies during the handshake
      // burn the call's only token and silence a real caller.
      const token = new URLSearchParams(query || '').get('token');
      const check = verifyVoiceStreamToken(token, { consume: false });

      if (!check.ok) {
        log.warn('stream_upgrade_rejected', {
          reason: check.reason,
          ip: request.socket?.remoteAddress,
        });
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, { payload: check.payload, rawToken: token });
      });
    });

    wss.on('connection', (ws: WebSocket, _req: IncomingMessage, grant: StreamGrant) => {
      const granted = grant.payload;
      const rawToken = grant.rawToken;
      let callSid = '';
      let streamSid = '';

      ws.on('message', async (data: RawData) => {
        let msg: any;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }

        try {
          switch (msg.event) {
            case 'connected':
              break;

            case 'start': {
              streamSid = msg.start?.streamSid || '';
              const framedCallSid = msg.start?.callSid || '';

              if (!framedCallSid || !streamSid) {
                log.warn('stream_start_missing_identifiers');
                ws.close();
                return;
              }

              // The token is scoped to exactly one call. A mismatch means a
              // token minted for call A is being used to open a stream for
              // call B, so the frame is refused rather than reconciled.
              if (framedCallSid !== granted.callSid) {
                log.warn('stream_start_callsid_mismatch', {
                  framedCallSid,
                  tokenCallSid: granted.callSid,
                });
                ws.close();
                return;
              }

              // Spend the token now. Replaying a captured <Stream> URL inside the
              // TTL window is refused from here on.
              const spend = verifyVoiceStreamToken(rawToken, { consume: true });
              if (!spend.ok) {
                log.warn('stream_start_token_rejected', {
                  reason: spend.reason,
                  callSid: framedCallSid,
                });
                ws.close();
                return;
              }

              callSid = granted.callSid;
              VoiceStreamHandler.connectionsByStreamSid.set(streamSid, ws);
              VoiceStreamHandler.connectionsByCallSid.set(callSid, ws);

              // Taken from the signed token, never from the frame. These two
              // values resolve the tenant and label the caller, so accepting the
              // peer's version of them was the whole vulnerability.
              const { from, to } = granted;

              try {
                await VoiceSessionService.createSession({
                  callSid,
                  from,
                  to,
                  streamSid,
                  disclosurePlayed: granted.disclosed,
                });
                log.info('voice_stream_started', { callSid, streamSid });
              } catch (err: any) {
                // Close the socket so Twilio falls back to the TwiML verbs after
                // <Connect>, rather than holding the caller in silence.
                log.error('voice_session_create_failed', { callSid, reason: err?.message });
                ws.close();
              }
              break;
            }

            case 'media': {
              if (!callSid) return;
              const session = VoiceSessionService.getSession(callSid);
              if (!session || !msg.media?.payload) return;

              const provider = VoiceProviderService.getProvider();
              await provider.sendAudioChunk(session, msg.media.payload);
              break;
            }

            case 'mark':
              // Twilio confirming an audio buffer finished playing. Useful for
              // tracing playback completion.
              log.debug('playback_mark', { callSid, name: msg.mark?.name });
              break;

            case 'stop':
              if (callSid) await VoiceSessionService.endSession(callSid, 'caller_hangup');
              VoiceStreamHandler.cleanup(callSid, streamSid);
              break;

            default:
              break;
          }
        } catch (err) {
          log.error('stream_message_failed', { callSid, event: msg?.event, err });
        }
      });

      ws.on('close', async () => {
        try {
          if (callSid) await VoiceSessionService.endSession(callSid, 'caller_hangup');
        } catch (err) {
          log.error('stream_close_teardown_failed', { callSid, err });
        }
        VoiceStreamHandler.cleanup(callSid, streamSid);
      });

      ws.on('error', (err) => {
        log.error('stream_socket_error', { callSid, err });
      });
    });

    this.wss = wss;
    log.info('voice_stream_handler_ready', { path: '/api/voice/media-stream' });
    return wss;
  }

  private static cleanup(callSid: string, streamSid: string): void {
    if (streamSid) this.connectionsByStreamSid.delete(streamSid);
    if (callSid) this.connectionsByCallSid.delete(callSid);
  }

  /**
   * Transmits one 20 ms μ-law frame back to the caller.
   * Returns false when the socket is gone, which callers use to abort playback.
   */
  public static sendMediaChunk(streamSid: string, payloadBase64: string): boolean {
    const ws = this.connectionsByStreamSid.get(streamSid);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;

    ws.send(
      JSON.stringify({
        event: 'media',
        streamSid,
        media: { payload: payloadBase64 },
      })
    );
    return true;
  }

  /**
   * Barge-in: purges Twilio's queued playback immediately so the assistant stops
   * talking the instant the caller interrupts.
   */
  public static sendClear(streamSid: string): boolean {
    const ws = this.connectionsByStreamSid.get(streamSid);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;

    ws.send(JSON.stringify({ event: 'clear', streamSid }));
    return true;
  }

  /** Requests a callback once Twilio finishes playing everything queued so far. */
  public static sendMark(streamSid: string, markName: string): boolean {
    const ws = this.connectionsByStreamSid.get(streamSid);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;

    ws.send(
      JSON.stringify({
        event: 'mark',
        streamSid,
        mark: { name: markName },
      })
    );
    return true;
  }

  public static getWsForCall(callSid: string): WebSocket | undefined {
    return this.connectionsByCallSid.get(callSid);
  }

  /** Number of live media streams. Used by the health endpoint. */
  public static activeStreamCount(): number {
    return this.connectionsByStreamSid.size;
  }
}
