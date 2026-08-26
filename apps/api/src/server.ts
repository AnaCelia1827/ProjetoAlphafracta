import 'dotenv/config';

import { createApp } from './app.js';
import { loadConfig } from './config/env.js';

const config = loadConfig(process.env);
const app = createApp();

app.listen(config.PORT, () => {
  console.info(`API listening on port ${config.PORT}`);
});
