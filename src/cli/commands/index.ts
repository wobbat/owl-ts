/**
 * Command definitions and parsing utilities for Owl package manager
 */

// Canonical commands (no aliases here)
export const COMMANDS = [
  "apply",
  "dry-run",
  "dots",
  "upgrade",
  "uninstall",
  "add",
  "search",
  "install",
  "info",
  "query",
  "configedit",
  "dotedit",
  "gendb",
  "track",
  "hide",
  "help",
  "version",
] as const;

export type Command = typeof COMMANDS[number];

export interface CommandOptions {
  noSpinner: boolean; verbose: boolean; debug: boolean; devel: boolean; useLibALPM: boolean; bypassCache: boolean;
  exact?: string; file?: string; source?: "repo" | "aur" | "any"; yes?: boolean; json?: boolean; all?: boolean; dryRun?: boolean;
  aur?: boolean; repo?: boolean; limit?: number; asdeps?: boolean; asexplicit?: boolean; noconfirm?: boolean; needed?: boolean;
  timeupdate?: boolean; foreign?: boolean; explicit?: boolean; deps?: boolean; unrequired?: boolean;
  /** Use legacy non-AST config parser */
  legacyParser?: boolean;
}

export interface ParsedCommand { command: Command; options: CommandOptions; args: string[]; }

// Aliases map to canonical command names
const ALIASES: Record<string, Command> = {
  // help/version aliases
  "help": "help", "--help": "help", "-h": "help",
  "version": "version", "--version": "version", "-v": "version",
  // common aliases
  "dr": "dry-run", "dry-run": "dry-run",
  "d": "dots", "dots": "dots",
  "up": "upgrade", "upgrade": "upgrade",
  "s": "search", "search": "search",
  "i": "install", "S": "install", "install": "install",
  "Si": "info", "info": "info",
  "q": "query", "Q": "query", "query": "query",
  "ce": "configedit", "configedit": "configedit",
  "de": "dotedit", "dotedit": "dotedit",
  "gendb": "gendb",
  "track": "track",
  "hide": "hide",
  "uninstall": "uninstall",
  "apply": "apply",
};

function getFlagValue(args: string[], key: string, consumed: Set<number>): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (consumed.has(i)) continue;
    if (a === key && i + 1 < args.length && !args[i + 1].startsWith('--')) {
      consumed.add(i); consumed.add(i + 1);
      return args[i + 1];
    }
    if (a.startsWith(key + '=')) {
      consumed.add(i);
      return a.slice(key.length + 1);
    }
  }
  return undefined;
}

function hasFlag(args: string[], key: string, consumed: Set<number>): boolean {
  for (let i = 0; i < args.length; i++) {
    if (consumed.has(i)) continue;
    if (args[i] === key) { consumed.add(i); return true; }
  }
  return false;
}

export function parseCommand(args: string[]): ParsedCommand {
  const [rawCmd, ...rest] = args;
  const resolved = rawCmd ? ALIASES[rawCmd] : ("apply" as Command);
  if (!resolved) throw new Error(`Unknown command: ${rawCmd}`);
  const command = resolved as Command;
  if (!COMMANDS.includes(command)) throw new Error(`Unknown command: ${rawCmd}`);

  const consumed = new Set<number>();

  const options: CommandOptions = {
    noSpinner: hasFlag(rest, "--no-spinner", consumed),
    verbose: hasFlag(rest, "--verbose", consumed),
    debug: hasFlag(rest, "--debug", consumed),
    devel: hasFlag(rest, "--devel", consumed),
    useLibALPM: hasFlag(rest, "--alpm", consumed),
    bypassCache: hasFlag(rest, "--bypass-cache", consumed),
    legacyParser: hasFlag(rest, "--legacy-parser", consumed),
  };

  // Common optional flags across commands (parsed generically)
  const exactValue = getFlagValue(rest, '--exact', consumed);
  const fileValue = getFlagValue(rest, '--file', consumed);
  const sourceValue = getFlagValue(rest, '--source', consumed);
  const limitValue = getFlagValue(rest, '--limit', consumed);

  if (exactValue !== undefined) options.exact = exactValue;
  if (fileValue !== undefined) options.file = fileValue;
  if (sourceValue !== undefined) options.source = (sourceValue || 'any') as any;
  if (limitValue !== undefined) options.limit = parseInt(limitValue, 10);

  // Generic booleans used by specific commands; safe to parse for all
  if (hasFlag(rest, '--yes', consumed)) options.yes = true;
  if (hasFlag(rest, '--json', consumed)) options.json = true;
  if (hasFlag(rest, '--all', consumed)) options.all = true;
  if (hasFlag(rest, '--dry-run', consumed)) options.dryRun = true;
  if (hasFlag(rest, '--aur', consumed)) options.aur = true;
  if (hasFlag(rest, '--repo', consumed)) options.repo = true;
  if (hasFlag(rest, '--asdeps', consumed)) options.asdeps = true;
  if (hasFlag(rest, '--asexplicit', consumed)) options.asexplicit = true;
  if (hasFlag(rest, '--noconfirm', consumed)) options.noconfirm = true;
  if (hasFlag(rest, '--needed', consumed)) options.needed = true;
  if (hasFlag(rest, '--timeupdate', consumed)) options.timeupdate = true;
  if (hasFlag(rest, '--foreign', consumed)) options.foreign = true;
  if (hasFlag(rest, '--explicit', consumed)) options.explicit = true;
  if (hasFlag(rest, '--deps', consumed)) options.deps = true;
  if (hasFlag(rest, '--unrequired', consumed)) options.unrequired = true;

  // Remaining non-option args are positional
  const positional: string[] = [];
  rest.forEach((a, idx) => {
    if (!consumed.has(idx) && !a.startsWith('--')) positional.push(a);
  });

  return { command, options, args: positional };
}

export const isHelpCommand = (c: Command) => c === "help";
export const isVersionCommand = (c: Command) => c === "version";
export const isUpgradeCommand = (c: Command) => c === "upgrade";
export const isDryRunCommand = (c: Command) => c === "dry-run";
export const isDotsCommand = (c: Command) => c === "dots";
export const isUninstallCommand = (c: Command) => c === "uninstall";
export const isAddCommand = (c: Command) => c === "add";
export const isConfigEditCommand = (c: Command) => c === "configedit";
export const isDotEditCommand = (c: Command) => c === "dotedit";
export const isSearchCommand = (c: Command) => c === "search";
export const isInstallCommand = (c: Command) => c === "install";
export const isInfoCommand = (c: Command) => c === "info";
export const isQueryCommand = (c: Command) => c === "query";
export const isGendbCommand = (c: Command) => c === "gendb";
