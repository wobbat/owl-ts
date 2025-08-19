import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync, writeFileSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import { $ } from "bun";
import { ensureOwlDirectories } from "./fs";

export interface OwlLock {
  configs: Record<string, string>;
  setups: Record<string, string>;
}

export async function getFileHash(filePath: string): Promise<string> {
  try {
    if (!existsSync(filePath)) return '';
    
    const stats = lstatSync(filePath);
    if (stats.isDirectory()) {
      const result = await $`find ${filePath} -type f -exec sha256sum {} + | sort | sha256sum`.text();
      return result.split(' ')[0] || '';
    } else {
      const content = readFileSync(filePath);
      return createHash('sha256').update(content).digest('hex');
    }
  } catch {
    return '';
  }
}

export function loadOwlLock(): OwlLock {
  const home = process.env.HOME || homedir();
  const lockPath = join(home, '.owl', '.state', 'owl.lock');
  
  try {
    if (existsSync(lockPath)) {
      const content = readFileSync(lockPath, 'utf8');
      return JSON.parse(content);
    }
  } catch {
    // Ignore errors, use empty lock
  }
  
  return { configs: {}, setups: {} };
}

export function saveOwlLock(lock: OwlLock): void {
  ensureOwlDirectories();
  const home = process.env.HOME || homedir();
  const lockPath = join(home, '.owl', '.state', 'owl.lock');
  writeFileSync(lockPath, JSON.stringify(lock, null, 2), 'utf8');
}