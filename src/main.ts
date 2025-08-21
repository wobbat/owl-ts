/**
 * Main entry point for Owl package manager
 */

import { ui } from "./ui";
import { ensureOwlDirectories } from "./utils/fs";
import { ensureYayInstalled } from "./packages";
import { handleError } from "./utils/errors";
import { timeOperation } from "./utils/performance";
import {
  parseCommand,
  isHelpCommand,
  isVersionCommand,
  isUpgradeCommand,
  isDryRunCommand,
  isUninstallCommand
} from "./commands";
import {
  handleUpgradeCommand,
  handleUninstallCommand,
  handleApplyCommand
} from "./handlers/index";
import pkg from "../package.json";

/**
 * Show version information
 */
function showVersion() {
  console.log(`Owl v${pkg.version}`);
  console.log("\x1b[2mA modern package manager for Arch Linux\x1b[0m");
}

/**
 * Show help information
 */
function showHelp() {
  console.log("Owl Package Manager");
  console.log("A modern package manager for Arch Linux with config management and setup script automation.\n");

  console.log("\x1b[1mUsage:\x1b[0m");
  console.log("  owl <command> [options]\n");

  console.log("\x1b[1mCommands:\x1b[0m");
  ui.list([
    "apply          Install packages, copy configs, and run setup scripts",
    "dry-run, dr    Preview what would be done without making changes",
    "upgrade, up    Upgrade all packages to latest versions",
    "uninstall      Remove all managed packages and configs",
    "help, --help   Show this help message",
    "version, -v    Show version information"
  ], { indent: true, color: (s: string) => `\x1b[34m${s}\x1b[0m` });

  console.log("\x1b[1m\nOptions:\x1b[0m");
  ui.list([
    "--no-spinner   Disable loading animations",
    "--verbose      Show full command output instead of progress spinners"
  ], { indent: true, color: (s: string) => `\x1b[37m${s}\x1b[0m` });

  console.log("\x1b[1m\nExamples:\x1b[0m");
  ui.list([
    "owl                      # Apply all configurations (default)",
    "owl apply                # Apply all configurations",
    "owl dry-run              # Preview changes",
    "owl upgrade              # Upgrade all packages",
    "owl apply --no-spinner   # Apply without animations",
    "owl upgrade --verbose    # Upgrade with full command output"
  ], { indent: true, color: (s: string) => `\x1b[32m${s}\x1b[0m` });

  console.log("\x1b[1m\nConfiguration:\x1b[0m");
  console.log("  Place configuration files in ~/.owl/");
  ui.list([
    "~/.owl/main.owl           # Global configuration",
    "~/.owl/hosts/{host}.owl   # Host-specific overrides"
  ], { indent: true, color: (s: string) => `\x1b[2m${s}\x1b[0m` });

  console.log();
}

/**
 * Main application entry point for the Owl package manager
 * Handles command parsing, setup, and routing to appropriate command handlers
 */
export async function main() {
  try {
    // Parse command line arguments (skip node path and script path)
    const [, , ...args] = process.argv;
    const { command, options } = parseCommand(args);

    // Handle informational commands immediately (no setup needed)
    if (isHelpCommand(command)) {
      showHelp();
      return;
    }

    if (isVersionCommand(command)) {
      showVersion();
      return;
    }

    // Set up the Owl environment (create directories, ensure dependencies)
    await timeOperation("setup", async () => {
      ensureOwlDirectories();
      await ensureYayInstalled();
    });

    // Route to the appropriate command handler based on user input
    if (isUpgradeCommand(command)) {
      await timeOperation("upgrade", () => handleUpgradeCommand(options));
    } else if (isUninstallCommand(command)) {
      await timeOperation("uninstall", () => handleUninstallCommand(options));
    } else {
      // Default command: apply configuration (supports both normal and dry-run modes)
      const dryRun = isDryRunCommand(command);
      await timeOperation("apply", () => handleApplyCommand(dryRun, options));
    }
  } catch (error) {
    handleError("Fatal error", error);
  }
}
