/**
 * Pacman Manager for handling official repository packages with AUR fallback
 */

import { $ } from "bun";
import { AURManager } from "./aur-manager";
import type { SearchResult, ProgressCallback } from "./types";

export interface PacmanManagerOptions {
  useYay?: boolean; // For backward compatibility, but we'll prefer AUR manager
  bypassCache?: boolean;
}

export class PacmanManager {
  private aurFallback: AURManager;

  constructor(options: PacmanManagerOptions = {}) {
    // Use AUR manager as fallback instead of yay
    this.aurFallback = new AURManager({ bypassCache: options.bypassCache });
  }

  /**
   * Install a single package using pacman first, falls back to AUR
   */
  async installPackage(packageName: string, verbose = false): Promise<void> {
    return this.installPackageWithProgress(packageName, verbose, null);
  }

  /**
   * Install a single package with progress reporting
   */
  async installPackageWithProgress(
    packageName: string,
    verbose = false,
    progressCallback: ProgressCallback | null
  ): Promise<void> {
    if (verbose) {
      console.log(`Checking if package ${packageName} is already installed...`);
    }

    // Check if package is already installed
    if (await this.isPackageInstalled(packageName)) {
      if (verbose) {
        console.log(`Package ${packageName} is already installed`);
      }
      if (progressCallback) {
        progressCallback(`${packageName} already installed`);
      }
      return;
    }

    // Try pacman first for official repositories
    if (progressCallback) {
      progressCallback(`Searching ${packageName} in official repositories`);
    }

    if (verbose) {
      console.log(`Attempting to install ${packageName} from official repositories...`);
    }

    try {
      // Check if package exists in official repositories
      await $`pacman -Si ${packageName}`.quiet();

      // Package exists in official repos, install with pacman
      if (verbose) {
        await $`sudo pacman -S --noconfirm ${packageName}`.quiet();
      } else {
        await $`sudo pacman -S --noconfirm ${packageName}`.quiet();
      }

      if (verbose) {
        console.log(`Successfully installed ${packageName} from official repositories`);
      }

      if (progressCallback) {
        progressCallback(`Successfully installed ${packageName} from official repositories`);
      }

    } catch {
      // Package not found in official repositories, try AUR
      if (progressCallback) {
        progressCallback(`${packageName} not in official repositories, trying AUR`);
      }

      if (verbose) {
        console.log(`Package ${packageName} not found in official repositories, trying AUR...`);
      }

      // Fall back to AUR manager
      await this.aurFallback.installPackageWithProgress(packageName, verbose, progressCallback);
    }
  }

