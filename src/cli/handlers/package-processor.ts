/**
 * Package processing utilities for the apply command
 */

import { ui, spinner, icon } from "../../ui";
import pc from "picocolors";
import { hostname } from "os";
import { safeExecute } from "../../utils/errors";
import { updateManagedPackages, removeUnmanagedPackages, installPackages, planPackageActions } from "../../modules/packages";
import { cleanupEnvironmentVariablesForRemovedPackages } from "./apply";
import {
  isVCSPackage,
  loadVCSStore,
  saveVCSStore,
  getForeignPackages,
  filterVCSPackages,
  checkVCSUpdate,
  updateVCSInfo
} from "../../modules/vcs";
import type { CommandOptions } from "../commands";
import type { ConfigEntry, ConfigMapping, PackageAction } from "../../types";
import type { VCSStore } from "../../modules/vcs";

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
   const packageActions = await planPackageActions(uniquePackages);
   analysisSpinner.stop("Analysis complete");

   // Separate packages into install and remove lists
   const toInstall = packageActions.filter(p => p.status === 'install');
   const toRemove = packageActions.filter(p => p.status === 'remove');

   // Show info section
   ui.sectionHeader("Info", "red");
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
      // streamMode=true disables artificial UI delays
      await ui.packageInstallProgress(pkg.name, hasConfigs, true, packageEntry);
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
    // Remove packages that are no longer in config
    if (toRemove.length > 0) {
      await removePackages(toRemove, configEntries, options);
    }

    // Upgrade system packages
    await upgradeSystemPackages(options, aurAvailable);

    // Install new packages
    if (toInstall.length > 0) {
      await installNewPackages(toInstall, configEntries, allConfigs, options, aurAvailable);
    }

    // Update managed packages tracking
    await updateManagedPackages(uniquePackages);
 }

/**
 * Remove packages that are no longer in config
 */
