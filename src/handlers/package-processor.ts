/**
 * Package processing utilities for the apply command
 */

import { ui, spinner, icon } from "../ui";
import pc from "picocolors";
import { hostname } from "os";
import { safeExecute } from "../utils/errors";
import { updateManagedPackages, removeUnmanagedPackages, installPackages, analyzePackages } from "../packages";
import { cleanupEnvironmentVariablesForRemovedPackages } from "./apply";
import { 
  isVCSPackage, 
  loadVCSStore, 
  saveVCSStore, 
  getForeignPackages, 
  filterVCSPackages, 
  checkVCSUpdate,
  updateVCSInfo
} from "../vcs";
import type { CommandOptions } from "../commands";
import type { ConfigEntry, ConfigMapping, PackageAction } from "../types";
import type { VCSStore } from "../vcs";

/**
 * Process package analysis and installation/removal
 */
export async function processPackages(
   uniquePackages: string[],
   configEntries: ConfigEntry[],
   allDotfileConfigs: ConfigMapping[],
   dryRun: boolean,
   options: CommandOptions,
   aurAvailable: boolean = true
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
     await showDryRunResults(toInstall, toRemove, configEntries, allDotfileConfigs);
   } else {
     await performPackageInstallation(toInstall, toRemove, configEntries, allDotfileConfigs, uniquePackages, options, aurAvailable);
   }
}

/**
 * Display packages that will be removed
 */
