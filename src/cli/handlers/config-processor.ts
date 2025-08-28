/**
 * Configuration processing utilities for the apply command
 */

import type { ConfigEntry, ConfigMapping } from "../../types";

/**
 * Process configuration management
 */
export async function processConfigs(
  allConfigs: ConfigMapping[],
  configEntries: ConfigEntry[],
  dryRun: boolean
): Promise<void> {
  if (allConfigs.length > 0) {
    const { syncDotfilesByPackage } = await import("../../modules/dotfiles");
    await syncDotfilesByPackage(configEntries, { dryRun });
   }
}
