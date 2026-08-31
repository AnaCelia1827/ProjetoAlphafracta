import { config as loadEnvironment } from 'dotenv';
import { fileURLToPath } from 'node:url';

/**
 * Camada: configuração.
 *
 * Localiza o arquivo .env na raiz do monorepo e injeta seus valores no ambiente
 * escolhido. O caminho é calculado por URL de módulo para funcionar fora do cwd.
 */
/** Caminho absoluto padrão do .env de desenvolvimento, sem conter seu conteúdo. */
export const rootEnvPath = fileURLToPath(new URL('../../../../.env', import.meta.url));

/** Opções que permitem testar carregamento sem alterar o ambiente real do processo. */
interface RootEnvironmentOptions {
  envFilePath?: string;
  environment?: NodeJS.ProcessEnv;
}

/** Carrega arquivo de ambiente silenciosamente, preservando injeção controlada nos testes. */
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