async function removePackages(toRemove: PackageAction[], configEntries: ConfigEntry[], options: CommandOptions): Promise<void> {
   ui.showPackageCleanup(toRemove);

   // Clean up environment variables for removed packages
   await cleanupEnvironmentVariablesForRemovedPackages(toRemove, configEntries);

   await safeExecute(
     () => removeUnmanagedPackages(toRemove.map(p => p.name), !options.verbose),
     "Failed to remove packages"
   );
   ui.showPackagesRemoved(toRemove.length);
 }

   /**
    * Upgrade system packages with comprehensive flow matching Go version
    */
    async function upgradeSystemPackages(options: CommandOptions, aurAvailable: boolean = true): Promise<void> {
        const { PacmanManager } = await import("../../modules/pacman/manager");
        const pacmanManager = new PacmanManager();

        ui.sectionHeader("System", "yellow");
        ui.showSystemMaintenance();

       if (!aurAvailable) {
         //console.log("Warning: AUR is currently unavailable. Skipping AUR package upgrades.");
       }

       await safeExecute(async () => {
         // Analyze system packages (spinner like Go version)
         const analysisSpinner = spinner("Analyzing system packages...", { enabled: !options.noSpinner && !options.verbose });

         // Get outdated packages from both official repos and AUR
         const outdatedPackages = await getOutdatedPackages(options, aurAvailable);

         if (!options.verbose) {
           analysisSpinner.stop(`Found ${outdatedPackages.length} packages to upgrade`);
         }

         if (outdatedPackages.length === 0) {
           return;
         }

         // Show overview like Go version
         const hostname = require('os').hostname();
         ui.overview({
           host: hostname,
           packages: outdatedPackages.length
         });

         // Show packages to upgrade
         ui.showPackagesToUpgrade(outdatedPackages);

         // Start upgrade spinner
         const upgradeSpinner = spinner(`Upgrading ${outdatedPackages.length} packages...`, { enabled: !options.noSpinner && !options.verbose });

         // Separate AUR packages from official packages for different handling
         const { aurPackagesToUpgrade, officialPackagesToUpgrade } = await separatePackagesBySource(outdatedPackages, aurAvailable);

         // Upgrade official packages first using system upgrade
         if (officialPackagesToUpgrade.length > 0) {
           const progressCallback = !options.verbose ? (message: string) => {
             upgradeSpinner.update(message);
           } : null;

           await pacmanManager.upgradeSystemWithProgress(options.verbose, progressCallback);
         }

         // Handle AUR packages using normal install workflow (which will trigger updates)
         if (aurPackagesToUpgrade.length > 0) {
           const { AURManager } = await import("../../modules/aur/manager");
           const aurManager = new AURManager();

           for (const aurPkg of aurPackagesToUpgrade) {
             // Use the InstallOrUpgradePackage method with progress callback for detailed steps
             const progressCallback = !options.verbose ? (message: string) => {
               upgradeSpinner.update(message);
             } : null;

             await aurManager.installOrUpgradePackageWithProgress(aurPkg, options.verbose, progressCallback);
           }

           aurManager.release();
         }

         if (options.verbose) {
           ui.showAllPackagesUpgraded();
         } else {
           upgradeSpinner.stop("All packages upgraded!");
         }

         ui.celebration("All packages upgraded!");
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

    // Install updated VCS packages using AUR manager
    const { AURManager } = await import("../../modules/aur/manager");
    const aurManager = new AURManager();

    for (const packageName of packagesNeedingUpdate) {
      try {
        const vcsSpinner = spinner(`Upgrading VCS package ${packageName}...`, { enabled: !options.noSpinner && !options.verbose });

        // Use the new InstallOrUpgradePackage method that bypasses the "already installed" check
        await aurManager.installOrUpgradePackage(packageName, options.verbose);

        // Update VCS info after successful install
        await updateVCSInfo(packageName, vcsStore);

        if (!options.verbose) {
          vcsSpinner.stop(`Updated ${packageName}`);
        } else {
          console.log(`  ${icon.ok} Updated ${packageName}`);
        }
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

      // Create a spinner that will be updated with progress
      const installSpinner = spinner(`Preparing ${pkg.name}`, { enabled: !options.noSpinner && !options.verbose });

      try {
        // Define progress callback to update spinner with detailed stages
        const progressCallback = (message: string) => {
          if (!options.verbose && installSpinner) {
            installSpinner.update(message);
          }
        };

        // Use the pacman manager directly for installation with progress reporting
        const { PacmanManager } = await import("../../modules/pacman/manager");
        const pacmanManager = new PacmanManager();

        await safeExecute(
          () => pacmanManager.installPackage(pkg.name, options.verbose, progressCallback),
          `Failed to install ${pkg.name}`
        );

        if (!options.verbose) {
          installSpinner.stop("installed");
        }

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
        // Check if this is an AUR-related error that we should handle gracefully
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("AUR") || errorMessage.includes("aur.archlinux.org") ||
            errorMessage.includes("TLS handshake timeout") || errorMessage.includes("timeout")) {
          if (!options.verbose) {
            installSpinner.fail(`Skipped (AUR unavailable): ${pkg.name}`);
          }
          console.log(`Warning: Skipping ${pkg.name} due to AUR connectivity issues: ${errorMessage}`);
          continue; // Continue with next package instead of failing completely
        }

        // For non-AUR errors, still fail completely
        if (!options.verbose) {
          installSpinner.fail(`Failed: ${errorMessage}`);
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
    }

   // Save VCS store if it was updated
   if (vcsStoreUpdated) {
     await saveVCSStore(vcsStore);
   }
}

  /**
   * Get outdated packages from both official repos and AUR
   */
  async function getOutdatedPackages(options: CommandOptions, aurAvailable: boolean): Promise<string[]> {
    const { PacmanManager } = await import("../../modules/pacman/manager");
    const pacmanManager = new PacmanManager();

    let outdatedPackages: string[] = [];

    // Get outdated official packages
    try {
      const officialOutdated = await pacmanManager.getOutdatedPackages();
      outdatedPackages = [...outdatedPackages, ...officialOutdated];
    } catch (error) {
      if (options.verbose) {
        console.warn(`Warning: Failed to check official packages: ${error}`);
      }
    }

     // Get AUR packages that need updates if AUR is available
     if (aurAvailable) {
       try {
         const { getForeignPackages } = await import("../../modules/vcs");
         const foreignPackages = await getForeignPackages();

         if (foreignPackages.length > 0) {
           const { AURManager } = await import("../../modules/aur/manager");
           const aurManager = new AURManager();

           // Batch query AUR for all foreign packages
           const packageNames = foreignPackages.map(pkg => pkg.name);
           const aurClient = await aurManager.getAURClient();
           const aurResp = await aurClient.queryMultiplePackages(packageNames);

           // Build map of AUR versions
           const aurVersions: { [key: string]: string } = {};
           for (const aurPkg of aurResp.results) {
             aurVersions[aurPkg.Name] = aurPkg.Version;
           }

           // Compare versions for each foreign package
           for (const localPkg of foreignPackages) {
             if (aurVersions[localPkg.name]) {
               // Skip VCS packages unless devel updates are enabled
               const { isVCSPackage } = await import("../../modules/vcs");
               if (isVCSPackage(localPkg.name) && !options.devel) {
                 continue;
               }

               // Compare versions
               const { isPackageNewer } = await import("../../modules/pacman/query");
               if (localPkg.version && localPkg.name) {
                 const aurVersion = aurVersions[localPkg.name];
                 if (aurVersion) {
                   const isNewer = await isPackageNewer(localPkg.version, aurVersion);
                   if (isNewer) {
                     outdatedPackages.push(localPkg.name);
                   }
                 }
               }
             }
           }

           aurManager.release();
         }
       } catch (error) {
         if (options.verbose) {
           console.warn(`Warning: AUR update check failed: ${error}`);
         }
       }
     }

    return outdatedPackages;
  }

  /**
   * Separate packages into AUR and official repository packages
   */
  async function separatePackagesBySource(outdatedPackages: string[], aurAvailable: boolean): Promise<{
    aurPackagesToUpgrade: string[];
    officialPackagesToUpgrade: string[];
  }> {
    const aurPackagesToUpgrade: string[] = [];
    const officialPackagesToUpgrade: string[] = [];

    if (!aurAvailable) {
      // If AUR is not available, treat all as official
      return {
        aurPackagesToUpgrade: [],
        officialPackagesToUpgrade: outdatedPackages
      };
    }

    // Build a set of AUR package names for quick lookup
    const { getForeignPackages } = await import("../../modules/vcs");
    const foreignPackages = await getForeignPackages();
    const aurPackageSet = new Set(foreignPackages.map((pkg: { name: string; version: string }) => pkg.name));

    for (const pkg of outdatedPackages) {
      if (aurPackageSet.has(pkg)) {
        aurPackagesToUpgrade.push(pkg);
      } else {
        officialPackagesToUpgrade.push(pkg);
      }
    }

    return { aurPackagesToUpgrade, officialPackagesToUpgrade };
  }

  // Import functions that are needed
  async function manageServices(services: any[]): Promise<void> {
   const { ensureServicesConfigured } = await import("../../modules/services");
   // Normalize legacy string[] to specs
   const specs = (services || []).map((s: any) => typeof s === 'string' ? ({ name: s, enable: true, start: true }) : s);
   await ensureServicesConfigured(specs);
   return;
  }

  async function manageEnvironmentVariables(envs: Array<{ key: string; value: string }>): Promise<void> {
   const { manageEnvironmentVariables } = await import("../../modules/env");
    return manageEnvironmentVariables(envs);
  }
