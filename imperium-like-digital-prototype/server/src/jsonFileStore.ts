import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function waitSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function writeJsonFileSync(storageFile: string, value: unknown): void {
  mkdirSync(dirname(storageFile), { recursive: true });
  const tempFile = `${storageFile}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tempFile, JSON.stringify(value, null, 2));

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      renameSync(tempFile, storageFile);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (process.platform === "win32" && (code === "EPERM" || code === "EEXIST") && existsSync(storageFile)) {
        try {
          rmSync(storageFile, { force: true });
          renameSync(tempFile, storageFile);
          return;
        } catch {
          // Fall through to the retry delay below.
        }
      }
      if (attempt === 4) {
        rmSync(tempFile, { force: true });
        throw error;
      }
      waitSync(25 * (attempt + 1));
    }
  }
}
