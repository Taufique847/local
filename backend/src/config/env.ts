import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file (supports cwd as well as backend root)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/** Chat-completion backends. Both speak the same OpenAI wire format. */
export type LlmBackendName = 'azure' | 'openai';

const parseLlmBackend = (
  val: string | undefined,
  fallback: LlmBackendName
): LlmBackendName => {
  const v = (val || '').trim().toLowerCase();
  if (v === 'azure' || v === 'azure-openai' || v === 'azure_openai') return 'azure';
  if (v === 'openai') return 'openai';
  return fallback;
};

export interface AppConfig {
  port: number;
  nodeEnv: string;
  frontendUrl: string;
  isProduction: boolean;
  isTest: boolean;
  mongoUri: string;
  jwtSecret: string;
  /**
   * Access token lifetime. Short by design: an access token cannot be revoked
   * before it expires except by bumping the user's token version, so the window
   * in which a stolen one is useful should be small. The refresh token keeps the
   * session alive.
   */
  jwtExpiresIn: string;
  /** Refresh token lifetime in days. Controls how long "stay logged in" lasts. */
  refreshTokenDays: number;
  emailProvider: string;
  emailApiKey?: string;
  emailFromAddress?: string;
  /**
   * Provider unit prices used to turn recorded usage into money.
   *
   * Defaults are list prices at the time of writing and WILL drift, so they are
   * configurable. Every figure derived from them is an estimate, and the API
   * labels it as one rather than presenting it as billed spend.
   */
  costs: {
    /** Twilio programmable voice, inbound local, per minute. */
    telephonyPerMinuteUsd: number;
    /** Deepgram streaming speech-to-text, per minute of audio. */
    sttPerMinuteUsd: number;
    /** Deepgram Aura text-to-speech, per 1,000 characters. */
    ttsPer1kCharsUsd: number;
    /** Chat model input tokens, per million. */
    llmInputPer1mUsd: number;
    /** Chat model output tokens, per million. */
    llmOutputPer1mUsd: number;
  };
  /**
   * When true, an unverified account cannot log in.
   *
   * Defaults to false so a deployment without an email provider configured does
   * not lock every user out of the product. Turn it on once email works.
   */
  requireEmailVerification: boolean;
  /**
   * Days to keep call transcripts and SMS bodies before redacting them.
   *
   * 0 disables the sweep. Deliberately the default: switching retention on
   * automatically would start destroying an operator's existing records the
   * first time this build ran.
   */
  dataRetentionDays: number;
  logLevel: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
  twilioWebhookBaseUrl?: string;
  twilioMessagingServiceSid?: string;
  /**
   * Explicit, opt-in escape hatch that skips Twilio/Stripe webhook signature
   * checks for local testing. Previously this was implied by
   * `NODE_ENV === 'development'`, which is the DEFAULT value — meaning
   * signature verification was silently off unless NODE_ENV was set. It now
   * has to be switched on deliberately and can never be on in production.
   */
  allowInsecureWebhooks: boolean;
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  stripePriceIds: {
    starterMonthly?: string;
    starterYearly?: string;
    proMonthly?: string;
    proYearly?: string;
    enterpriseMonthly?: string;
    enterpriseYearly?: string;
  };
  trialDays: number;
  /** 'mock' | 'realtime' — 'realtime' requires Deepgram + an LLM key. */
  voiceProvider: string;
  /**
   * Language-model routing.
   *
   * `primary` is tried first; `fallback` is used when the primary backend is
   * unconfigured, or when a live request to it fails after its retries. A
   * phone caller is waiting during this, so failover is bounded by
   * `totalBudgetMs` rather than allowed to run both backends to exhaustion.
   */
  llm: {
    primary: LlmBackendName;
    /** 'none' disables failover entirely. */
    fallback: LlmBackendName | 'none';
    totalBudgetMs: number;
  };
  openaiApiKey?: string;
  openaiModel: string;
  /**
   * OpenAI-compatible base URL, without the trailing `/chat/completions`.
   * Overridable so the OpenAI backend can be pointed at a gateway or proxy
   * (Azure API Management, LiteLLM) instead of api.openai.com.
   */
  openaiBaseUrl: string;
  azureOpenai: {
    apiKey?: string;
    /** Resource base, e.g. https://my-resource.openai.azure.com (no trailing path). */
    endpoint?: string;
    /**
     * Azure deployment name. In `v1` mode this is sent as the `model` field; in
     * `deployment` mode it becomes part of the URL path.
     */
    deployment?: string;
    /**
     * 'v1'         → POST {endpoint}/openai/v1/chat/completions   (no api-version churn)
     * 'deployment' → POST {endpoint}/openai/deployments/{deployment}/chat/completions?api-version=...
     */
    apiMode: 'v1' | 'deployment';
    /** Only used in 'deployment' mode. */
    apiVersion: string;
  };
  deepgramApiKey?: string;
  deepgramSttModel: string;
  deepgramTtsModel: string;
  /** Hard ceiling on a single AI voice call, protects against runaway spend. */
  maxCallDurationSeconds: number;
  /**
   * Lifetime of the single-use token that authorizes one Twilio media stream.
   * Twilio opens the socket immediately after fetching the TwiML, so this only
   * needs to cover that hop; short is the point.
   */
  voiceStreamTokenTtlSeconds: number;
  enableScheduler: boolean;
  geocoding: {
    provider: string;
    googleMapsApiKey?: string;
  };
}

