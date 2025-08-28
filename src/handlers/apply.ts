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
   // Load and parse all configuration files for this host
   const configResult = await safeExecute(
     () => loadConfigForHost(hostname()),
     "Failed to load configuration"
   );

   const configEntries = configResult.entries;
   const globalEnvs = configResult.globalEnvs;

   // Extract all packages, dotfile configs, setup scripts, services, and environment variables
   const allPackages = configEntries.map(entry => entry.package);
   const allDotfileConfigs = configEntries.flatMap(entry => entry.configs || []);
   const allSetupScripts = configEntries.flatMap(entry => entry.setups || []);
   const allServices = configEntries.flatMap(entry => entry.services || []);
   const allEnvironmentVariables = configEntries.flatMap(entry => entry.envs || []);

   ui.header(dryRun ? "Dry run" : "Sync");

   // Check AUR status once at the beginning - always check as per Go version
   const aurAvailable = await checkAURStatus();
   if (!aurAvailable) {
      ui.warn("AUR is currently unavailable. Continuing with system package updates only.");
   }

   // Remove duplicate packages
   const uniquePackages = [...new Set(allPackages)];

   // Process packages if any are configured
   if (uniquePackages.length > 0) {
     await processPackages(uniquePackages, configEntries, allDotfileConfigs, dryRun, options, aurAvailable);
   }

   // Process dotfile configurations, setup scripts, services, and environment variables
   await processConfigs(allDotfileConfigs, configEntries, dryRun);
   await processSetupScripts(allSetupScripts, dryRun);
   await processServices(allServices, dryRun);
   await processEnvironmentVariables(allEnvironmentVariables, dryRun, options.debug);
   await processGlobalEnvironmentVariables(globalEnvs, dryRun, options.debug);

   // Show completion message
   if (dryRun) {
     ui.success("Dry run completed successfully - no changes made");
   } else {
     ui.celebration(":: System sync complete ::");
   }
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