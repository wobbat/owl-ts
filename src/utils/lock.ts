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
    const { existsSync, lstatSync, readdirSync, readFileSync } = await import('fs');
    if (!existsSync(filePath)) return '';
    const stats = lstatSync(filePath);

    // File: hash content directly
    if (!stats.isDirectory()) {
      const content = readFileSync(filePath);
      return await hashArrayBuffer(content);
    }

    // Directory: recursively hash contents deterministically by relative path
    const entries: string[] = [];
    const stack: Array<{ abs: string; rel: string }> = [{ abs: filePath, rel: '' }];
    while (stack.length) {
      const { abs, rel } = stack.pop()!;
      const list = readdirSync(abs, { withFileTypes: true });
      for (const ent of list) {
        const absChild = join(abs, ent.name);
        const relChild = rel ? `${rel}/${ent.name}` : ent.name;
        if (ent.isDirectory()) {
          stack.push({ abs: absChild, rel: relChild });
        } else if (ent.isFile()) {
          const content = readFileSync(absChild);
          const h = await hashArrayBuffer(content);
          entries.push(`${relChild}:${h}`);
        }
        // Ignore other types (symlinks/sockets/etc.) for hashing purposes
      }
    }
    entries.sort();
    return await hashArrayBuffer(new TextEncoder().encode(entries.join('\n')));
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
  // Use a distinct advisory lock file name to avoid clobbering the data file
  await withFileLock(OWL_STATE_DIR, 'owl-state', async () => {
    atomicWriteFile(lockPath, data);
  });
}
