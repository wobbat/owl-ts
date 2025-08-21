/**
 * Uninstall command handler for Owl package manager
 */

import { ui, icon } from "../ui";
import pc from "picocolors";
import { safeExecute } from "../utils/errors";
import type { CommandOptions } from "../commands";

/**
 * Handle the uninstall command
 */
export async function handleUninstallCommand(options: CommandOptions): Promise<void> {
  ui.header("Uninstall");

  const { getManagedPackages, removeUnmanagedPackages } = await import("../packages");
  const managedPackages = await getManagedPackages();

  if (managedPackages.length === 0) {
    ui.ok("No managed packages found to uninstall");
    return;
  }

  console.log("Managed packages to remove:");
  for (const pkg of managedPackages) {
    console.log(`  ${icon.remove} ${pc.white(pkg)}`);
  }
  console.log();
  console.log(`This will remove ${managedPackages.length} packages managed by Owl.`);
  console.log("Continue? (y/N)");

  const confirmation = await getUserConfirmation();

  if (confirmation.toLowerCase() !== 'y' && confirmation.toLowerCase() !== 'yes') {
    console.log("Uninstall cancelled");
    return;
  }

  console.log("Removing managed packages...");
  await safeExecute(
    () => removeUnmanagedPackages(managedPackages, !options.verbose),
    "Uninstall failed"
  );
  ui.celebration("All managed packages removed successfully!");
}

/**
 * Get user confirmation from stdin
 */
async function getUserConfirmation(): Promise<string> {
  return new Promise<string>((resolve) => {
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once('data', (data) => {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        const key = data.toString();
        console.log(key);
        resolve(key);
      });
    } else {
      process.stdin.once('data', (data) => resolve(data.toString().trim()));
    }
  });
}