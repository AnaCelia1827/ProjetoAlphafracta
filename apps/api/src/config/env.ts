import { ConnectionString } from 'mongodb-connection-string-url';
import { z } from 'zod';

const mongodbUri = z.string().refine(
  (value) => {
    try {
      new ConnectionString(value);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'MONGODB_URI must use the mongodb:// or mongodb+srv:// scheme' },
);

function urlWithProtocol(protocol: 'https:' | 'wss:') {
  return z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === protocol, {
      message: `URL must use ${protocol.slice(0, -1)}`,
    });
}

const corsOrigins = z
  .string()
  .min(1)
  .transform((value) => value.split(',').map((origin) => origin.trim()))
  .refine((origins) => origins.length > 0 && origins.every((origin) => origin.length > 0), {
    message: 'CORS_ORIGINS must contain one or more comma-separated origins',
  })
  .refine(
    (origins) =>
      origins.every((origin) => {
        if (origin === '*') return false;
        try {
          const url = new URL(origin);
          return (
            (url.protocol === 'https:' || url.protocol === 'http:') &&
            url.origin === origin &&
            url.username === '' &&
            url.password === ''
          );
        } catch {
          return false;
        }
      }),
    { message: 'CORS_ORIGINS entries must be explicit HTTP(S) origins without wildcard' },
  );

const positiveMilliseconds = z.coerce.number().int().positive();

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  ALCHEMY_HTTP_URL: urlWithProtocol('https:'),
  ALCHEMY_WS_URL: urlWithProtocol('wss:'),
  COINBASE_WS_URL: urlWithProtocol('wss:').default('wss://ws-feed.exchange.coinbase.com'),
  MONGODB_URI: mongodbUri.optional(),
  CORS_ORIGINS: corsOrigins,
  FEE_INTERVAL_MS: positiveMilliseconds.default(5_000),
  SSE_HEARTBEAT_MS: positiveMilliseconds.default(15_000),
  PROVIDER_REQUEST_TIMEOUT_MS: positiveMilliseconds.default(10_000),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return schema.parse(env);
}
