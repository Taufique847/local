import { config, isAzureLlmConfigured, LlmBackendName } from '../../../config/env';
import { logger } from '../../../utils/logger';

const log = logger.child({ module: 'llm' });

const REQUEST_TIMEOUT_MS = 8000;

/**
 * Retries inside a single backend. Kept lower when a second backend exists:
 * hammering a failing provider three times before failing over would spend the
 * whole latency budget on the backend we already know is unhealthy.
 */
const MAX_ATTEMPTS_SOLO = 3;
const MAX_ATTEMPTS_WITH_FALLBACK = 2;

export interface LlmToolCall {
  id: string;
  name: string;
  /** Raw JSON string of arguments as emitted by the model. */
  argumentsJson: string;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface LlmResponse {
  content: string | null;
  toolCalls: LlmToolCall[];
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  /** Which backend actually produced this. Surfaces failover in call records. */
  backend: LlmBackendName;
  /** Model or Azure deployment that served the request. */
  model: string;
}

/** A resolved, ready-to-call chat-completions endpoint. */
interface ResolvedBackend {
  name: LlmBackendName;
  url: string;
  headers: Record<string, string>;
  /** Value for the request body's `model` field. */
  model: string;
}

/**
 * Chat completion with function/tool calling, across two interchangeable
 * backends.
 *
 * Azure OpenAI and public OpenAI expose the same request and response schema
 * for chat completions, so there is one request/parse/retry implementation and
 * the backends differ only in URL, auth header, and what `model` means
 * (a model id for OpenAI, a deployment name for Azure).
 *
 * Replaces the hardcoded `if (text.includes('ac') || text.includes('leak'))`
 * branching that previously stood in for reasoning. The tool registry already
 * produced valid JSON schemas; nothing ever sent them to a model.
 */
export class LlmService {
  /** True when at least one backend can serve a request. */
  public static isConfigured(): boolean {
    return this.resolveChain().length > 0;
  }

  /**
   * Ordered backends to attempt: primary first, then the fallback. Unconfigured
   * backends are dropped rather than attempted, so a missing Azure deployment
   * degrades to OpenAI instead of producing a guaranteed 404 on every call.
   */
  private static resolveChain(): ResolvedBackend[] {
    const order: LlmBackendName[] = [config.llm.primary];
    if (config.llm.fallback !== 'none' && config.llm.fallback !== config.llm.primary) {
      order.push(config.llm.fallback);
    }

    const chain: ResolvedBackend[] = [];
    for (const name of order) {
      const resolved = name === 'azure' ? this.resolveAzure() : this.resolveOpenai();
      if (resolved) chain.push(resolved);
    }
    return chain;
  }

  private static resolveOpenai(): ResolvedBackend | null {
    if (!config.openaiApiKey) return null;
    return {
      name: 'openai',
      url: `${config.openaiBaseUrl}/chat/completions`,
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      model: config.openaiModel,
    };
  }

  private static resolveAzure(): ResolvedBackend | null {
    if (!isAzureLlmConfigured()) return null;

    const { endpoint, deployment, apiKey, apiMode, apiVersion } = config.azureOpenai;

    // v1 keeps the deployment in the body and needs no api-version pinning;
    // the older deployment-scoped route puts it in the path and does.
    const url =
      apiMode === 'deployment'
        ? `${endpoint}/openai/deployments/${encodeURIComponent(deployment!)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`
        : `${endpoint}/openai/v1/chat/completions`;

    return {
      name: 'azure',
      url,
      // Azure authenticates with `api-key`, not a bearer token.
      headers: {
        'api-key': apiKey!,
        'Content-Type': 'application/json',
      },
      // Azure routes on the deployment name, supplied here as `model`. In
      // deployment mode the path already selects it and the field is ignored.
      model: deployment!,
    };
  }

