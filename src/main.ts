/**
 * Main entry point for Owl package manager
 */

import { ui } from "./ui";
import { ensureOwlDirectories } from "./utils/fs";
import { ensurePacmanAvailable } from "./packages";
import { handleError } from "./utils/errors";
import { timeOperation } from "./utils/performance";
import {
  parseCommand,
  isHelpCommand,
  isVersionCommand,
  isUpgradeCommand,
  isDryRunCommand,
  isDotsCommand,
  isUninstallCommand,
  isAddCommand,
  isConfigEditCommand,
  isDotEditCommand,
  isGendbCommand
} from "./commands";
import {
  handleUpgradeCommand,
  handleUninstallCommand,
  handleApplyCommand,
  handleDotsCommand
} from "./handlers/index";
import { handleAddCommand } from "./handlers/add";
import { handleConfigEditCommand } from "./handlers/configedit";
import { handleDotEditCommand } from "./handlers/dotedit";
import { handleGendbCommand } from "./handlers/gendb";

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
      "dots           Check and sync only dotfiles configurations",
      "add            Search for and add packages to configuration files",
      "configedit, ce Edit configuration files with your preferred editor",
      "dotedit, de    Edit dotfiles with your preferred editor",
      "dry-run, dr    Preview what would be done without making changes",
      "upgrade, up    Upgrade all packages to latest versions",
      "uninstall      Remove all managed packages and configs",
      "gendb          Generate VCS database for development packages",
      "help, --help   Show this help message",
      "version, -v    Show version information"
    ], { indent: true, color: (s: string) => `\x1b[34m${s}\x1b[0m` });

  console.log("\x1b[1m\nOptions:\x1b[0m");
  ui.list([
    "--no-spinner   Disable loading animations",
    "--verbose      Show full command output instead of progress spinners",
    "--devel        Check VCS packages (-git, -hg, etc.) for updates (with upgrade)"
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
    const { command, options, args: remainingArgs } = parseCommand(args);

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
      await ensurePacmanAvailable();
    });

    // Route to the appropriate command handler based on user input
    if (isUpgradeCommand(command)) {
      await timeOperation("upgrade", () => handleUpgradeCommand(options));
    } else if (isUninstallCommand(command)) {
      await timeOperation("uninstall", () => handleUninstallCommand(options));
    } else if (isDotsCommand(command)) {
      // Check for --dry-run flag in remaining args
      const dryRun = remainingArgs.includes('--dry-run');
      await timeOperation("dots", () => handleDotsCommand(dryRun, options));
    } else if (isAddCommand(command)) {
      // Extract search terms from remaining arguments (options are already parsed)
      const searchTerms = remainingArgs.filter(arg => !arg.startsWith('--'));
      await timeOperation("add", () => handleAddCommand(searchTerms, options));
    } else if (isConfigEditCommand(command)) {
      // Extract target from remaining arguments
      const target = remainingArgs.find(arg => !arg.startsWith('--'));
      await timeOperation("configedit", () => handleConfigEditCommand(target, options));
    } else if (isDotEditCommand(command)) {
      // Extract target from remaining arguments
      const target = remainingArgs.find(arg => !arg.startsWith('--'));
      await timeOperation("dotedit", () => handleDotEditCommand(target, options));
    } else if (isGendbCommand(command)) {
      await timeOperation("gendb", () => handleGendbCommand(options));
    } else {
      // Default command: apply configuration (supports both normal and dry-run modes)
      const dryRun = isDryRunCommand(command);
      await timeOperation("apply", () => handleApplyCommand(dryRun, options));
    }
  } catch (error) {
    handleError("Fatal error", error);
  }
}

// Run the main function when this file is executed directly
if (import.meta.main) {
  main();
}
