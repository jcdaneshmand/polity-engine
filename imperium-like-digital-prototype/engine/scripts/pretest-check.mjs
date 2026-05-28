#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const engineDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const requireFromEngine = createRequire(path.join(engineDir, 'package.json'));

function printInstallGuidance() {
  console.error('Unable to find `vitest` for @prototype/engine tests.');
  console.error('Run `npm install` from `/workspace/polity-engine/imperium-like-digital-prototype`.');
  console.error('Reminder: root-level `/workspace/polity-engine` is not the canonical command root for workspace scripts.');
}

let vitestCli;
try {
  const vitestPackageJsonPath = requireFromEngine.resolve('vitest/package.json');
  const vitestPackageJson = JSON.parse(readFileSync(vitestPackageJsonPath, 'utf8'));
  const binEntry = typeof vitestPackageJson.bin === 'string'
    ? vitestPackageJson.bin
    : vitestPackageJson.bin?.vitest;

  if (!binEntry) {
    throw new Error('`vitest` package did not expose a CLI bin entry.');
  }

  vitestCli = path.resolve(path.dirname(vitestPackageJsonPath), binEntry);
} catch {
  printInstallGuidance();
  process.exit(1);
}

const child = spawn(process.execPath, [vitestCli, 'run', '--config', 'vitest.config.ts'], {
  cwd: engineDir,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
