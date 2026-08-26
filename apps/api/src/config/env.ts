import { z } from 'zod';

const mongodbUri = z
  .string()
  .url()
  .refine(
    (value) => {
      const { protocol } = new URL(value);
      return protocol === 'mongodb:' || protocol === 'mongodb+srv:';
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
