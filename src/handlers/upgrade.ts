/**
 * Upgrade command handler for Owl package manager
 */

import { ui, spinner, icon } from "../ui";
import pc from "picocolors";
import { $ } from "bun";
import { safeExecuteWithFallback, safeExecute } from "../utils/errors";
import { compact } from "../utils/fs";
import type { CommandOptions } from "../commands";
import { hostname } from "os";

/**
 * Handle the upgrade command
 */
export async function handleUpgradeCommand(options: CommandOptions): Promise<void> {
  const { PacmanManager } = await import("../pacman-manager");
  const pacmanManager = new PacmanManager();

  ui.header("Upgrade");

  const analysisSpinner = spinner("Analyzing system packages...", { enabled: !options.noSpinner });

  // Get outdated packages using the new manager
  const outdatedPackages = await safeExecute(
    () => pacmanManager.getOutdatedPackages(),
    "Failed to analyze packages"
  );

  analysisSpinner.stop(`Found ${outdatedPackages.length} packages to upgrade`);

  if (outdatedPackages.length === 0) {
    ui.ok("All packages are up to date");
    return;
  }

  ui.overview({
    host: hostname(),
    packages: outdatedPackages.length
  });

  // Show packages to upgrade (matching Go version format)
  ui.showPackagesToUpgrade(outdatedPackages);

  const upgradeSpinner = spinner(`Upgrading ${outdatedPackages.length} packages...`, { enabled: !options.noSpinner && !options.verbose });

  await safeExecute(async () => {
    if (options.verbose) {
      await pacmanManager.upgradeSystem(true);
    } else {
      await pacmanManager.upgradeSystemWithProgress(false, (message: string) => {
        upgradeSpinner.update(message);
      });
    }
  }, "System upgrade failed");

  if (!options.verbose) {
    upgradeSpinner.stop("System upgrade completed successfully");
  }
  ui.celebration("All packages upgraded!");
}