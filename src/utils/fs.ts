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

export function ensureOwlDirectories(): void {
  if (!existsSync(OWL_DIR)) mkdirSync(OWL_DIR, { recursive: true });
  if (!existsSync(OWL_STATE_DIR)) mkdirSync(OWL_STATE_DIR, { recursive: true });
}

/**
 * Compact filters out null/undefined/empty-string/false values from an array
 */
export function compact<T>(array: Array<T | null | undefined | false | "" | 0>): T[] {
  return array.filter((v): v is T => Boolean(v) && v !== "") as T[];
}

