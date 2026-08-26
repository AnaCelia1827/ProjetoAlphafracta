import { config as loadEnvironment } from 'dotenv';
import { fileURLToPath } from 'node:url';

export const rootEnvPath = fileURLToPath(new URL('../../../../.env', import.meta.url));

interface RootEnvironmentOptions {
  envFilePath?: string;
  environment?: NodeJS.ProcessEnv;
}

export function loadRootEnvironment({
  envFilePath = rootEnvPath,
  environment = process.env,
}: RootEnvironmentOptions = {}): void {
  loadEnvironment({
    path: envFilePath,
    processEnv: environment as Record<string, string>,
    quiet: true,
  });
}
