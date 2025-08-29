import { ui } from "../ui";
import { ensureOwlDirectories } from "../utils/fs";
import { ensurePacmanAvailable } from "../modules/packages";
import { handleError } from "../utils/errors";
import { timeOperation } from "../utils/performance";
import { parseCommand, isHelpCommand, isVersionCommand, type Command, type CommandOptions } from "./commands";
import {
  handleUpgradeCommand,
  handleUninstallCommand,
  handleApplyCommand,
  handleDotsCommand
} from "./handlers/index";
import { handleAddCommand } from "./handlers/add";
import { handleSearchCommand } from "./handlers/search";
import { handleConfigEditCommand } from "./handlers/configedit";
import { handleDotEditCommand } from "./handlers/dotedit";
import { handleGendbCommand } from "./handlers/gendb";

import pkg from "../../package.json";

function showVersion() {
  console.log(`Owl v${pkg.version}`);
  console.log("\x1b[2mA modern package manager for Arch Linux\x1b[0m");
}

function showHelp() {
  console.log("Owl Package Manager");
  console.log("A modern package manager for Arch Linux with config management and setup script automation.\n");
  console.log("\x1b[1mUsage:\x1b[0m");
  console.log("  owl <command> [options]\n");
  console.log("\x1b[1mCommands:\x1b[0m");
  ui.list([
    "apply          Install packages, copy configs, and run setup scripts",
    "dots, d        Check and sync only dotfiles configurations",
    "track          Track explicitly-installed packages into Owl configs",
    "hide           Hide packages from track suggestions",
    "add            Search for and add packages to configuration files",
    "search, s      Search for packages in repositories and AUR",
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
    "--devel        Check VCS packages (-git, -hg, etc.) for updates (with upgrade)",
    "hide: --show-hidden       Print current hidden list (untracked)",
    "hide: --remove <pkg>      Remove package from hidden list"
  ], { indent: true, color: (s: string) => `\x1b[37m${s}\x1b[0m` });
  console.log("\x1b[1m\nConfiguration:\x1b[0m");
  console.log("  Place configuration files in ~/.owl/");
  ui.list([
    "~/.owl/main.owl           # Global configuration",
    "~/.owl/hosts/{host}.owl   # Host-specific overrides"
  ], { indent: true, color: (s: string) => `\x1b[2m${s}\x1b[0m` });
  console.log();
}

export async function main() {
  try {
    // Graceful shutdown
    const abort = () => {
      console.log("\nInterrupted. Exiting...");
      process.exit(130);
    };
    process.once('SIGINT', abort);
    process.once('SIGTERM', abort);

    // In Bun standalone executable, process.argv contains:
    // ["bun", "/$bunfs/root/owl", ...userArgs] when userArgs provided
    // ["bun", "/$bunfs/root/owl", "./path/to/executable"] when no userArgs
    let args = process.argv.slice(2);

    // Filter out the executable path if it's the only argument (no user args)
    if (args.length === 1 && args[0] && (args[0].endsWith('owl') || args[0] === './dist/owl')) {
      args = [];
    }

    const { command, options, args: remainingArgs } = parseCommand(args);

    if (isHelpCommand(command)) {
      showHelp();
      return;
    }
    if (isVersionCommand(command)) {
      showVersion();
      return;
    }

    await timeOperation("setup", async () => {
      ensureOwlDirectories();
      await ensurePacmanAvailable();
    });

    // Command dispatch: use a switch for clarity and explicit alias grouping
    switch (command) {
      case "upgrade":
        await timeOperation("upgrade", () => handleUpgradeCommand(options));
        break;

      case "uninstall":
        await timeOperation("uninstall", () => handleUninstallCommand(options));
        break;

      case "dots": {
        const dryRun = remainingArgs.includes('--dry-run');
        await timeOperation("dots", () => handleDotsCommand(dryRun, options));
        break;
      }

      case "add": {
        const searchTerms = remainingArgs.filter(arg => !arg.startsWith('--'));
        await timeOperation("add", () => handleAddCommand(searchTerms, options));
        break;
      }

      case "search": {
        const searchTerms = remainingArgs.filter(arg => !arg.startsWith('--'));
        await timeOperation("search", () => handleSearchCommand(searchTerms, options));
        break;
      }

      case "configedit": {
        const target = remainingArgs.find(arg => !arg.startsWith('--'));
        await timeOperation("configedit", () => handleConfigEditCommand(target, options));
        break;
      }

      case "dotedit": {
        const target = remainingArgs.find(arg => !arg.startsWith('--'));
        await timeOperation("dotedit", () => handleDotEditCommand(target, options));
        break;
      }

      case "track": {
        const { handleTrackCommand } = await import("./handlers/track");
        await timeOperation("track", () => handleTrackCommand(remainingArgs, options));
        break;
      }

      case "hide": {
        const { handleHideCommand } = await import("./handlers/track");
        await timeOperation("hide", () => handleHideCommand(remainingArgs, options));
        break;
      }

      case "gendb":
        await timeOperation("gendb", () => handleGendbCommand(options));
        break;

      case "dry-run":
        await timeOperation("apply", () => handleApplyCommand(true, options));
        break;

      case "apply":
      default:
        await timeOperation("apply", () => handleApplyCommand(false, options));
        break;
    }
    // Ensure fast exit with no lingering timers/handles
    process.exit(0);
  } catch (error) {
    handleError("Fatal error", error);
  }
}

if (import.meta.main) {
  main();
}