const parseNumber = (val: string | undefined, fallback: number): number => {
  if (!val) return fallback;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseBool = (val: string | undefined, fallback = false): boolean => {
  if (val === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(val.trim().toLowerCase());
};

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

const DEV_JWT_FALLBACK = 'insecure_local_dev_only_jwt_secret_do_not_use_in_prod';

export const config: AppConfig = {
  port: parseNumber(process.env.PORT, 5000),
  nodeEnv,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  isProduction,
  isTest,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/bluecollar_ai',
  jwtSecret: process.env.JWT_SECRET || DEV_JWT_FALLBACK,
  // Was '7d'. A week-long access token that logout could not revoke meant a
  // leaked cookie stayed usable for a week.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS || 30),
  emailProvider: process.env.EMAIL_PROVIDER || 'resend',
  emailApiKey: process.env.EMAIL_API_KEY,
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS,
  costs: {
    telephonyPerMinuteUsd: parseNumber(process.env.COST_TELEPHONY_PER_MINUTE_USD, 0.0085),
    sttPerMinuteUsd: parseNumber(process.env.COST_STT_PER_MINUTE_USD, 0.0059),
    ttsPer1kCharsUsd: parseNumber(process.env.COST_TTS_PER_1K_CHARS_USD, 0.015),
    llmInputPer1mUsd: parseNumber(process.env.COST_LLM_INPUT_PER_1M_USD, 0.15),
    llmOutputPer1mUsd: parseNumber(process.env.COST_LLM_OUTPUT_PER_1M_USD, 0.6),
  },
  requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
  dataRetentionDays: parseNumber(process.env.DATA_RETENTION_DAYS, 0),
  logLevel: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
  twilioWebhookBaseUrl: process.env.TWILIO_WEBHOOK_BASE_URL || 'http://localhost:5000',
  twilioMessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
  allowInsecureWebhooks: !isProduction && parseBool(process.env.ALLOW_INSECURE_WEBHOOKS, false),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  stripePriceIds: {
    starterMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    starterYearly: process.env.STRIPE_PRICE_STARTER_YEARLY,
    proMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
    proYearly: process.env.STRIPE_PRICE_PRO_YEARLY,
    enterpriseMonthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
    enterpriseYearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY,
  },
  trialDays: parseNumber(process.env.TRIAL_DAYS, 14),
  voiceProvider: process.env.VOICE_PROVIDER || 'mock',
  llm: {
    // Azure first by default: operators who supply Azure credentials almost
    // always do so for data-residency or procurement reasons, and silently
    // preferring public OpenAI would defeat that.
    primary: parseLlmBackend(process.env.LLM_PRIMARY, 'azure'),
    fallback:
      (process.env.LLM_FALLBACK || '').trim().toLowerCase() === 'none'
        ? 'none'
        : parseLlmBackend(process.env.LLM_FALLBACK, 'openai'),
    totalBudgetMs: parseNumber(process.env.LLM_TOTAL_BUDGET_MS, 12000),
  },
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  openaiBaseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/i, ''),
  azureOpenai: {
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    // Trailing slashes and an accidentally pasted `/openai/v1` suffix are the two
    // most common copy-paste mistakes from the Azure portal, so both are trimmed.
    endpoint: (process.env.AZURE_OPENAI_ENDPOINT || '')
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/openai(\/v1)?$/i, '')
      || undefined,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT?.trim() || undefined,
    apiMode: process.env.AZURE_OPENAI_API_MODE?.trim().toLowerCase() === 'deployment'
      ? 'deployment'
      : 'v1',
    apiVersion: process.env.AZURE_OPENAI_API_VERSION?.trim() || '2024-10-21',
  },
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  deepgramSttModel: process.env.DEEPGRAM_STT_MODEL || 'nova-2-phonecall',
  deepgramTtsModel: process.env.DEEPGRAM_TTS_MODEL || 'aura-asteria-en',
  maxCallDurationSeconds: parseNumber(process.env.MAX_CALL_DURATION_SECONDS, 600),
  voiceStreamTokenTtlSeconds: parseNumber(process.env.VOICE_STREAM_TOKEN_TTL_SECONDS, 120),
  enableScheduler: parseBool(process.env.ENABLE_SCHEDULER, true),
  geocoding: {
    provider: (process.env.GEOCODING_PROVIDER || 'nominatim').trim().toLowerCase(),
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || process.env.MAPS_API_KEY,
  },
};