function showPackagesToRemove(toRemove: PackageAction[]): void {
  console.log("Packages to remove (no longer in config):");
  for (const pkg of toRemove) {
    console.log(`  ${icon.remove} ${pc.cyan(pkg.name)}`);
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
        console.log(`  ${icon.remove} Would remove: ${pc.cyan(pkg.name)}`);
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
   options: CommandOptions,
   aurAvailable: boolean = true
 ): Promise<void> {
   if (toRemove.length > 0) {
     await removePackages(toRemove, configEntries, options);
   }

   await upgradeSystemPackages(options, aurAvailable);

   if (toInstall.length > 0) {
     await installNewPackages(toInstall, configEntries, allConfigs, options, aurAvailable);
   }

   await updateManagedPackages(uniquePackages);
}

/**
 * Remove packages that are no longer in config
 */
async function removePackages(toRemove: PackageAction[], configEntries: ConfigEntry[], options: CommandOptions): Promise<void> {
  console.log("Package cleanup (removing conflicting packages):");
  for (const pkg of toRemove) {
    console.log(`  ${icon.remove} Removing: ${pc.cyan(pkg.name)}`);
  }

  // Clean up environment variables for removed packages
  await cleanupEnvironmentVariablesForRemovedPackages(toRemove, configEntries);

  await safeExecute(
    () => removeUnmanagedPackages(toRemove.map(p => p.name), !options.verbose),
    "Failed to remove packages"
  );
  console.log(`  ${icon.ok} Removed ${toRemove.length} packages`);
  console.log();
}

/**
 * Upgrade system packages with VCS package support
 */
async function upgradeSystemPackages(options: CommandOptions, aurAvailable: boolean = true): Promise<void> {
   const { PacmanManager } = await import("../pacman-manager");
   const pacmanManager = new PacmanManager();
   const systemUpgradeSpinner = spinner("Upgrading system packages...", { enabled: !options.noSpinner && !options.verbose });
   console.log("Performing system maintenance!");

   if (!aurAvailable) {
     console.log("Warning: AUR is currently unavailable. Skipping AUR package upgrades.");
   }

   await safeExecute(async () => {
     if (options.verbose) {
       await pacmanManager.upgradeSystem(true);
       console.log(`  ${icon.ok} All packages upgraded to latest versions`);
     } else {
       await pacmanManager.upgradeSystem(false);
       systemUpgradeSpinner.stop("-> done!");
     }
   }, "Failed to upgrade system");

   // Handle VCS packages if available and devel updates are enabled
   if (aurAvailable && options.devel) {
     await handleVCSPackageUpgrades(options);
   }

   console.log();
}

/**
 * Handle VCS package upgrades (similar to yay --devel)
 */
async function handleVCSPackageUpgrades(options: CommandOptions): Promise<void> {
  try {
    // Get foreign packages (AUR packages)
    const foreignPackages = await getForeignPackages();
    
    // Filter for VCS packages
    const vcsPackages = filterVCSPackages(foreignPackages);
    
    if (vcsPackages.length === 0) {
      if (options.verbose) {
        console.log("No VCS packages found");
      }
      return;
    }

    if (options.verbose) {
      console.log(`Found ${vcsPackages.length} VCS packages to check`);
    }

    // Load VCS store
    const vcsStore = await loadVCSStore();

    // Check for updates
    const packagesNeedingUpdate: string[] = [];
    
    for (const packageName of vcsPackages) {
      try {
        const needsUpdate = await checkVCSUpdate(packageName, vcsStore);
        if (needsUpdate) {
          packagesNeedingUpdate.push(packageName);
        }
      } catch (error) {
        if (options.verbose) {
          console.warn(`Warning: Could not check VCS updates for ${packageName}: ${error}`);
        }
      }
    }

    if (packagesNeedingUpdate.length === 0) {
      if (options.verbose) {
        console.log("All VCS packages are up to date");
      }
      return;
    }

    console.log(`Found ${packagesNeedingUpdate.length} VCS packages with updates: ${packagesNeedingUpdate.join(", ")}`);

    // Install updated VCS packages
    for (const packageName of packagesNeedingUpdate) {
      try {
        console.log(`Upgrading VCS package: ${pc.cyan(packageName)}`);
        
        // Use force install to trigger rebuild
        const { installPackages } = await import("../packages");
        await installPackages([packageName], options.verbose, !options.verbose);
        
        // Update VCS info after successful install
        await updateVCSInfo(packageName, vcsStore);
        
        console.log(`  ${icon.ok} Updated ${packageName}`);
      } catch (error) {
        console.warn(`Warning: Failed to update VCS package ${packageName}: ${error}`);
      }
    }

    // Save updated VCS store
    await saveVCSStore(vcsStore);

    console.log(`Updated ${packagesNeedingUpdate.length} VCS packages`);
  } catch (error) {
    if (options.verbose) {
      console.warn(`Warning: VCS package checking failed: ${error}`);
    }
  }
}

/**
 * Install new packages with VCS info tracking
 */
async function installNewPackages(
   toInstall: PackageAction[],
   configEntries: ConfigEntry[],
   allConfigs: ConfigMapping[],
   options: CommandOptions,
   aurAvailable: boolean = true
 ): Promise<void> {
   ui.installHeader();

   // Load VCS store for tracking VCS packages
   const vcsStore = await loadVCSStore();
   let vcsStoreUpdated = false;

   for (const pkg of toInstall) {
     const packageEntry = configEntries.find((entry: ConfigEntry) => entry.package === pkg.name);
     const hasConfigs = allConfigs.some((cf: ConfigMapping) => cf.source.includes(pkg.name));
     await ui.packageInstallProgress(pkg.name, hasConfigs, true, packageEntry);

     try {
       await safeExecute(
         () => installPackages([pkg.name], options.verbose, !options.verbose),
         `Failed to install ${pkg.name}`
       );

       // Update VCS info if this is a VCS package
       if (isVCSPackage(pkg.name) && aurAvailable) {
         try {
           await updateVCSInfo(pkg.name, vcsStore);
           vcsStoreUpdated = true;
         } catch (error) {
           if (options.verbose) {
             console.warn(`Warning: Could not update VCS info for ${pkg.name}: ${error}`);
           }
         }
       }
     } catch (error) {
       const errorMessage = error instanceof Error ? error.message : String(error);
       if (errorMessage.includes("AUR") || errorMessage.includes("aur.archlinux.org")) {
         if (!aurAvailable) {
           console.log(`  ${icon.skip} Skipped ${pkg.name} (AUR unavailable)`);
           continue;
         }
       }
       throw error;
     }

     // Manage services for this package if any
     const configEntry = configEntries.find((entry: ConfigEntry) => entry.package === pkg.name);
     if (configEntry?.services && configEntry.services.length > 0) {
       await safeExecute(
         () => manageServices(configEntry.services!),
         `Failed to manage services for ${pkg.name}`
       );
     }

     // Manage environment variables for this package if any
     if (configEntry?.envs && configEntry.envs.length > 0) {
       await safeExecute(
         () => manageEnvironmentVariables(configEntry.envs!),
         `Failed to manage environment variables for ${pkg.name}`
       );
     }

     ui.packageInstallComplete(pkg.name, hasConfigs);
   }

   // Save VCS store if it was updated
   if (vcsStoreUpdated) {
     await saveVCSStore(vcsStore);
   }
}

// Import functions that are needed
async function manageServices(services: string[]): Promise<void> {
  const { manageServices } = await import("../services");
  return manageServices(services);
}

async function manageEnvironmentVariables(envs: Array<{ key: string; value: string }>): Promise<void> {
  const { manageEnvironmentVariables } = await import("../environment");
   return manageEnvironmentVariables(envs);
}