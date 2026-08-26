import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const rootEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url));
const testPort = 43123;

let child: ReturnType<typeof spawn> | undefined;

afterEach(async () => {
  if (child?.exitCode === null) {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
});

describe('API startup environment', () => {
  it('loads PORT from the repository-root .env when started through the root workspace command', async () => {
    const originalEnv = await readFile(rootEnvPath, 'utf8').catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          return undefined;
        }

        throw error;
      },
    );

    await writeFile(rootEnvPath, `PORT=${testPort}\n`);

    const environment = { ...process.env };
    delete environment.PORT;

    const startedChild = spawn('npm', ['run', 'start', '--workspace', '@alphractal/api'], {
      cwd: repositoryRoot,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child = startedChild;

    const stdout = startedChild.stdout;
    const stderr = startedChild.stderr;
    if (stdout === null || stderr === null) {
      throw new Error('API process did not provide output streams');
    }

    let output = '';
    stdout.setEncoding('utf8');
    stderr.setEncoding('utf8');
    stdout.on('data', (chunk: string) => {
      output += chunk;
    });
    stderr.on('data', (chunk: string) => {
      output += chunk;
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`API did not listen on the root .env port. Output:\n${output}`));
        }, 10_000);

        startedChild.on('exit', (code) => {
          clearTimeout(timeout);
          reject(new Error(`API exited with code ${code}. Output:\n${output}`));
        });
        startedChild.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        stdout.on('data', () => {
          if (output.includes(`API listening on port ${testPort}`)) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      expect(output).toContain(`API listening on port ${testPort}`);
    } finally {
      if (originalEnv === undefined) {
        await rm(rootEnvPath, { force: true });
      } else {
        await writeFile(rootEnvPath, originalEnv);
      }
    }
  }, 15_000);
});