/**
 * Azure needs three values, not one. A key without an endpoint or a deployment
 * name cannot produce a request URL, so "has a key" is not a usable readiness
 * signal the way it is for public OpenAI.
 */
export const isAzureLlmConfigured = (): boolean =>
  Boolean(config.azureOpenai.apiKey && config.azureOpenai.endpoint && config.azureOpenai.deployment);

export interface ConfigIssue {
  level: 'fatal' | 'warn';
  message: string;
}

/**
 * Validates configuration at startup.
 *
 * Fatal issues abort the process in production rather than booting a
 * misconfigured, insecure server — the previous behaviour silently signed JWTs
 * with a secret that is committed to this repository if JWT_SECRET was unset.
 */
export const validateConfig = (): ConfigIssue[] => {
  const issues: ConfigIssue[] = [];
  const fatal = (message: string) => issues.push({ level: 'fatal', message });
  const warn = (message: string) => issues.push({ level: 'warn', message });

  if (config.jwtSecret === DEV_JWT_FALLBACK) {
    if (isProduction) {
      fatal('JWT_SECRET is not set. Refusing to start in production with the public dev fallback secret.');
    } else if (!isTest) {
      warn('JWT_SECRET is not set; using an insecure local-development fallback.');
    }
  } else if (config.jwtSecret.length < 32 && isProduction) {
    fatal('JWT_SECRET must be at least 32 characters in production.');
  }

  if (isProduction) {
    if (!process.env.MONGODB_URI) {
      fatal('MONGODB_URI is not set. Refusing to start in production against a localhost database.');
    }
    if (!process.env.FRONTEND_URL) {
      fatal('FRONTEND_URL is not set. CORS and customer-portal links would point at localhost.');
    }
    if (config.stripeSecretKey && !config.stripeWebhookSecret) {
      fatal('STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set, otherwise billing webhooks cannot be verified.');
    }
    if (config.twilioAccountSid && !config.twilioAuthToken) {
      fatal('TWILIO_AUTH_TOKEN is required when TWILIO_ACCOUNT_SID is set, otherwise Twilio webhooks cannot be verified.');
    }
    if (!process.env.TWILIO_WEBHOOK_BASE_URL && config.twilioAccountSid) {
      fatal('TWILIO_WEBHOOK_BASE_URL must be your public HTTPS base URL, otherwise Twilio signature validation will reject real traffic.');
    }
  }

  // Requiring verification without a way to send the email locks everyone out.
  if (config.requireEmailVerification && !config.emailApiKey) {
    fatal(
      'REQUIRE_EMAIL_VERIFICATION is on but EMAIL_API_KEY is not set, so no user could ever verify and log in.'
    );
  } else if (!config.emailApiKey) {
    warn(
      'EMAIL_API_KEY is not set; verification and password-reset emails cannot be sent.'
    );
  }

  // --- Language model routing -------------------------------------------------
  // Reported regardless of VOICE_PROVIDER, because a half-configured Azure
  // backend silently demotes every call to the fallback (or to scripted
  // replies) and that is invisible without an explicit startup message.
  const azureConfigured = isAzureLlmConfigured();
  const openaiConfigured = Boolean(config.openaiApiKey);

  if (config.azureOpenai.apiKey || config.azureOpenai.endpoint || config.azureOpenai.deployment) {
    if (!config.azureOpenai.apiKey) {
      warn('Azure OpenAI is partially configured: AZURE_OPENAI_API_KEY is missing, so the Azure backend is unusable.');
    }
    if (!config.azureOpenai.endpoint) {
      warn('Azure OpenAI is partially configured: AZURE_OPENAI_ENDPOINT is missing, so the Azure backend is unusable.');
    } else if (!/^https:\/\//i.test(config.azureOpenai.endpoint)) {
      warn(`AZURE_OPENAI_ENDPOINT should be an https:// URL (got "${config.azureOpenai.endpoint}").`);
    }
    if (!config.azureOpenai.deployment) {
      warn('Azure OpenAI is partially configured: AZURE_OPENAI_DEPLOYMENT is missing, so the Azure backend is unusable.');
    }
  }

  const backendReady = (name: LlmBackendName) =>
    name === 'azure' ? azureConfigured : openaiConfigured;

  if (config.llm.fallback !== 'none' && config.llm.fallback === config.llm.primary) {
    warn(
      `LLM_FALLBACK equals LLM_PRIMARY ("${config.llm.primary}"), so there is no fallback. Set LLM_FALLBACK to the other provider or to "none".`
    );
  }

  if (config.voiceProvider === 'realtime') {
    if (!config.deepgramApiKey) {
      warn('VOICE_PROVIDER=realtime but DEEPGRAM_API_KEY is missing; speech recognition and synthesis will be unavailable.');
    }

    if (!azureConfigured && !openaiConfigured) {
      warn(
        'VOICE_PROVIDER=realtime but no language-model backend is configured (need Azure OpenAI credentials or OPENAI_API_KEY); the AI receptionist cannot reason and will fall back to scripted replies.'
      );
    } else if (!backendReady(config.llm.primary)) {
      const other: LlmBackendName = config.llm.primary === 'azure' ? 'openai' : 'azure';
      warn(
        `LLM_PRIMARY=${config.llm.primary} is not fully configured; every call will be served by "${other}" instead.`
      );
    }
  }

  if (config.allowInsecureWebhooks) {
    warn('ALLOW_INSECURE_WEBHOOKS is enabled — webhook signature verification is DISABLED. Never use this outside local development.');
  }

  if (!config.stripeSecretKey && !isTest) {
    warn('STRIPE_SECRET_KEY is not set; billing runs in simulation mode and no real payments can be taken.');
  }

  return issues;
};
