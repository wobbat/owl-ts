import { writeFileSync, renameSync, existsSync, mkdirSync, openSync, closeSync, unlinkSync } from "fs";
import { dirname, join } from "path";

export function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

export function atomicWriteFile(filePath: string, data: string | Buffer): void {
  const dir = dirname(filePath);
  ensureDir(dir);
  const tmp = join(dir, `.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  writeFileSync(tmp, data);
  renameSync(tmp, filePath);
}

export async function withFileLock<T>(dir: string, name: string, fn: () => Promise<T>, timeoutMs = 5000): Promise<T> {
  ensureDir(dir);
  const lockPath = join(dir, `${name}.lock`);
  const start = Date.now();
  let fd: number | null = null;
  try {
    while (true) {
      try {
        fd = openSync(lockPath, "wx");
        break;
      } catch {
        if (Date.now() - start > timeoutMs) {
          throw new Error(`Timeout acquiring lock: ${lockPath}`);
        }
        await new Promise(r => setTimeout(r, 100));
      }
    }
    return await fn();
  } finally {
    try {
      if (fd !== null) closeSync(fd);
      if (existsSync(lockPath)) unlinkSync(lockPath);
    } catch {
      // best effort
    }
  }
}

