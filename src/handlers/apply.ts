/**
 * Apply command handler for Owl package manager
 */

import { ui } from "../ui";
import { loadConfigForHost } from "../config";
import { hostname } from "os";
import pc from "picocolors";
import { safeExecute } from "../utils/errors";
import { processPackages } from "./package-processor";
import { processConfigs } from "./config-processor";
import { processSetupScripts } from "./setup-processor";
import { processServices } from "./service-processor";
import { processEnvironmentVariables, processGlobalEnvironmentVariables } from "./env-processor";
import type { CommandOptions } from "../commands";
import type { ConfigEntry, ConfigMapping, PackageAction } from "../types";

/**
 * Apply configuration changes to the system
 * Supports both normal apply and dry-run modes
 */
export async function handleApplyCommand(dryRun: boolean, options: CommandOptions): Promise<void> {
    // Get hostname
    const host = hostname();

    // Load and parse all configuration files for this host
    const configResult = await safeExecute(
      () => loadConfigForHost(host),
      "Failed to load configuration"
    );

    // Extract all components from config
    const configData = extractConfigData(configResult);

    // Show header
    ui.header(dryRun ? "Dry run" : "Sync");

    // Check AUR status once at the beginning
    const aurAvailable = await checkAURStatus();
    if (!aurAvailable) {
      // Show AUR down message once
      ui.aurDownMessage();
      ui.warn("Warning: AUR is currently unavailable. Continuing with system package updates only.");
    }

    // Process packages if any are configured
    if (configData.packages.length > 0) {
      await processPackages(configData.packages, configResult.entries, configData.dotfileConfigs, dryRun, options, aurAvailable);
    }

    // Process other configurations
    await processConfigs(configData.dotfileConfigs, configResult.entries, dryRun);
    await processSetupScripts(configData.setupScripts, dryRun);
    await processServices(configData.services, dryRun);
    await processEnvironmentVariables(configData.environmentVariables, dryRun, options.debug);
    await processGlobalEnvironmentVariables(configResult.globalEnvs, dryRun, options.debug);

     // Show completion message
     if (dryRun) {
       ui.success("Dry run completed successfully - no changes made");
     } else {
       ui.systemMessage("System sync complete");
     }
 }

/**
 * Extract configuration data from config result
 */
function extractConfigData(configResult: any): {
  packages: string[];
  dotfileConfigs: ConfigMapping[];
  setupScripts: string[];
  services: string[];
  environmentVariables: Array<{ key: string; value: string }>;
} {
  const entries = configResult.entries as ConfigEntry[];
  return {
    packages: [...new Set(entries.map(entry => entry.package))],
    dotfileConfigs: entries.flatMap(entry => entry.configs || []),
    setupScripts: entries.flatMap(entry => entry.setups || []),
    services: entries.flatMap(entry => entry.services || []),
    environmentVariables: entries.flatMap(entry => entry.envs || [])
  };
}

/**
 * Check AUR availability
 */
async function checkAURStatus(): Promise<boolean> {
    try {
      const { refreshAURStatusAsync, getAURStatus } = await import("../aur-checker");
      await refreshAURStatusAsync();
      return getAURStatus();
    } catch {
      return false;
    }
}





/**
 * Clean up environment variables for removed packages
 */
export async function cleanupEnvironmentVariablesForRemovedPackages(
  toRemove: PackageAction[],
  configEntries: ConfigEntry[]
): Promise<void> {
  const envsToRemove: Array<{ key: string; value: string }> = [];

  for (const pkg of toRemove) {
    const envs = await getEnvironmentVariablesToRemove(pkg.name, configEntries);
    envsToRemove.push(...envs);
  }

  if (envsToRemove.length > 0) {
    const { icon } = await import("../ui");

    console.log("Cleaning up environment variables for removed packages:");
    for (const env of envsToRemove) {
      console.log(`  ${icon.remove} Removing env var: ${pc.cyan(env.key)}`);
    }

    const { removeEnvironmentVariables } = await import("../environment");
    await removeEnvironmentVariables(envsToRemove);
    console.log();
  }
}

// Import required functions
async function getEnvironmentVariablesToRemove(packageName: string, configEntries: ConfigEntry[]): Promise<Array<{ key: string; value: string }>> {
  const { getEnvironmentVariablesToRemove } = await import("../environment");
  return getEnvironmentVariablesToRemove(packageName, configEntries);
}