import { config as loadEnvironment } from 'dotenv';
import { fileURLToPath } from 'node:url';

import { createApp } from './app.js';
import { loadConfig } from './config/env.js';

const rootEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url));

loadEnvironment({ path: rootEnvPath });

const config = loadConfig(process.env);
const app = createApp();

app.listen(config.PORT, () => {
  console.info(`API listening on port ${config.PORT}`);
});
