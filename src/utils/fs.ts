import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync, lstatSync } from "node:fs";
import { $ } from "bun";

export function getHomeDirectory(): string {
  return process.env.HOME || homedir();
}

export function getOwlDirectory(): string {
  return join(getHomeDirectory(), '.owl');
}

export function getOwlStateDirectory(): string {
  return join(getOwlDirectory(), '.state');
}

export function ensureOwlDirectories(): void {
  const owlDir = getOwlDirectory();
  const stateDir = getOwlStateDirectory();
  
  if (!existsSync(owlDir)) {
    mkdirSync(owlDir, { recursive: true });
  }
  
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
}

function resolvePath(path: string): string {
  const home = getHomeDirectory();
  return path.startsWith("~") ? join(home, path.slice(1)) : resolve(path);
}

async function copyFileOrDirectory(sourcePath: string, destinationPath: string): Promise<void> {
  const parentDir = dirname(destinationPath);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }
  
  if (existsSync(destinationPath)) {
    await $`rm -rf ${destinationPath}`.quiet();
  }
  
  const sourceStats = lstatSync(sourcePath);
  if (sourceStats.isDirectory()) {
    await $`cp -r ${sourcePath} ${destinationPath}`.quiet();
  } else {
    await $`cp ${sourcePath} ${destinationPath}`.quiet();
  }
}