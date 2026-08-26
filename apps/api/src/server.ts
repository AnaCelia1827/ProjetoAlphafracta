import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { loadRootEnvironment } from './config/root-env.js';

loadRootEnvironment();

const config = loadConfig(process.env);
const app = createApp();

app.listen(config.PORT, () => {
  console.info(`API listening on port ${config.PORT}`);
});
