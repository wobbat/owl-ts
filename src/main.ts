import { ui, spinner, icon } from "./ui";
import { loadConfigForHost } from "./config";
import { runSetupScripts } from "./setup";
import { analyzePackages, installPackages, updateManagedPackages, removeUnmanagedPackages, ensureYayInstalled } from "./packages";
import { ensureOwlDirectories } from "./utils/fs";
import { hostname } from "node:os";
import pc from "picocolors";
import { $ } from "bun";

const COMMANDS = ["apply", "dry-run", "dr", "upgrade", "up", "uninstall", "help", "--help", "-h", "version", "--version", "-v"] as const;
type Command = typeof COMMANDS[number];

interface CommandOptions {
  noSpinner: boolean;
  verbose: boolean;
}

function handleError(message: string, error?: any): never {
  ui.error(`${message}: ${error?.message || "Unknown error"}`);
  process.exit(1);
}

async function safeExecute<T>(operation: () => Promise<T>, errorMessage: string): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    handleError(errorMessage, error);
  }
}

function showVersion() {
  const pkg = require("../package.json");
  console.log(`Owl v${pkg.version}`);
  console.log(pc.dim("A modern package manager for Arch Linux"));
}

function showHelp() {
  console.log("Owl Package Manager");
  console.log("A modern package manager for Arch Linux with config management and setup script automation.\n");
  
  console.log(pc.bold("Usage:"));
  console.log("  owl <command> [options]\n");
  
  console.log(pc.bold("Commands:"));
  ui.list([
    "apply          Install packages, copy configs, and run setup scripts",
    "dry-run, dr    Preview what would be done without making changes",
    "upgrade, up    Upgrade all packages to latest versions",
    "uninstall      Remove all managed packages and configs",
    "help, --help   Show this help message",
    "version, -v    Show version information"
  ], { indent: true, color: pc.blue });
  
  console.log(pc.bold("\nOptions:"));
  ui.list([
    "--no-spinner   Disable loading animations",
    "--verbose      Show full command output instead of progress spinners"
  ], { indent: true, color: pc.white });
  
  console.log(pc.bold("\nExamples:"));
  ui.list([
    "owl                      # Apply all configurations (default)",
    "owl apply                # Apply all configurations", 
    "owl dry-run              # Preview changes",
    "owl upgrade              # Upgrade all packages",
    "owl apply --no-spinner   # Apply without animations",
    "owl upgrade --verbose    # Upgrade with full command output"
  ], { indent: true, color: pc.green });
  
  console.log(pc.bold("\nConfiguration:"));
  console.log("  Place configuration files in ~/.owl/");
  ui.list([
    "~/.owl/main.owl           # Global configuration", 
    "~/.owl/hosts/{host}.owl   # Host-specific overrides"
  ], { indent: true, color: pc.dim });
  
  console.log();
}

