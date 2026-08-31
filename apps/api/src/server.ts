import type { Server } from 'node:http';

import { loadConfig } from './config/env.js';
import { loadRootEnvironment } from './config/root-env.js';
import { createRuntime } from './runtime.js';

/**
 * Camada: entrada de processo.
 *
 * Carrega ambiente, compõe runtime, inicia listener HTTP e converte sinais do
 * sistema em desligamento idempotente para não abandonar sockets ou banco aberto.
 */
/** Fecha o listener HTTP como Promise para ordenar o shutdown com o runtime. */
function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

/** Inicializa servidor e registra tratamento único de SIGINT/SIGTERM. */
async function main(): Promise<void> {
  loadRootEnvironment();
  const config = loadConfig(process.env);
  const runtime = createRuntime(config);
  await runtime.start();

  const server = runtime.app.listen(config.PORT, () => {
    console.info(`API listening on port ${config.PORT}`);
  });
  let shutdownPromise: Promise<void> | null = null;
  /** Compartilha a mesma Promise para impedir shutdown concorrente por dois sinais. */
  const shutdown = () => {
    shutdownPromise ??= (async () => {
      await runtime.stop();
      await closeServer(server);
    })();
    return shutdownPromise;
  };
  /** Dispara shutdown e comunica falha por exit code, sem vazar causa no console. */
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
