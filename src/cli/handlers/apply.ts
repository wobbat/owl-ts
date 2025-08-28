/**
 * Apply command handler for Owl package manager
 */

import { ui } from "../../ui";
import { loadConfigForHost } from "../../modules/config";
import { hostname } from "os";
import pc from "picocolors";
import { safeExecute } from "../../utils/errors";
import { processPackages } from "./package-processor";
import { processConfigs } from "./config-processor";
import { processSetupScripts } from "./setup-processor";
import { processServices } from "./service-processor";
import { processEnvironmentVariables, processGlobalEnvironmentVariables } from "./env-processor";
import type { CommandOptions } from "../commands";
import type { ConfigEntry, ConfigMapping, PackageAction, ServiceSpec } from "../../types";

/**
 * Apply configuration changes to the system
 * Supports both normal apply and dry-run modes
 */
export async function handleApplyCommand(dryRun: boolean, options: CommandOptions): Promise<void> {
    // Get hostname
    const host = hostname();

    // Load and parse all configuration files for this host
    const configResult = await safeExecute(
      () => loadConfigForHost(host, options.legacyParser),
      "Failed to load configuration"
    );

    // Extract all components from config
    const configData = extractConfigData(configResult);

    // Show header
    ui.header(dryRun ? "Dry run" : "Sync");

    // Process packages first (and only check AUR if needed)
    if (configData.packages.length > 0) {
      const aurAvailable = dryRun ? true : await checkAURStatus();
      if (!aurAvailable) {
        // Show AUR down message once
        ui.aurDownMessage();
        ui.warn("Warning: AUR is currently unavailable. Continuing with system package updates only.");
      }
      await processPackages(configData.packages, configResult.entries, configData.dotfileConfigs, dryRun, options, aurAvailable);
    }

    // Process other configurations
    await processConfigs(configData.dotfileConfigs, configResult.entries, dryRun);
    // Combine global and package scripts for execution order (global first)
    const allScripts = [...(configResult.globalScripts || []), ...configData.packageSetupScripts];
    await processSetupScripts(allScripts, dryRun);
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
  packageSetupScripts: string[];
  services: ServiceSpec[];
  environmentVariables: Array<{ key: string; value: string }>;
} {
  const entries = configResult.entries as ConfigEntry[];
  return {
    packages: [...new Set(entries.map(entry => entry.package))],
    dotfileConfigs: entries.flatMap(entry => entry.configs || []),
    packageSetupScripts: entries.flatMap(entry => entry.setups || []),
    services: entries.flatMap(entry =>
      (entry.services || []).map((s: any) => typeof s === 'string' ? ({ name: s, enable: true, start: true }) : s)
    ),
    environmentVariables: entries.flatMap(entry => entry.envs || [])
  };
}

/**
 * Check AUR availability
 */
async function checkAURStatus(): Promise<boolean> {
    try {
      const { refreshAURStatusAsync, getAURStatus } = await import("../../modules/aur/status");
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
    const { icon } = await import("../../ui");

    console.log("Cleaning up environment variables for removed packages:");
    for (const env of envsToRemove) {
      console.log(`  ${icon.remove} Removing env var: ${pc.cyan(env.key)}`);
    }

    const { removeEnvironmentVariables } = await import("../../modules/env");
    await removeEnvironmentVariables(envsToRemove);
    console.log();
  }
}

// Import required functions
async function getEnvironmentVariablesToRemove(packageName: string, configEntries: ConfigEntry[]): Promise<Array<{ key: string; value: string }>> {
  const { getEnvironmentVariablesToRemove } = await import("../../modules/env");
  return getEnvironmentVariablesToRemove(packageName, configEntries);
}
