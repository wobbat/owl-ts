import { join } from "path";
import { ensureOwlDirectories, OWL_STATE_DIR } from "./fs";
import { atomicWriteFile, withFileLock } from "./atomic";

// Using standard Web Crypto API


export interface OwlLock {
  configs: Record<string, string>;
  setups: Record<string, string>;
}

async function hashArrayBuffer(buf: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer = buf instanceof Uint8Array ? buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) : buf;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer as ArrayBuffer);
  const arr = Array.from(new Uint8Array(hashBuffer));
  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getFileHash(filePath: string): Promise<string> {
  try {
    // Use standard fs for now - Bun compatibility can be added later
    const { existsSync, lstatSync, readdirSync, readFileSync } = await import('fs');
    if (!existsSync(filePath)) return '';
    const stats = lstatSync(filePath);
    if (stats.isDirectory()) {
      const files = readdirSync(filePath, { withFileTypes: true });
      const fileHashes: string[] = [];
      for (const f of files) {
        if (f.isFile()) {
          const content = readFileSync(join(filePath, f.name));
          const h = await hashArrayBuffer(content);
          fileHashes.push(`${f.name}:${h}`);
        }
      }
      fileHashes.sort();
      return await hashArrayBuffer(new TextEncoder().encode(fileHashes.join('\n')));
    }

    const content = readFileSync(filePath);
    return await hashArrayBuffer(content);
  } catch {
    return '';
  }
}

export async function loadOwlLock(): Promise<OwlLock> {
  const lockPath = join(OWL_STATE_DIR, 'owl.lock');

  try {
    const { existsSync, readFileSync } = await import('fs');
    if (existsSync(lockPath)) {
      const content = readFileSync(lockPath, 'utf8');
      return JSON.parse(content) as OwlLock;
    }
  } catch {
    // ignore
  }

  return { configs: {}, setups: {} };
}

export async function saveOwlLock(lock: OwlLock): Promise<void> {
  ensureOwlDirectories();
  const lockPath = join(OWL_STATE_DIR, 'owl.lock');
  const data = JSON.stringify(lock, null, 2);
  await withFileLock(OWL_STATE_DIR, 'owl', async () => {
    atomicWriteFile(lockPath, data);
  });
}
