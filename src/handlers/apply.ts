/**
 * Apply command handler for Owl package manager
 */

import { ui, spinner, icon } from "../ui";
import { loadConfigForHost } from "../config";
import { runSetupScripts } from "../setup";
import {
  analyzePackages,
  installPackages,
  updateManagedPackages,
  removeUnmanagedPackages,
  type PackageAction
} from "../packages";
import { hostname } from "os";
import pc from "picocolors";
import { $ } from "bun";
import { safeExecute } from "../utils/errors";
import type { CommandOptions } from "../commands";
import type { ConfigEntry, ConfigMapping } from "../types";

/**
 * Apply configuration changes to the system
 * Supports both normal apply and dry-run modes
 */
export async function handleApplyCommand(dryRun: boolean, options: CommandOptions): Promise<void> {
  // Load and parse all configuration files for this host
  const configEntries = await safeExecute(
    () => loadConfigForHost(hostname()),
    "Failed to load configuration"
  );

  // Extract all packages, dotfile configs, and setup scripts
  const allPackages = configEntries.map(entry => entry.package);
  const allDotfileConfigs = configEntries.flatMap(entry => entry.configs || []);
  const allSetupScripts = configEntries.flatMap(entry => entry.setups || []);

  ui.header(dryRun ? "Dry run" : "Apply");

  // Remove duplicate packages
  const uniquePackages = [...new Set(allPackages)];

  // Process packages if any are configured
  if (uniquePackages.length > 0) {
    await processPackages(uniquePackages, configEntries, allDotfileConfigs, dryRun, options);
  }

  // Process dotfile configurations and setup scripts
  await processConfigs(allDotfileConfigs, configEntries, dryRun);
  await processSetupScripts(allSetupScripts, dryRun);

  // Show completion message
  if (dryRun) {
    ui.success("Dry run completed successfully - no changes made");
  } else {
    ui.celebration(":: System sync complete ::");
  }
}

/**
 * Process package analysis and installation/removal
 */
async function processPackages(
  uniquePackages: string[],
  configEntries: ConfigEntry[],
  allConfigs: ConfigMapping[],
  dryRun: boolean,
  options: CommandOptions
): Promise<void> {
  // Analyze what packages need to be installed or removed
  const analysisSpinner = spinner("Analyzing package status...", { enabled: !options.noSpinner });
  const packageActions = await analyzePackages(uniquePackages);
  analysisSpinner.stop("Analysis complete");

  // Separate packages into install and remove lists
  const toInstall = packageActions.filter(p => p.status === 'install');
  const toRemove = packageActions.filter(p => p.status === 'remove');

  // Show overview of what will be done
  ui.overview({
    host: hostname(),
    packages: uniquePackages.length
  });

  // Show packages that will be removed
  if (toRemove.length > 0) {
    showPackagesToRemove(toRemove);
  }

  // Execute the appropriate action based on dry-run mode
  if (dryRun) {
    await showDryRunResults(toInstall, toRemove, configEntries, allConfigs);
  } else {
    await performPackageInstallation(toInstall, toRemove, configEntries, allConfigs, uniquePackages, options);
  }
}

/**
 * Display packages that will be removed
 */
function showPackagesToRemove(toRemove: PackageAction[]): void {
  console.log("Packages to remove (no longer in config):");
  for (const pkg of toRemove) {
    console.log(`  ${icon.remove} ${pc.white(pkg.name)}`);
  }
  console.log();
}

/**
 * Show dry run results without making changes
 */
async function showDryRunResults(
  toInstall: PackageAction[],
  toRemove: PackageAction[],
  configEntries: ConfigEntry[],
  allConfigs: ConfigMapping[]
): Promise<void> {
  if (toInstall.length > 0 || toRemove.length > 0) {
    ui.installHeader();

    for (const pkg of toInstall) {
      const packageEntry = configEntries.find((entry: ConfigEntry) => entry.package === pkg.name);
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

/**
 * Perform actual package installation
 */
async function performPackageInstallation(
  toInstall: PackageAction[],
  toRemove: PackageAction[],
  configEntries: ConfigEntry[],
  allConfigs: ConfigMapping[],
  uniquePackages: string[],
  options: CommandOptions
): Promise<void> {
  if (toRemove.length > 0) {
    await removePackages(toRemove, options);
  }

  await upgradeSystemPackages(options);

  if (toInstall.length > 0) {
    await installNewPackages(toInstall, configEntries, allConfigs, options);
  }

  await updateManagedPackages(uniquePackages);
}

/**
 * Remove packages that are no longer in config
 */
async function removePackages(toRemove: PackageAction[], options: CommandOptions): Promise<void> {
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

/**
 * Upgrade system packages
 */
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

/**
 * Install new packages
 */
async function installNewPackages(
  toInstall: PackageAction[],
  configEntries: ConfigEntry[],
  allConfigs: ConfigMapping[],
  options: CommandOptions
): Promise<void> {
  ui.installHeader();

  for (const pkg of toInstall) {
    const packageEntry = configEntries.find((entry: ConfigEntry) => entry.package === pkg.name);
    const hasConfigs = allConfigs.some((cf: ConfigMapping) => cf.source.includes(pkg.name));
    await ui.packageInstallProgress(pkg.name, hasConfigs, true, packageEntry);

    await safeExecute(
      () => installPackages([pkg.name], options.verbose, !options.verbose),
      `Failed to install ${pkg.name}`
    );
    ui.packageInstallComplete(pkg.name, hasConfigs);
  }
}

/**
 * Process configuration management
 */
async function processConfigs(
  allConfigs: ConfigMapping[],
  configEntries: ConfigEntry[],
  dryRun: boolean
): Promise<void> {
  if (allConfigs.length > 0) {
    if (dryRun) {
      const { analyzeConfigsPerPackage } = await import("../dotfiles");
      await analyzeConfigsPerPackage(configEntries);
    } else {
      const { manageConfigsPerPackage } = await import("../dotfiles");
      await manageConfigsPerPackage(configEntries);
    }
  }
}

/**
 * Process setup script execution
 */
async function processSetupScripts(allSetups: string[], dryRun: boolean): Promise<void> {
  if (allSetups.length > 0 && !dryRun) {
    await runSetupScripts(allSetups);
  }
}