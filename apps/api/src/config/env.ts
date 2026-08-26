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

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  MONGODB_URI: mongodbUri.optional(),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return schema.parse(env);
}