  public static async complete(params: {
    messages: LlmMessage[];
    tools?: any[];
    maxTokens?: number;
    temperature?: number;
  }): Promise<LlmResponse | null> {
    const chain = this.resolveChain();
    if (chain.length === 0) return null;

    const startedAt = Date.now();
    const maxAttempts = chain.length > 1 ? MAX_ATTEMPTS_WITH_FALLBACK : MAX_ATTEMPTS_SOLO;

    for (let i = 0; i < chain.length; i++) {
      const backend = chain[i];
      const isLast = i === chain.length - 1;

      // A caller is on the line. Once the budget is gone, returning nothing is
      // better than opening yet another 8-second request.
      const elapsed = Date.now() - startedAt;
      if (i > 0 && elapsed >= config.llm.totalBudgetMs) {
        log.error('llm_failover_budget_exhausted', {
          skipped: backend.name,
          elapsedMs: elapsed,
          budgetMs: config.llm.totalBudgetMs,
        });
        return null;
      }

      const result = await this.attemptBackend(backend, params, startedAt, maxAttempts);
      if (result) {
        if (i > 0) {
          log.warn('llm_served_by_fallback', {
            backend: backend.name,
            primary: config.llm.primary,
            latencyMs: result.latencyMs,
          });
        }
        return result;
      }

      if (!isLast) {
        log.warn('llm_failing_over', {
          from: backend.name,
          to: chain[i + 1].name,
          elapsedMs: Date.now() - startedAt,
        });
      }
    }

    return null;
  }

  /** Runs one backend to exhaustion. Returns null when every attempt failed. */
  private static async attemptBackend(
    backend: ResolvedBackend,
    params: {
      messages: LlmMessage[];
      tools?: any[];
      maxTokens?: number;
      temperature?: number;
    },
    startedAt: number,
    maxAttempts: number
  ): Promise<LlmResponse | null> {
    const body: Record<string, unknown> = {
      model: backend.model,
      messages: params.messages,
      // Phone replies must be short: long paragraphs are unbearable to listen to
      // and inflate both latency and TTS cost.
      max_tokens: params.maxTokens ?? 180,
      temperature: params.temperature ?? 0.4,
    };

    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools;
      body.tool_choice = 'auto';
    }

    const payload = JSON.stringify(body);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await fetch(backend.url, {
          method: 'POST',
          headers: backend.headers,
          body: payload,
          signal: controller.signal,
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          const retryable = res.status === 429 || res.status >= 500;

          if (retryable && attempt < maxAttempts) {
            // Exponential backoff with jitter. A live caller is waiting, so the
            // delays are deliberately small.
            const delay = Math.min(1200, 150 * 2 ** (attempt - 1)) + Math.random() * 100;
            log.warn('llm_retrying', {
              backend: backend.name,
              status: res.status,
              attempt,
              delayMs: Math.round(delay),
            });
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }

          log.error('llm_request_failed', {
            backend: backend.name,
            status: res.status,
            attempt,
            detail: detail.slice(0, 300),
          });
          return null;
        }

        const json: any = await res.json();
        const choice = json.choices?.[0];
        const message = choice?.message ?? {};

        const toolCalls: LlmToolCall[] = Array.isArray(message.tool_calls)
          ? message.tool_calls
              .filter((c: any) => c?.function?.name)
              .map((c: any) => ({
                id: c.id,
                name: c.function.name,
                argumentsJson: c.function.arguments ?? '{}',
              }))
          : [];

        return {
          content: typeof message.content === 'string' ? message.content : null,
          toolCalls,
          promptTokens: json.usage?.prompt_tokens ?? 0,
          completionTokens: json.usage?.completion_tokens ?? 0,
          latencyMs: Date.now() - startedAt,
          backend: backend.name,
          model: backend.model,
        };
      } catch (err: any) {
        const aborted = err?.name === 'AbortError';

        if (attempt < maxAttempts) {
          log.warn('llm_request_error_retrying', {
            backend: backend.name,
            attempt,
            timedOut: aborted,
            reason: err?.message,
          });
          continue;
        }

        log.error('llm_request_error', {
          backend: backend.name,
          attempt,
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

  /** Readiness detail for the health endpoint and the dashboard. */
  public static describe(): {
    primary: LlmBackendName;
    fallback: LlmBackendName | 'none';
    active: LlmBackendName | null;
    azureConfigured: boolean;
    openaiConfigured: boolean;
  } {
    const chain = this.resolveChain();
    return {
      primary: config.llm.primary,
      fallback: config.llm.fallback,
      active: chain[0]?.name ?? null,
      azureConfigured: isAzureLlmConfigured(),
      openaiConfigured: Boolean(config.openaiApiKey),
    };
  }
}
