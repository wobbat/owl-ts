/**
 * Configuration processing utilities for the apply command
 */

import type { ConfigEntry, ConfigMapping } from "../types";

/**
 * Process configuration management
 */
export async function processConfigs(
  allConfigs: ConfigMapping[],
  configEntries: ConfigEntry[],
  dryRun: boolean
): Promise<void> {
  if (allConfigs.length > 0) {
    if (dryRun) {
      const { analyzeConfigsPerPackage } = await import("../dotfiles");
      await analyzeConfigsPerPackage(configEntries);
    } else {
      const { manageConfigsPerPackage } = await import("../dotfiles");
      await manageConfigsPerPackage(configEntries);
    }
   }
}