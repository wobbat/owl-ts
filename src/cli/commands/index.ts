/**
 * Command definitions and parsing utilities for Owl package manager
 */

export const COMMANDS = [
  "apply","dry-run","dr","dots","upgrade","up","uninstall","add","search","s","install","i","S","info","Si","query","q","Q","configedit","ce","dotedit","de","gendb","track","hide","help","--help","-h","version","--version","-v"
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

export function parseCommand(args: string[]): ParsedCommand {
  const [cmd, ...restArgs] = args; const command = (cmd || "apply") as Command;
  if (!COMMANDS.includes(command)) throw new Error(`Unknown command: ${command}`);

  const options: CommandOptions = {
    noSpinner: restArgs.includes("--no-spinner"), verbose: restArgs.includes("--verbose"), debug: restArgs.includes("--debug"),
    devel: restArgs.includes("--devel"), useLibALPM: restArgs.includes("--alpm"), bypassCache: restArgs.includes("--bypass-cache"),
    legacyParser: restArgs.includes("--legacy-parser")
  };

  if (command === "add") {
    const exactValue = restArgs.find(a => a.startsWith('--exact='))?.split('=')[1] || (restArgs.includes('--exact') ? restArgs[restArgs.indexOf('--exact') + 1] : undefined);
    const fileValue = restArgs.find(a => a.startsWith('--file='))?.split('=')[1] || (restArgs.includes('--file') ? restArgs[restArgs.indexOf('--file') + 1] : undefined);
    const sourceValue = restArgs.find(a => a.startsWith('--source='))?.split('=')[1] || (restArgs.includes('--source') ? restArgs[restArgs.indexOf('--source') + 1] : undefined);
    options.exact = exactValue; options.file = fileValue; options.source = (sourceValue || 'any') as any;
    options.yes = restArgs.includes('--yes'); options.json = restArgs.includes('--json'); options.all = restArgs.includes('--all'); options.bypassCache = restArgs.includes('--bypass-cache'); options.dryRun = restArgs.includes('--dry-run');
    const filteredArgs = restArgs.filter(arg => !arg.startsWith('--') && arg !== exactValue && arg !== fileValue && arg !== sourceValue);
    return { command, options, args: filteredArgs };
  }

  if (command === "search" || command === "s") {
    const limitValue = restArgs.find(a => a.startsWith('--limit='))?.split('=')[1] || (restArgs.includes('--limit') ? restArgs[restArgs.indexOf('--limit') + 1] : undefined);
    options.aur = restArgs.includes('--aur'); options.repo = restArgs.includes('--repo'); options.limit = limitValue ? parseInt(limitValue, 10) : 50;
    const filteredArgs = restArgs.filter(arg => !arg.startsWith('--') && arg !== limitValue);
    return { command, options, args: filteredArgs };
  }

  if (command === "install" || command === "i" || command === "S") {
    options.asdeps = restArgs.includes('--asdeps'); options.asexplicit = restArgs.includes('--asexplicit'); options.noconfirm = restArgs.includes('--noconfirm'); options.needed = restArgs.includes('--needed');
    const filteredArgs = restArgs.filter(arg => !arg.startsWith('--'));
    return { command, options, args: filteredArgs };
  }

  if (command === "upgrade" || command === "up") {
    options.devel = restArgs.includes('--devel'); options.timeupdate = restArgs.includes('--timeupdate'); options.noconfirm = restArgs.includes('--noconfirm');
    return { command, options, args: restArgs };
  }

  if (command === "query" || command === "q" || command === "Q") {
    options.foreign = restArgs.includes('--foreign'); options.explicit = restArgs.includes('--explicit'); options.deps = restArgs.includes('--deps'); options.unrequired = restArgs.includes('--unrequired');
    const filteredArgs = restArgs.filter(arg => !arg.startsWith('--'));
    return { command, options, args: filteredArgs };
  }

  return { command, options, args: restArgs };
}

export const isHelpCommand = (c: Command) => c === "help" || c === "--help" || c === "-h";
export const isVersionCommand = (c: Command) => c === "version" || c === "--version" || c === "-v";
export const isUpgradeCommand = (c: Command) => c === "upgrade" || c === "up";
export const isDryRunCommand = (c: Command) => c === "dry-run" || c === "dr";
export const isDotsCommand = (c: Command) => c === "dots";
export const isUninstallCommand = (c: Command) => c === "uninstall";
export const isAddCommand = (c: Command) => c === "add";
export const isConfigEditCommand = (c: Command) => c === "configedit" || c === "ce";
export const isDotEditCommand = (c: Command) => c === "dotedit" || c === "de";
export const isSearchCommand = (c: Command) => c === "search" || c === "s";
export const isInstallCommand = (c: Command) => c === "install" || c === "i" || c === "S";
export const isInfoCommand = (c: Command) => c === "info" || c === "Si";
export const isQueryCommand = (c: Command) => c === "query" || c === "q" || c === "Q";
export const isGendbCommand = (c: Command) => c === "gendb";
