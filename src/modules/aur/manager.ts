/**
 * AUR Manager for installing AUR packages using git clone + makepkg
 */

import { $ } from "bun";
import { runWithOutput, runQuiet } from "../../utils/proc";

import { existsSync, mkdirSync, rmSync } from "fs";
import { AURClient } from "./client";
import type { AURPackage, SearchResult, ProgressCallback } from "../../types";
import { isInstalled as qIsInstalled } from "../pacman/query";

export interface AURManagerOptions {
  enableDevel?: boolean;
  bypassCache?: boolean;
}

export class AURManager {
  private aurClient: AURClient;
  constructor(options: AURManagerOptions = {}) {
    this.aurClient = new AURClient({ bypassCache: options.bypassCache });
  }

  /**
   * Install a single AUR package
   */
  async installPackage(packageName: string, verbose = false): Promise<void> {
    return this.installPackageWithProgress(packageName, verbose, null);
  }

  /**
   * Install or upgrade a package (bypasses "already installed" check)
   */
  async installOrUpgradePackage(packageName: string, verbose = false): Promise<void> {
    return this.installOrUpgradePackageWithProgress(packageName, verbose, null);
  }

  /**
   * Install a single AUR package with progress reporting
   */
  async installPackageWithProgress(
    packageName: string,
    verbose = false,
    progressCallback: ProgressCallback | null
  ): Promise<void> {
    // Check if package is already installed
    if (await qIsInstalled(packageName)) {
      if (verbose) {
        console.log(`Package ${packageName} is already installed`);
      }
      return;
    }

    return this.installOrUpgradePackageWithProgress(packageName, verbose, progressCallback);
  }

  /**
   * Install or upgrade a package with inline spinner progress reporting
   */
  async installOrUpgradePackageWithProgress(
     packageName: string,
     verbose = false,
     progressCallback: ProgressCallback | null
   ): Promise<void> {
     // Query AUR for package info (don't show this step to keep it clean)
     await this.aurClient.queryPackage(packageName);

     // Create temporary directory for building
     const tmpDir = `/tmp/aur-${packageName}`;

     try {
       // Clean up any existing temp directory
       if (existsSync(tmpDir)) {
         rmSync(tmpDir, { recursive: true, force: true });
       }

       mkdirSync(tmpDir, { recursive: true });

       if (progressCallback) {
         progressCallback(`Cloning ${packageName} repository`);
       }

       // Clone AUR repository
       const gitUrl = `https://aur.archlinux.org/${packageName}.git`;
       await $`git clone ${gitUrl} ${tmpDir}`.quiet();

       if (progressCallback) {
         progressCallback(`Building ${packageName} from AUR`);
       }

       // Build and install package
       const makepkgCmd = $`makepkg -si --rmdeps --noconfirm`.cwd(tmpDir);

       if (verbose) {
         await makepkgCmd;
       } else {
         await makepkgCmd.quiet();
       }

       if (progressCallback) {
         progressCallback(`Successfully installed ${packageName}`);
       }

     } finally {
       // Clean up temporary directory
       try {
         if (existsSync(tmpDir)) {
           rmSync(tmpDir, { recursive: true, force: true });
         }
       } catch {
         // Ignore cleanup errors
       }
     }
   }