  /**
   * Install multiple packages using pacman first, falls back to AUR
   */
  async installPackages(packages: string[], verbose = false): Promise<void> {
    if (packages.length === 0) return;

    // Separate packages into official repo and potential AUR packages
    const { repoPackages, aurPackages } = await this.categorizePackages(packages, verbose);

    // Install official repository packages with pacman
    if (repoPackages.length > 0) {
      if (verbose) {
        console.log(`Installing ${repoPackages.length} packages from official repositories: ${repoPackages.join(', ')}`);
      }

      try {
        if (verbose) {
          await $`sudo pacman -S --noconfirm ${repoPackages}`.quiet();
        } else {
          await $`sudo pacman -S --noconfirm ${repoPackages}`.quiet();
        }
      } catch (error) {
        throw new Error(`Pacman install failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Install AUR packages
    if (aurPackages.length > 0) {
      if (verbose) {
        console.log(`Installing ${aurPackages.length} packages from AUR: ${aurPackages.join(', ')}`);
      }

      await this.aurFallback.installPackages(aurPackages, verbose);
    }
  }

  /**
   * Remove a package using pacman
   */
  async removePackage(packageName: string): Promise<void> {
    // Check if the package is actually installed
    if (!(await this.isPackageInstalled(packageName))) {
      return;
    }

    try {
      await $`sudo pacman -Rns --noconfirm ${packageName}`.quiet();
    } catch (error) {
      throw new Error(`Pacman remove failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Upgrade system packages
   */
  async upgradeSystem(verbose = false): Promise<void> {
    return this.upgradeSystemWithProgress(verbose, null);
  }

  /**
   * Upgrade system packages with progress reporting
   */
  async upgradeSystemWithProgress(
    verbose = false,
    progressCallback: ProgressCallback | null
  ): Promise<void> {
    // First upgrade official repository packages with pacman
    if (progressCallback) {
      progressCallback("Synchronizing package databases");
    }

    try {
      if (verbose) {
        console.log("Upgrading official repository packages...");
        await $`sudo pacman -Syu --noconfirm`.quiet();
      } else {
        await $`sudo pacman -Syu --noconfirm`.quiet();
      }
    } catch (error) {
      throw new Error(`Pacman upgrade failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (progressCallback) {
      progressCallback("Upgrading system packages");
    }

    // Then check for AUR package updates
    if (verbose) {
      console.log("Checking for AUR package updates...");
    }

    try {
      await this.aurFallback.upgradeSystemWithProgress(verbose, progressCallback);
    } catch (error) {
      if (verbose) {
        console.log(`AUR upgrade check failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (progressCallback) {
      progressCallback("System upgrade completed successfully");
    }
  }

  /**
   * Search for packages using pacman first, then AUR
   */
  async searchPackages(searchTerm: string): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Search official repositories with pacman
    try {
      const pacmanOutput = await $`pacman -Ss ${searchTerm}`.text();
      const pacmanResults = this.parsePacmanSearchOutput(pacmanOutput);
      results.push(...pacmanResults);
    } catch {
      // Ignore pacman search errors
    }

    // Search AUR for comprehensive results
    try {
      const aurResults = await this.aurFallback.searchPackages(searchTerm);

      // Filter out duplicates (packages that exist in both repo and AUR)
      const existingNames = new Set(results.map(r => r.name));

      for (const aurResult of aurResults) {
        if (!existingNames.has(aurResult.name)) {
          results.push(aurResult);
        }
      }
    } catch {
      // Ignore AUR search errors
    }

    return results;
  }

  /**
   * Get list of installed packages using pacman
   */
  async getInstalledPackages(): Promise<string[]> {
    try {
      const output = await $`pacman -Qq`.text();
      return output.split('\n').filter(Boolean);
    } catch (error) {
      throw new Error(`Pacman list failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get list of outdated packages using pacman
   */
  async getOutdatedPackages(): Promise<string[]> {
    try {
      const output = await $`pacman -Qu`.text();
      const outdated: string[] = [];

      for (const line of output.split('\n')) {
        if (line.trim()) {
          const parts = line.split(/\s+/);
          if (parts.length > 0) {
            outdated.push(parts[0]);
          }
        }
      }

      return outdated;
    } catch {
      // If no updates available, pacman returns exit code 1 but no error output
      return [];
    }
  }

  /**
   * Check if a package is installed using pacman
   */
  async isPackageInstalled(packageName: string): Promise<boolean> {
    try {
      await $`pacman -Qq ${packageName}`.quiet();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Categorize packages into official repo and AUR packages
   */
  private async categorizePackages(packages: string[], verbose = false): Promise<{
    repoPackages: string[];
    aurPackages: string[];
  }> {
    const repoPackages: string[] = [];
    const aurPackages: string[] = [];

    for (const pkg of packages) {
      if (verbose) {
        console.log(`Checking package: ${pkg}`);
      }

      // Check if already installed
      if (await this.isPackageInstalled(pkg)) {
        if (verbose) {
          console.log(`  ${pkg} is already installed`);
        }
        continue;
      }

      // Check if package exists in official repositories
      try {
        await $`pacman -Si ${pkg}`.quiet();
        repoPackages.push(pkg);
        if (verbose) {
          console.log(`  ${pkg} found in official repositories`);
        }
      } catch {
        // Check if it's a package group
        try {
          await $`pacman -Sg ${pkg}`.quiet();
          repoPackages.push(pkg);
          if (verbose) {
            console.log(`  ${pkg} is a package group in official repositories`);
          }
        } catch {
          aurPackages.push(pkg);
          if (verbose) {
            console.log(`  ${pkg} not found in official repositories, will try AUR`);
          }
        }
      }
    }

    return { repoPackages, aurPackages };
  }

  /**
   * Parse pacman search output into SearchResult structs
   */
  private parsePacmanSearchOutput(output: string): SearchResult[] {
    const results: SearchResult[] = [];
    const lines = output.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Check if this is a package line (starts with repo/package)
      if (line.includes('/') && !line.startsWith('    ')) {
        const parts = line.split(/\s+/, 2);
        if (parts.length < 2) continue;

        const fullName = parts[0];
        const versionInfo = parts[1];

        // Parse repository and package name
        const nameParts = fullName.split('/');
        if (nameParts.length !== 2) continue;

        const repository = nameParts[0];
        const packageName = nameParts[1];

        // Extract version from the version info
        let version = '';
        if (versionInfo.includes(' ')) {
          version = versionInfo.split(' ')[0];
        } else {
          version = versionInfo;
        }

        // Get description from next line if available
        let description = '';
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1].trim();
          if (nextLine.startsWith('    ')) {
            description = nextLine.trim();
            i++; // Skip the description line in next iteration
          }
        }

        // Check if package is installed
        let installed = false;
        if (versionInfo.includes('[installed')) {
          installed = true;
        }

        results.push({
          name: packageName,
          version,
          description,
          repository,
          installed,
          inConfig: false
        });
      }
    }

    return results;
  }

  /**
   * Release resources
   */
  release(): void {
    this.aurFallback.release();
  }
}