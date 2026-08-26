import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { loadRootEnvironment, rootEnvPath } from '../../src/config/root-env.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('root environment loading', () => {
  it('loads a caller-provided env file into only the caller-provided environment', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'alphractal-root-env-'));
    temporaryDirectories.push(directory);
    const envFilePath = join(directory, '.env');
    await writeFile(envFilePath, 'PORT=43123\nMONGODB_URI=mongodb://localhost:27017/test\n');

    const targetEnvironment: NodeJS.ProcessEnv = { EXISTING_VALUE: 'preserved' };
    const processPort = process.env.PORT;
    const processMongoUri = process.env.MONGODB_URI;

    loadRootEnvironment({ envFilePath, environment: targetEnvironment });

    expect(targetEnvironment).toMatchObject({
      EXISTING_VALUE: 'preserved',
      PORT: '43123',
      MONGODB_URI: 'mongodb://localhost:27017/test',
    });
    expect(process.env.PORT).toBe(processPort);
    expect(process.env.MONGODB_URI).toBe(processMongoUri);
  });

  it('resolves the production env file at the repository root', () => {
    expect(rootEnvPath).toBe(fileURLToPath(new URL('../../../../.env', import.meta.url)));
  });
});