  /**
   * Install multiple AUR packages
   */
  async installPackages(packages: string[], verbose = false): Promise<void> {
    if (packages.length === 0) return;

    for (const pkg of packages) {
      if (verbose) {
        console.log(`Installing AUR package: ${pkg}`);
      }

      try {
        await this.installPackage(pkg, verbose);
      } catch (error) {
        throw new Error(`Failed to install AUR package ${pkg}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Remove an AUR package using pacman
   */
  async removePackage(packageName: string): Promise<void> {
    // Check if the package is actually installed
    if (!(await qIsInstalled(packageName))) {
      return;
    }

    try {
      await runQuiet("sudo", ["pacman", "-Rns", "--noconfirm", packageName], { timeoutMs: 300000 });
    } catch (error) {
      throw new Error(`Pacman remove failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Upgrade all AUR packages
   */
  async upgradeSystem(verbose = false): Promise<void> {
    return this.upgradeSystemWithProgress(verbose, null);
  }

  /**
   * Upgrade all AUR packages with progress reporting
   */
  async upgradeSystemWithProgress(
    verbose = false,
    progressCallback: ProgressCallback | null
  ): Promise<void> {
    // Get list of foreign (AUR) packages
    const foreignPackages = await this.getInstalledPackages();

    if (foreignPackages.length === 0) {
      if (verbose) {
        console.log("No AUR packages found");
      }
      return;
    }

    if (progressCallback) {
      progressCallback("Checking AUR packages for updates");
    }

    // Check for updates by comparing versions
    const packagesToUpdate = await this.getOutdatedPackages();

    if (packagesToUpdate.length === 0) {
      if (verbose) {
        console.log("All AUR packages are up to date");
      }
      if (progressCallback) {
        progressCallback("All AUR packages are up to date");
      }
      return;
    }

    if (verbose) {
      console.log(`Found ${packagesToUpdate.length} AUR packages to update: ${packagesToUpdate.join(', ')}`);
    }

    // Update packages
    for (const pkg of packagesToUpdate) {
      if (progressCallback) {
        progressCallback(`Updating ${pkg} from AUR`);
      }

      try {
        await this.installOrUpgradePackageWithProgress(pkg, verbose, progressCallback);
      } catch (error) {
        console.error(`Failed to update ${pkg}: ${error instanceof Error ? error.message : String(error)}`);
        // Continue with other packages
      }
    }

    if (progressCallback) {
      progressCallback("AUR package upgrade completed");
    }
  }

  /**
   * Search for packages in the AUR
   */
  async searchPackages(searchTerm: string): Promise<SearchResult[]> {
    try {
      const aurResp = await this.aurClient.searchPackages(searchTerm);

      const results: SearchResult[] = [];
      for (const pkg of aurResp.results) {
        results.push({
          name: pkg.Name,
          version: pkg.Version,
          description: pkg.Description,
          repository: "aur",
          installed: await qIsInstalled(pkg.Name),
          inConfig: false // Not tracked by owl config in this context
        });
      }

      return results;
    } catch (error) {
      throw new Error(`AUR search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Optimized search for packages in the AUR with batched installation checks
   */
  async searchPackagesOptimized(searchTerm: string, installedPackages?: Set<string>): Promise<SearchResult[]> {
    try {
      const aurResp = await this.aurClient.searchPackages(searchTerm);

      const results: SearchResult[] = [];
      for (const pkg of aurResp.results) {
        const isInstalled = installedPackages
          ? installedPackages.has(pkg.Name)
          : await qIsInstalled(pkg.Name);

        results.push({
          name: pkg.Name,
          version: pkg.Version,
          description: pkg.Description,
          repository: "aur",
          installed: isInstalled,
          inConfig: false // Not tracked by owl config in this context
        });
      }

      return results;
    } catch (error) {
      throw new Error(`AUR search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get list of installed AUR packages
   */
  async getInstalledPackages(): Promise<string[]> {
    try {
      const output = await runWithOutput("pacman", ["-Qm"], { timeoutMs: 15000 });
      const packages: string[] = [];

      for (const line of output.split('\n')) {
        if (line.trim()) {
          const parts = line.split(/\s+/);
          if (parts.length > 0 && parts[0]) {
            packages.push(parts[0]);
          }
        }
      }

      return packages;
    } catch (error) {
      throw new Error(`Failed to get installed AUR packages: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get list of outdated AUR packages
   */
  async getOutdatedPackages(): Promise<string[]> {
    const installed = await this.getInstalledPackages();

    if (installed.length === 0) {
      return [];
    }

    // Query AUR for current versions
    const aurResp = await this.aurClient.queryMultiplePackages(installed);

    // Create map of AUR package info
    const aurPackages = new Map<string, AURPackage>();
    for (const pkg of aurResp.results) {
      aurPackages.set(pkg.Name, pkg);
    }

    const outdated: string[] = [];

    // Check each installed package against AUR version
    for (const pkgName of installed) {
      const aurPkg = aurPackages.get(pkgName);
      if (!aurPkg) {
        // Package no longer exists in AUR, skip
        continue;
      }

      // Get installed version
      try {
        const versionOutput = await runWithOutput("pacman", ["-Q", pkgName], { timeoutMs: 10000 });
        const installedVersion = (versionOutput.split(/\s+/)[1] || "");
        if (!installedVersion) { continue; }

        // Compare versions using pacman's vercmp
        try {
          const result = await runWithOutput("vercmp", [installedVersion, aurPkg.Version], { timeoutMs: 5000 });
          const comparison = parseInt(result.trim(), 10);
          if (comparison < 0) {
            outdated.push(pkgName);
          }
        } catch {
          // Fall back to string comparison if vercmp fails
          if (installedVersion !== aurPkg.Version) {
            outdated.push(pkgName);
          }
        }
      } catch {
        // Skip if we can't get version
        continue;
      }
    }

    return outdated;
  }

  /**
   * Check if a package is installed
   */
  // Installation checks are handled via pacman/query helpers





  /**
   * Get the AUR client for direct access
   */
  getAURClient(): AURClient {
    return this.aurClient;
  }

  /**
   * Release resources (no-op for AUR manager)
   */
  release(): void {
    // No resources to clean up
  }
}