async function handleUpgradeCommand(options: CommandOptions): Promise<void> {
  ui.header("Upgrade");
  
  const analysisSpinner = spinner("Analyzing system packages...", { enabled: !options.noSpinner });
  
  const result = await safeExecute(
    () => $`yay -Qu`.text().catch(() => ""),
    "Failed to analyze packages"
  );
  
  const outdatedPackages = result.split('\n').filter(Boolean).map((line: string) => line.split(' ')[0]).filter(Boolean);
  
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

async function handleUninstallCommand(options: CommandOptions): Promise<void> {
  ui.header("Uninstall");
  
  const { getManagedPackages } = await import("./packages");
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

async function handleApplyCommand(dryRun: boolean, options: CommandOptions): Promise<void> {
  const configEntries = await safeExecute(
    () => loadConfigForHost(hostname()),
    "Failed to load configuration"
  );
  
  const allPackages: string[] = configEntries.map((entry: any) => entry.package);
  const allConfigs: Array<{ source: string; destination: string }> = configEntries.flatMap((entry: any) => entry.configs || []);
  const allSetups: string[] = configEntries.flatMap((entry: any) => entry.setups || []);
  
  ui.header(dryRun ? "Dry run" : "Apply");
  
  const uniquePackages = [...new Set(allPackages)];
  
  if (uniquePackages.length > 0) {
    await handlePackages(uniquePackages, configEntries, allConfigs, dryRun, options);
  }
  
  await handleConfigs(allConfigs, configEntries, dryRun);
  await handleSetupScripts(allSetups, dryRun);
  
  if (dryRun) {
    ui.success("Dry run completed successfully - no changes made");
  } else {
    ui.celebration(":: System sync complete ::");
  }
}

async function handlePackages(uniquePackages: string[], configEntries: any[], allConfigs: any[], dryRun: boolean, options: CommandOptions): Promise<void> {
  const analysisSpinner = spinner("Analyzing package status...", { enabled: !options.noSpinner });
  const packageActions = await analyzePackages(uniquePackages);
  analysisSpinner.stop("Analysis complete");
  
  const toInstall = packageActions.filter(p => p.status === 'install');
  const toRemove = packageActions.filter(p => p.status === 'remove');
  
  ui.overview({
    host: hostname(),
    packages: uniquePackages.length
  });
  
  if (toRemove.length > 0) {
    console.log("Packages to remove (no longer in config):");
    for (const pkg of toRemove) {
      console.log(`  ${icon.remove} ${pc.white(pkg.name)}`);
    }
    console.log();
  }
  
  if (dryRun) {
    await handleDryRunPackages(toInstall, toRemove, configEntries, allConfigs);
  } else {
    await handleRealPackageInstall(toInstall, toRemove, configEntries, allConfigs, uniquePackages, options);
  }
}

async function handleDryRunPackages(toInstall: any[], toRemove: any[], configEntries: any[], allConfigs: any[]): Promise<void> {
  if (toInstall.length > 0 || toRemove.length > 0) {
    ui.installHeader();
    
    for (const pkg of toInstall) {
      const packageEntry = configEntries.find((entry: any) => entry.package === pkg.name);
      const hasConfigs = allConfigs.some((cf: any) => cf.source.includes(pkg.name));
      await ui.packageInstallProgress(pkg.name, hasConfigs, false, packageEntry);
    }
    
    if (toRemove.length > 0) {
      console.log("Package removal simulation:");
      for (const pkg of toRemove) {
        console.log(`  ${icon.remove} Would remove: ${pc.white(pkg.name)}`);
      }
    }
    
    ui.success("Package analysis completed (dry-run mode)");
  }
}

async function handleRealPackageInstall(toInstall: any[], toRemove: any[], configEntries: any[], allConfigs: any[], uniquePackages: string[], options: CommandOptions): Promise<void> {
  if (toRemove.length > 0) {
    await removePackages(toRemove, options);
  }
  
  await upgradeSystemPackages(options);
  
  if (toInstall.length > 0) {
    await installNewPackages(toInstall, configEntries, allConfigs, options);
  }
  
  await updateManagedPackages(uniquePackages);
}

async function removePackages(toRemove: any[], options: CommandOptions): Promise<void> {
  console.log("Package cleanup (removing conflicting packages):");
  for (const pkg of toRemove) {
    console.log(`  ${icon.remove} Removing: ${pc.white(pkg.name)}`);
  }
  
  await safeExecute(
    () => removeUnmanagedPackages(toRemove.map(p => p.name), !options.verbose),
    "Failed to remove packages"
  );
  console.log(`  ${icon.ok} Removed ${toRemove.length} packages`);
  console.log();
}

async function upgradeSystemPackages(options: CommandOptions): Promise<void> {
  const systemUpgradeSpinner = spinner("Upgrading system packages...", { enabled: !options.noSpinner && !options.verbose });
  console.log("Performing system maintenance!");
  
  await safeExecute(async () => {
    if (options.verbose) {
      await $`yay -Syu --noconfirm`;
      console.log(`  ${icon.ok} All packages upgraded to latest versions`);
    } else {
      await $`yay -Syu --noconfirm`.quiet();
      systemUpgradeSpinner.stop("-> done!");
    }
  }, "Failed to upgrade system");
  
  console.log();
}

async function installNewPackages(toInstall: any[], configEntries: any[], allConfigs: any[], options: CommandOptions): Promise<void> {
  ui.installHeader();
  
  for (const pkg of toInstall) {
    const packageEntry = configEntries.find((entry: any) => entry.package === pkg.name);
    const hasConfigs = allConfigs.some((cf: any) => cf.source.includes(pkg.name));
    await ui.packageInstallProgress(pkg.name, hasConfigs, true, packageEntry);
    
    await safeExecute(
      () => installPackages([pkg.name], options.verbose, !options.verbose),
      `Failed to install ${pkg.name}`
    );
    ui.packageInstallComplete(pkg.name, hasConfigs);
  }
}

async function handleConfigs(allConfigs: any[], configEntries: any[], dryRun: boolean): Promise<void> {
  if (allConfigs.length > 0) {
    if (dryRun) {
      const { analyzeConfigsPerPackage } = await import("./dotfiles");
      await analyzeConfigsPerPackage(configEntries);
    } else {
      const { manageConfigsPerPackage } = await import("./dotfiles");
      await manageConfigsPerPackage(configEntries);
    }
  }
}

async function handleSetupScripts(allSetups: string[], dryRun: boolean): Promise<void> {
  if (allSetups.length > 0 && !dryRun) {
    await runSetupScripts(allSetups);
  }
}

export async function main() {
  const [, , cmd, ...args] = process.argv;
  const command = (cmd || "apply") as Command;
  
  if (command === "help" || command === "--help" || command === "-h") {
    showHelp();
    return;
  }
  
  if (command === "version" || command === "--version" || command === "-v") {
    showVersion();
    return;
  }
  
  if (!COMMANDS.includes(command)) {
    ui.error(`Unknown command: ${command}`);
    console.log("Run 'owl help' for usage information.");
    process.exit(1);
  }
  
  // Ensure owl directory structure exists early
  ensureOwlDirectories();
  
  await ensureYayInstalled();
  
  const options: CommandOptions = {
    noSpinner: args.includes("--no-spinner"),
    verbose: args.includes("--verbose")
  };
  
  const upgradeMode = command === "upgrade" || command === "up";
  const dryRun = command === "dry-run" || command === "dr";
  
  if (upgradeMode) {
    await handleUpgradeCommand(options);
  } else if (command === "uninstall") {
    await handleUninstallCommand(options);
  } else {
    await handleApplyCommand(dryRun, options);
  }
}
