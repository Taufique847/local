import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { VoiceSessionService } from './voice-session.service';
import { VoiceProviderService } from './voice-provider.service';

export class VoiceStreamHandler {
  private static wss: WebSocketServer | null = null;
  private static connectionsByStreamSid: Map<string, WebSocket> = new Map();
  private static connectionsByCallSid: Map<string, WebSocket> = new Map();

  public static initialize(server: any): WebSocketServer {
    const wss = new WebSocketServer({
      noServer: true,
    });

    server.on('upgrade', (request: IncomingMessage, socket: any, head: any) => {
      const pathname = request.url?.split('?')[0];
      if (pathname === '/api/voice/media-stream') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    });

    wss.on('connection', (ws: WebSocket) => {
      let callSid = '';
      let streamSid = '';

      ws.on('message', async (data: string) => {
        try {
          const msg = JSON.parse(data.toString());

          switch (msg.event) {
            case 'connected':
              break;

            case 'start':
              callSid = msg.start?.callSid || '';
              streamSid = msg.start?.streamSid || '';
              const custom = msg.start?.customParameters || {};

              if (streamSid) {
                VoiceStreamHandler.connectionsByStreamSid.set(streamSid, ws);
              }
              if (callSid) {
                VoiceStreamHandler.connectionsByCallSid.set(callSid, ws);
              }

              await VoiceSessionService.createSession({
                callSid,
                from: custom.from || msg.start?.from || '+15551234567',
                to: custom.to || msg.start?.to || '+15557654321',
                streamSid,
              });
              break;

            case 'media':
              if (callSid) {
                const session = VoiceSessionService.getSession(callSid);
                if (session && msg.media?.payload) {
                  const provider = VoiceProviderService.getProvider();
                  await provider.sendAudioChunk(session, msg.media.payload);
                }
              }
              break;

            case 'mark':
              // Twilio confirmation that an audio buffer finished playback
              break;

            case 'stop':
              if (callSid) {
                await VoiceSessionService.endSession(callSid);
              }
              if (streamSid) {
                VoiceStreamHandler.connectionsByStreamSid.delete(streamSid);
              }
              if (callSid) {
                VoiceStreamHandler.connectionsByCallSid.delete(callSid);
              }
              break;
          }
        } catch (err) {
          console.error('Error handling Twilio WebSocket message:', err);
        }
      });

      ws.on('close', async () => {
        if (callSid) {
          await VoiceSessionService.endSession(callSid);
          VoiceStreamHandler.connectionsByCallSid.delete(callSid);
        }
        if (streamSid) {
          VoiceStreamHandler.connectionsByStreamSid.delete(streamSid);
        }
      });

      ws.on('error', (err) => {
        console.error('Twilio stream WebSocket error:', err);
      });
    });

    this.wss = wss;
    return wss;
  }

  /**
   * Transmits outbound audio chunk back to Twilio caller
   */
  public static sendMediaChunk(streamSid: string, payloadBase64: string): boolean {
    const ws = this.connectionsByStreamSid.get(streamSid);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;

    ws.send(
      JSON.stringify({
        event: 'media',
        streamSid,
        media: {
          payload: payloadBase64,
        },
      })
    );
    return true;
  }

  /**
   * Barge-in Interruption: Purges Twilio's audio playback buffer immediately
   */
  public static sendClear(streamSid: string): boolean {
    const ws = this.connectionsByStreamSid.get(streamSid);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;

    ws.send(
      JSON.stringify({
        event: 'clear',
        streamSid,
      })
    );
    return true;
  }

  /**
   * Sends a tracking mark to know when Twilio finishes playing a sound
   */
  public static sendMark(streamSid: string, markName: string): boolean {
    const ws = this.connectionsByStreamSid.get(streamSid);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;

    ws.send(
      JSON.stringify({
        event: 'mark',
        streamSid,
        mark: {
          name: markName,
        },
      })
    );
    return true;
  }

  public static getWsForCall(callSid: string): WebSocket | undefined {
    return this.connectionsByCallSid.get(callSid);
  }
}
