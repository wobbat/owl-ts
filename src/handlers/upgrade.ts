/**
 * Upgrade command handler for Owl package manager
 */

import { ui, spinner, icon } from "../ui";
import pc from "picocolors";
import { $ } from "bun";
import { safeExecuteWithFallback, safeExecute } from "../utils/errors";
import type { CommandOptions } from "../commands";
import { hostname } from "os";

/**
 * Handle the upgrade command
 */
export async function handleUpgradeCommand(options: CommandOptions): Promise<void> {
  ui.header("Upgrade");

  const analysisSpinner = spinner("Analyzing system packages...", { enabled: !options.noSpinner });

  const result = await safeExecuteWithFallback(
    () => $`yay -Qu`.text().catch(() => ""),
    "",
    "Failed to analyze packages"
  );

  const outdatedPackages = compact(result.split('\n').map((line: string) => line.split(' ')[0]));

  analysisSpinner.stop(`Found ${outdatedPackages.length} packages to upgrade`);

  if (outdatedPackages.length === 0) {
    ui.ok("All packages are up to date");
    return;
  }

  ui.overview({
    host: hostname(),
    packages: outdatedPackages.length
  });

  console.log("Packages to upgrade:");
  for (const pkg of outdatedPackages) {
    console.log(`  ${icon.upgrade} ${pc.white(pkg)}`);
  }
  console.log();

  const upgradeSpinner = spinner(`Upgrading ${outdatedPackages.length} packages...`, { enabled: !options.noSpinner });

  await safeExecute(async () => {
    if (options.verbose) {
      await $`yay -Syu --noconfirm`;
    } else {
      await $`yay -Syu --noconfirm`.quiet();
    }
  }, "System upgrade failed");

  upgradeSpinner.stop("System upgrade completed successfully");
  ui.celebration("All packages upgraded!");
}

/**
 * Compact filters out null/undefined/empty-string/false values from an array
 */
function compact<T>(array: Array<T | null | undefined | false | "" | 0>): T[] {
  return array.filter((v): v is T => Boolean(v) && v !== "") as T[];
}