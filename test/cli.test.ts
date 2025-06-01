import { beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import peggy from 'peggy';

function exec(cmd: string[]): { stdout?: string; stderr: string } {
  const p = spawnSync(cmd[0], cmd.slice(1), {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const stderr = p.stderr?.toString() || '';
  if (p.error) return { stderr: p.error.message + '\n' + stderr };
  if (p.status !== 0) return { stderr: `${cmd[0]} exits with the code ${p.status}\n` + stderr };
  return { stderr: '' };
}

// Local imports
import packageJson from '../package.json';

const ROOT_DIR = fileURLToPath(new URL('../', import.meta.url));
const PLUGIN_PATH = path.join(ROOT_DIR, packageJson.exports.require);
const CLI_PATH = path.join(ROOT_DIR, packageJson.bin.tspegjs);
const OPTIONS_FILE = path.join(ROOT_DIR, 'test/genoptions2.json');
const GRAMMAR_FILE = path.join(ROOT_DIR, 'examples/st.pegjs');
const outTsName = path.join(ROOT_DIR, 'output/st2.ts');

describe('CLI Tests', () => {
  beforeEach(ensureCliIsBuilt);
  it(`Can import tspegjs as a Peggy plugin`, async () => {
    const { stdout, stderr } = exec([
      `npx`,
      `peggy`,
      `--plugin`,
      PLUGIN_PATH,
      `--extra-options-file`,
      OPTIONS_FILE,
      '--allowed-start-rules',
      'groupFile,templateFile,templateFileRaw,templateAndEOF',
      '-o',
      outTsName,
      GRAMMAR_FILE
    ]);
    if (stderr) {
      throw new Error(stderr);
    }
  });
  it.concurrent(`Generated \`ts\` file passes eslint check`, async () => {
    const { stdout, stderr } = exec([`eslint`, outTsName]);

    if (stderr) {
      throw new Error(stderr);
    }
  });
  it.concurrent(`Can compile \`ts\` file to \`js\``, async () => {
    const { stdout, stderr } = exec([
      `tsc`,
      `--target`,
      `es6`,
      `--module`,
      `commonjs`,
      `--declaration`,
      outTsName
    ]);

    if (stderr) {
      throw new Error(stderr);
    }
  });
  it(`Can specify dependency list`, async () => {
    const GRAMMAR_FILE = path.join(ROOT_DIR, 'examples/minimal-with-dep.pegjs');
    const outTsName = path.join(ROOT_DIR, 'output/minimal-with-dep.ts');
    const barSource = path.join(ROOT_DIR, 'examples/bar.ts');
    const barDest = path.join(ROOT_DIR, 'output/bar.ts');
    // Copy the dependency to the output directory
    exec(['cp', barSource, barDest]);
    {
      // Create the parser
      const { stdout, stderr } = exec([
        `npx`,
        `peggy`,
        `--plugin`,
        PLUGIN_PATH,
        `--dependency`,
        `foo:./bar`,
        `-o`,
        outTsName,
        GRAMMAR_FILE
      ]);
      if (stderr) {
        throw new Error(stderr);
      }
    }
    {
      // Compile the parser
      const { stdout, stderr } = exec([
        `tsc`,
        `--target`,
        `es6`,
        `--module`,
        `commonjs`,
        `--declaration`,
        outTsName
      ]);
      if (stderr) {
        throw new Error(stderr);
      }
    }
    {
      // Run the parser
      const parserPath = path.join(ROOT_DIR, 'output/minimal-with-dep.js');
      const parser = await import(parserPath);
      expect(parser.parse('a')).toEqual('I AM THE CONST FOO');
    }
  });
});

/**
 * Checks if CLI has been built and errors if it has not.
 */
function ensureCliIsBuilt() {
  if (!existsSync(CLI_PATH)) {
    throw new Error(
      `File "${CLI_PATH}" doesn't exist. You must run \`npm run build\` before executing this test.`
    );
  }
}
