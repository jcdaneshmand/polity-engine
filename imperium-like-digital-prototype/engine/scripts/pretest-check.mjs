#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const engineDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(engineDir, '..');
const workspaceNodeModules = path.join(workspaceRoot, 'node_modules');
const requireFromEngine = createRequire(path.join(engineDir, 'package.json'));

function printInstallGuidance() {
  console.error('Unable to find `vitest` for @polity-engine/engine tests.');
  console.error('Run `npm install` from `/workspace/polity-engine/imperium-like-digital-prototype`.');
  console.error('Reminder: root-level `/workspace/polity-engine` is not the canonical command root for workspace scripts.');
}

let vitestCli;
try {
  const vitestPackageJsonPath = requireFromEngine.resolve('vitest/package.json');
  const resolvedPackagePath = realpathSync(vitestPackageJsonPath);
  const resolvedNodeModules = realpathSync(workspaceNodeModules);
  const normalizedRoot = resolvedNodeModules.endsWith(path.sep)
    ? resolvedNodeModules
    : `${resolvedNodeModules}${path.sep}`;

  if (!resolvedPackagePath.startsWith(normalizedRoot)) {
    throw new Error('`vitest` resolved outside workspace node_modules.');
  }

  const vitestPackageJson = JSON.parse(readFileSync(resolvedPackagePath, 'utf8'));
  const binEntry = typeof vitestPackageJson.bin === 'string'
    ? vitestPackageJson.bin
    : vitestPackageJson.bin?.vitest;

  if (!binEntry) {
    throw new Error('`vitest` package did not expose a CLI bin entry.');
  }

  vitestCli = path.resolve(path.dirname(resolvedPackagePath), binEntry);
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
