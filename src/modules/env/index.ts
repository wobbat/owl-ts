/**
 * Environment variable management functions for Owl package manager
 */

import { existsSync, writeFileSync, mkdirSync } from "fs";
import { safeExecute } from "../../utils/errors";
import { homedir } from "os";
import { resolve } from "path";

export interface EnvironmentVariable {
  key: string;
  value: string;
}

const ENV_FILE_SH = resolve(homedir(), ".owl", "env.sh");
const ENV_FILE_FISH = resolve(homedir(), ".owl", "env.fish");



/**
 * Write environment variables to the Owl environment file (bash)
 */
function writeEnvironmentFileBash(envMap: Map<string, string>, debug: boolean = false): void {
  let content = "#!/bin/bash\n";
  content += "# This file is managed by Owl package manager\n";
  content += "# Manual changes may be overwritten\n";

  if (envMap.size > 0) {
    content += "\n";
    for (const [key, value] of envMap) {
      // Escape single quotes in the value and wrap in single quotes
      // This is safer than double quotes for shell scripts
      const escapedValue = value.replace(/'/g, "'\\''");
      content += `export ${key}='${escapedValue}'\n`;
    }
  }

  if (debug) {
    console.log(`  Writing to ${ENV_FILE_SH}:`);
    console.log(content);
    console.log(`  --- End of content ---`);
  }

  atomicWriteFile(ENV_FILE_SH, content);
}

/**
 * Write environment variables to the Owl environment file (fish)
 */
function writeEnvironmentFileFish(envMap: Map<string, string>, debug: boolean = false): void {
  let content = "# This file is managed by Owl package manager\n";
  content += "# Manual changes may be overwritten";

  if (envMap.size > 0) {
    content += "\n\n";
    for (const [key, value] of envMap) {
      // For Fish shell, use set -x (export) command
      // Escape single quotes in the value
      const escapedValue = value.replace(/'/g, "\\'");
      content += `set -x ${key} '${escapedValue}'\n`;
    }
  }

  if (debug) {
    console.log(`  Writing to ${ENV_FILE_FISH}:`);
    console.log(content);
    console.log(`  --- End of content ---`);
  }

  atomicWriteFile(ENV_FILE_FISH, content);
}

/**
 * Set environment variables for packages
 */
export async function setEnvironmentVariables(envs: EnvironmentVariable[], debug: boolean = false): Promise<void> {
  // Always rebuild from scratch - no reading of existing files
  const envMap = new Map<string, string>();

  // Add all current environment variables
  for (const env of envs) {
    envMap.set(env.key, env.value);
    if (debug) {
      console.log(`  Setting environment variable: ${env.key}=${env.value}`);
    }
  }

  // Write clean file (even if empty)
  await safeExecute(
    async () => withFileLock(resolve(homedir(), ".owl"), 'env', async () => writeEnvironmentFileBash(envMap, debug)),
    `Failed to write environment variables to ${ENV_FILE_SH}`
  );
}

/**
 * Remove environment variables that are no longer needed
 */
export async function removeEnvironmentVariables(envs: EnvironmentVariable[]): Promise<void> {
  if (!envs || envs.length === 0) return;

  // Since we rebuild from scratch, removal is handled by not including removed vars
  // This function is kept for compatibility but doesn't need to do anything
  // The actual removal happens when setEnvironmentVariables rebuilds the file
  for (const env of envs) {
    console.log(`  Removing environment variable: ${env.key}`);
  }
}

/**
 * Manage environment variables for a package configuration
 */
export async function manageEnvironmentVariables(envs: EnvironmentVariable[]): Promise<void> {
  if (!envs || envs.length === 0) return;

  await setEnvironmentVariables(envs);
}

/**
 * Get all environment variables that should be removed when a package is uninstalled
 */
export function getEnvironmentVariablesToRemove(packageName: string, allConfigEntries: Array<{ package: string; envs?: EnvironmentVariable[] }>): EnvironmentVariable[] {
  // Find the config entry for this package
  const configEntry = allConfigEntries.find(entry => entry.package === packageName);
  return configEntry?.envs || [];
}

// Global environment variable state management
const GLOBAL_ENV_STATE_FILE = resolve(homedir(), ".owl", ".state", "global-env.lock");

interface GlobalEnvState {
  schema_version: string;
  global_env_vars: string[]; // Only store keys, not values for security
}

/**
 * Save global environment variable state
 */
function saveGlobalEnvState(state: GlobalEnvState): void {
  try {
    const stateDir = resolve(homedir(), ".owl", ".state");
    if (!existsSync(stateDir)) {
      mkdirSync(stateDir, { recursive: true });
    }
    writeFileSync(GLOBAL_ENV_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error(`Error: Could not save global env state:`, error);
  }
}



/**
 * Manage global environment variables
 */
export async function manageGlobalEnvironmentVariables(globalEnvs: EnvironmentVariable[], debug: boolean = false): Promise<void> {
  if (debug) {
    console.log(`  Managing ${globalEnvs.length} global environment variables`);
  }

  // Always rebuild from scratch - no reading of existing files
  const envMap = new Map<string, string>();

  // Add all current global environment variables
  for (const env of globalEnvs) {
    envMap.set(env.key, env.value);
    if (debug) {
      console.log(`  Setting global environment variable: ${env.key}=${env.value}`);
    }
  }

  if (debug) {
    console.log(`  Writing environment files with ${envMap.size} variables`);
  }

  // Write clean files (both bash and fish, even if empty)
  await safeExecute(
    async () => withFileLock(resolve(homedir(), ".owl"), 'env', async () => {
      writeEnvironmentFileBash(envMap, debug);
      writeEnvironmentFileFish(envMap, debug);
      if (debug) {
        console.log(`  Successfully wrote environment files`);
      }
    }),
    `Failed to write global environment variables`
  );

  // Update state
  const newState: GlobalEnvState = {
    schema_version: "1.0",
    global_env_vars: Array.from(envMap.keys())
  };
  saveGlobalEnvState(newState);
}
import { atomicWriteFile, withFileLock } from "../../utils/atomic";
