import type { Server } from 'node:http';

import { loadConfig } from './config/env.js';
import { loadRootEnvironment } from './config/root-env.js';
import { createRuntime } from './runtime.js';

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function main(): Promise<void> {
  loadRootEnvironment();
  const config = loadConfig(process.env);
  const runtime = createRuntime(config);
  await runtime.start();

  const server = runtime.app.listen(config.PORT, () => {
    console.info(`API listening on port ${config.PORT}`);
  });
  let shutdownPromise: Promise<void> | null = null;
  const shutdown = () => {
    shutdownPromise ??= (async () => {
      await runtime.stop();
      await closeServer(server);
    })();
    return shutdownPromise;
  };
  const requestShutdown = () => {
    void shutdown().catch(() => {
      console.error('API shutdown failed');
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', requestShutdown);
  process.once('SIGTERM', requestShutdown);
}

void main().catch(() => {
  console.error('API startup failed');
  process.exitCode = 1;
});
