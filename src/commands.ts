/**
 * Command definitions and parsing utilities for Owl package manager
 */

export const COMMANDS = [
  "apply",
  "dry-run",
  "dr",
  "upgrade",
  "up",
  "uninstall",
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
}

export interface ParsedCommand {
  command: Command;
  options: CommandOptions;
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
    verbose: restArgs.includes("--verbose")
  };

  return { command, options };
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
 * Check if command is an uninstall command
 */
export function isUninstallCommand(command: Command): boolean {
  return command === "uninstall";
}