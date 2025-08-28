import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync } from "fs";

export function getHomeDirectory(): string {
  return process.env.HOME || homedir();
}

export const OWL_DIR = join(getHomeDirectory(), '.owl');
export const OWL_STATE_DIR = join(OWL_DIR, '.state');

export function getOwlDirectory(): string {
  return OWL_DIR;
}

export function getOwlStateDirectory(): string {
  return OWL_STATE_DIR;
}

export function getOwlDirectories(): {
  root: string;
  state: string;
  dotfiles: string;
  hosts: string;
  groups: string;
} {
  return {
    root: OWL_DIR,
    state: OWL_STATE_DIR,
    dotfiles: join(OWL_DIR, 'dotfiles'),
    hosts: join(OWL_DIR, 'hosts'),
    groups: join(OWL_DIR, 'groups')
  };
}

export function getOwlDotfilesDir(): string {
  return join(OWL_DIR, 'dotfiles');
}

export function ensureOwlDirectories(): void {
  const dirs = getOwlDirectories();
  const allDirs = [dirs.root, dirs.state, dirs.dotfiles, dirs.hosts, dirs.groups];

  for (const dir of allDirs) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

/**
 * Compact filters out null/undefined/empty-string/false values from an array
 */
export function compact<T>(array: Array<T | null | undefined | false | "" | 0>): T[] {
  return array.filter((v): v is T => Boolean(v) && v !== "") as T[];
}

