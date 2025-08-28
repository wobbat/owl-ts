/**
 * Command definitions and parsing utilities for Owl package manager
 */

export const COMMANDS = [
  "apply",
  "dry-run",
  "dr",
  "dots",
  "upgrade",
  "up",
  "uninstall",
  "add",
  "search",
  "s",
  "install",
  "i",
  "S",
  "info",
  "Si",
  "query",
  "q",
  "Q",
  "configedit",
  "ce",
  "dotedit",
  "de",
  "gendb",
  "help",
  "--help",
  "-h",
  "version",
  "--version",
  "-v"
] as const;

export type Command = typeof COMMANDS[number];

export interface CommandOptions {
  noSpinner: boolean;
  verbose: boolean;
  debug: boolean;
  devel: boolean;
  useLibALPM: boolean;
  bypassCache: boolean;
  // Add command specific options
  exact?: string;
  file?: string;
  source?: "repo" | "aur" | "any";
  yes?: boolean;
  json?: boolean;
  all?: boolean;
  dryRun?: boolean;
  // Search command options
  aur?: boolean;
  repo?: boolean;
  limit?: number;
  // Install command options
  asdeps?: boolean;
  asexplicit?: boolean;
  noconfirm?: boolean;
  needed?: boolean;
  // Upgrade command options
  timeupdate?: boolean;
  // Query command options
  foreign?: boolean;
  explicit?: boolean;
  deps?: boolean;
  unrequired?: boolean;
}

export interface ParsedCommand {
  command: Command;
  options: CommandOptions;
  args: string[];
}

/**
 * Parse command line arguments and extract command with options
 */
export function parseCommand(args: string[]): ParsedCommand {
  const [cmd, ...restArgs] = args;
  const command = (cmd || "apply") as Command;

  if (!COMMANDS.includes(command)) {
    throw new Error(`Unknown command: ${command}`);
  }

   const options: CommandOptions = {
     noSpinner: restArgs.includes("--no-spinner"),
     verbose: restArgs.includes("--verbose"),
     debug: restArgs.includes("--debug"),
     devel: restArgs.includes("--devel"),
     useLibALPM: restArgs.includes("--alpm"),
     bypassCache: restArgs.includes("--bypass-cache")
   };

    // Parse command-specific options
    if (command === "add") {
      const exactValue = restArgs.find(arg => arg.startsWith('--exact='))?.split('=')[1] ||
                         (restArgs.includes('--exact') ? restArgs[restArgs.indexOf('--exact') + 1] : undefined);
      const fileValue = restArgs.find(arg => arg.startsWith('--file='))?.split('=')[1] ||
                        (restArgs.includes('--file') ? restArgs[restArgs.indexOf('--file') + 1] : undefined);
      const sourceValue = restArgs.find(arg => arg.startsWith('--source='))?.split('=')[1] ||
                          (restArgs.includes('--source') ? restArgs[restArgs.indexOf('--source') + 1] : undefined);

      options.exact = exactValue;
      options.file = fileValue;
      options.source = (sourceValue || 'any') as "repo" | "aur" | "any";
      options.yes = restArgs.includes('--yes');
      options.json = restArgs.includes('--json');
      options.all = restArgs.includes('--all');
      options.bypassCache = restArgs.includes('--bypass-cache');
      options.dryRun = restArgs.includes('--dry-run');

      // Filter out options and their values from remaining args
      const filteredArgs = restArgs.filter((arg, _index) => {
        if (arg.startsWith('--')) return false;
        if (exactValue && arg === exactValue) return false;
        if (fileValue && arg === fileValue) return false;
        if (sourceValue && arg === sourceValue) return false;
        return true;
      });

      return { command, options, args: filteredArgs };
    }

    if (command === "search" || command === "s") {
      const limitValue = restArgs.find(arg => arg.startsWith('--limit='))?.split('=')[1] ||
                         (restArgs.includes('--limit') ? restArgs[restArgs.indexOf('--limit') + 1] : undefined);

      options.aur = restArgs.includes('--aur');
      options.repo = restArgs.includes('--repo');
      options.limit = limitValue ? parseInt(limitValue, 10) : 50;

      // Filter out options and their values from remaining args
      const filteredArgs = restArgs.filter((arg, _index) => {
        if (arg.startsWith('--')) return false;
        if (limitValue && arg === limitValue) return false;
        return true;
      });

      return { command, options, args: filteredArgs };
    }

    if (command === "install" || command === "i" || command === "S") {
      options.asdeps = restArgs.includes('--asdeps');
      options.asexplicit = restArgs.includes('--asexplicit');
      options.noconfirm = restArgs.includes('--noconfirm');
      options.needed = restArgs.includes('--needed');

      // Filter out options from remaining args
      const filteredArgs = restArgs.filter(arg => !arg.startsWith('--'));

      return { command, options, args: filteredArgs };
    }

    if (command === "upgrade" || command === "up") {
      options.devel = restArgs.includes('--devel');
      options.timeupdate = restArgs.includes('--timeupdate');
      options.noconfirm = restArgs.includes('--noconfirm');

      return { command, options, args: restArgs };
    }

    if (command === "query" || command === "q" || command === "Q") {
      options.foreign = restArgs.includes('--foreign');
      options.explicit = restArgs.includes('--explicit');
      options.deps = restArgs.includes('--deps');
      options.unrequired = restArgs.includes('--unrequired');

      // Filter out options from remaining args
      const filteredArgs = restArgs.filter(arg => !arg.startsWith('--'));

      return { command, options, args: filteredArgs };
    }

   return { command, options, args: restArgs };
}

/**
 * Check if command is a help command
 */
export function isHelpCommand(command: Command): boolean {
  return command === "help" || command === "--help" || command === "-h";
}

/**
 * Check if command is a version command
 */
export function isVersionCommand(command: Command): boolean {
  return command === "version" || command === "--version" || command === "-v";
}

/**
 * Check if command is an upgrade command
 */
export function isUpgradeCommand(command: Command): boolean {
  return command === "upgrade" || command === "up";
}

/**
 * Check if command is a dry run command
 */
export function isDryRunCommand(command: Command): boolean {
  return command === "dry-run" || command === "dr";
}

/**
 * Check if command is a dots command
 */
export function isDotsCommand(command: Command): boolean {
  return command === "dots";
}

/**
 * Check if command is an uninstall command
 */
export function isUninstallCommand(command: Command): boolean {
  return command === "uninstall";
}

/**
 * Check if command is an add command
 */
export function isAddCommand(command: Command): boolean {
  return command === "add";
}

/**
 * Check if command is a configedit command
 */
export function isConfigEditCommand(command: Command): boolean {
  return command === "configedit" || command === "ce";
}

/**
 * Check if command is a dotedit command
 */
export function isDotEditCommand(command: Command): boolean {
  return command === "dotedit" || command === "de";
}

/**
 * Check if command is a search command
 */
export function isSearchCommand(command: Command): boolean {
  return command === "search" || command === "s";
}

/**
 * Check if command is an install command
 */
export function isInstallCommand(command: Command): boolean {
  return command === "install" || command === "i" || command === "S";
}

/**
 * Check if command is an info command
 */
export function isInfoCommand(command: Command): boolean {
  return command === "info" || command === "Si";
}

/**
 * Check if command is a query command
 */
export function isQueryCommand(command: Command): boolean {
  return command === "query" || command === "q" || command === "Q";
}

/**
 * Check if command is a gendb command
 */
export function isGendbCommand(command: Command): boolean {
  return command === "gendb";
}