/**
 * Dots command handler for Owl package manager
 * Handles dotfiles-only operations (similar to Go version)
 */

import { ui } from "../../ui";
import { loadConfigForHost } from "../../modules/config";
import { hostname } from "os";
import { safeExecute } from "../../utils/errors";
import { processConfigs } from "./config-processor";
import type { CommandOptions } from "../commands";
import type { ConfigEntry } from "../../types";

/**
 * Handle the dots command (dotfiles only)
 * Supports both normal dots and dry-run modes
 */
export async function handleDotsCommand(dryRun: boolean, options: CommandOptions): Promise<void> {
  // Load and parse all configuration files for this host
  const configResult = await safeExecute(
    () => loadConfigForHost(hostname(), options.legacyParser),
    "Failed to load configuration"
  );

  const configEntries = configResult.entries;

  // Extract only dotfile configs
  const allDotfileConfigs = configEntries.flatMap(entry => entry.configs || []);

  ui.header(dryRun ? "Dotfiles dry run" : "Dotfiles sync");

  // Process dotfiles configurations
  if (allDotfileConfigs.length > 0) {
    await processConfigs(allDotfileConfigs, configEntries, dryRun);
  } else {
    ui.info("No dotfiles configurations found");
  }

  // Show completion message
  if (dryRun) {
    ui.success("Dotfiles dry run completed successfully - no changes made");
  } else {
    ui.systemMessage("Dotfiles sync complete");
  }
}
