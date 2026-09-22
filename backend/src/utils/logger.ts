import { config } from '../config/env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const threshold = LEVEL_WEIGHT[(config.logLevel as LogLevel)] ?? LEVEL_WEIGHT.info;

/**
 * Keys whose values must never reach the logs. Matched case-insensitively as a
 * substring so `stripeSecretKey`, `authorization`, `x-twilio-signature` etc.
 * are all covered.
 */
const REDACTED_KEYS = [
  'password',
  'passwordhash',
  'token',
  'secret',
  'authorization',
  'cookie',
  'signature',
  'apikey',
  'api_key',
  'signaturedataurl',
  'creditcard',
  'cardnumber',
  'cvv',
];

const shouldRedact = (key: string): boolean => {
  const lower = key.toLowerCase();
  return REDACTED_KEYS.some((needle) => lower.includes(needle));
};

const redact = (value: unknown, depth = 0): unknown => {
  if (depth > 4) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: config.isProduction ? undefined : value.stack,
    };
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = shouldRedact(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 2000) {
    return `${value.slice(0, 2000)}…[truncated]`;
  }
  return value;
};

const emit = (level: LogLevel, message: string, context?: Record<string, unknown>) => {
  if (LEVEL_WEIGHT[level] < threshold) return;

  const entry = {
    level,
    time: new Date().toISOString(),
    msg: message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  };

  // Structured single-line JSON so log aggregators (CloudWatch, Datadog, Loki)
  // can parse fields without a custom grok pattern.
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
};

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

const build = (bindings: Record<string, unknown>): Logger => ({
  debug: (message, context) => emit('debug', message, { ...bindings, ...context }),
  info: (message, context) => emit('info', message, { ...bindings, ...context }),
  warn: (message, context) => emit('warn', message, { ...bindings, ...context }),
  error: (message, context) => emit('error', message, { ...bindings, ...context }),
  child: (extra) => build({ ...bindings, ...extra }),
});

export const logger = build({});
