/**
 * Gendb command handler for Owl package manager
 * Generates VCS database for development packages
 */

import { ui } from "../ui";
import { safeExecute } from "../utils/errors";
import { getForeignPackages, filterVCSPackages, initializeVCSPackages } from "../vcs";
import type { CommandOptions } from "../commands";

/**
 * Handle the gendb command for generating VCS database
 */
export async function handleGendbCommand(options: CommandOptions): Promise<void> {
  ui.header("Generate VCS Database");

  // Get all foreign packages (AUR packages)
  const foreignPackages = await safeExecute(
    () => getForeignPackages(),
    "Failed to get foreign packages"
  );

  ui.info(`Analyzing ${foreignPackages.length} AUR packages for VCS sources...`);

  // Filter for VCS packages
  const vcsPackages = filterVCSPackages(foreignPackages);

  if (vcsPackages.length === 0) {
    ui.success("No VCS packages found");
    return;
  }

  ui.info(`Found ${vcsPackages.length} VCS packages out of ${foreignPackages.length} AUR packages`);

  // Initialize VCS database
  ui.info("Generating VCS database...");

  const generatedCount = await safeExecute(
    () => initializeVCSPackages(vcsPackages),
    "Failed to generate VCS database"
  );

  ui.success(`VCS database generated for ${generatedCount} development packages`);
  
  if (generatedCount < vcsPackages.length) {
    ui.warn(`Note: ${vcsPackages.length - generatedCount} packages could not be processed`);
    ui.info("This is normal for packages that are no longer available in AUR or have connectivity issues");
  }

  ui.info("You can now use 'owl upgrade --devel' to check for VCS package updates");
}