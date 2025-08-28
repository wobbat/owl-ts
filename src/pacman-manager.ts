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
      // Check if package exists in official repositories (individual package)
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
      // Package not found as individual package, check if it's a package group
      try {
        await $`pacman -Sg ${packageName}`.quiet();

        // Check if package group is already installed
        if (await this.isPackageGroupInstalled(packageName)) {
          if (verbose) {
            console.log(`Package group ${packageName} is already installed`);
          }
          return;
        }

        // Package group exists in official repos, install with pacman
        if (verbose) {
          console.log(`Installing package group ${packageName} from official repositories...`);
          await $`sudo pacman -S --noconfirm ${packageName}`.quiet();
        } else {
          await $`sudo pacman -S --noconfirm ${packageName}`.quiet();
        }

        if (verbose) {
          console.log(`Successfully installed package group ${packageName} from official repositories`);
        }

        if (progressCallback) {
          progressCallback(`Successfully installed package group ${packageName} from official repositories`);
        }

      } catch {
        // Package not found in official repositories (neither individual nor group), try AUR
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
   * Get list of outdated packages using pacman
   */
  async getOutdatedPackages(): Promise<string[]> {
    try {
      const output = await $`pacman -Qu`.text();
      const outdated: string[] = [];

      for (const line of output.split('\n')) {
        if (line.trim()) {
          const parts = line.split(/\s+/);
          if (parts.length > 0 && parts[0]) {
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

    // Also check if the search term is a package group
    try {
      const groupOutput = await $`pacman -Sg ${searchTerm}`.text();
      if (groupOutput.trim()) {
        // If it's a package group, add it as a result
        results.unshift({
          name: searchTerm,
          version: "group",
          description: `Package group containing multiple packages`,
          repository: "core",
          installed: await this.isPackageInstalled(searchTerm),
          inConfig: false
        });
      }
    } catch {
      // Ignore group search errors
    }

    // Search AUR for comprehensive results
    try {
      const aurResults = await this.aurFallback.searchPackagesOptimized(searchTerm);

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

    // Sort results to match yay's ordering
    return this.sortSearchResults(results, searchTerm);
  }

  /**
   * Sort search results to match yay's ordering algorithm
   */
  private sortSearchResults(results: SearchResult[], searchTerm: string): SearchResult[] {
    const queryTerms = searchTerm.toLowerCase().split(/\s+/);

    return results.sort((a, b) => {
      // Helper function to calculate relevance score
      const getRelevanceScore = (pkg: SearchResult): number => {
        const name = pkg.name.toLowerCase();
        const desc = pkg.description?.toLowerCase() || "";

        let score = 0;

        // For compound searches (multiple terms)
        if (queryTerms.length > 1) {
          // Count how many search terms are matched
          let matches = 0;
          for (const term of queryTerms) {
            if (name.includes(term) || desc.includes(term)) {
              matches++;
            }
          }

          // Base score on percentage of terms matched
          const matchRatio = matches / queryTerms.length;
          if (matchRatio === 1.0) score += 120; // All terms matched
          else if (matchRatio >= 0.5) score += 80; // At least half matched
          else if (matches > 0) score += 40; // Some terms matched

          // Bonus for exact compound matches (like "neovim-git" for "neovim git")
          const compoundName = queryTerms.join('-');
          if (name.includes(compoundName)) score += 50;

          const compoundNameUnderscore = queryTerms.join('_');
          if (name.includes(compoundNameUnderscore)) score += 50;
        } else {
          // Single term search
          const query = queryTerms[0];
          if (!query) return 0;

          // Exact match gets highest score
          if (name === query) return 100;

          // Starts with query gets high score
          if (name.startsWith(query)) return 90;

          // Contains query as substring gets medium score
          if (name.includes(query)) return 50;

          // Fuzzy matching - contains all characters in order
          let queryIndex = 0;
          for (const char of name) {
            if (char === query[queryIndex]) {
              queryIndex++;
              if (queryIndex === query.length) return 30;
            }
          }
        }

        return score;
      };

      const aScore = getRelevanceScore(a);
      const bScore = getRelevanceScore(b);

      // Higher relevance score comes first
      if (aScore !== bScore) {
        return bScore - aScore;
      }

      // Within same relevance level:

      // 1. Official repositories come before AUR
      const aOfficial = a.repository !== "aur";
      const bOfficial = b.repository !== "aur";
      if (aOfficial !== bOfficial) {
        return aOfficial ? -1 : 1;
      }

      // 2. Installed packages come before uninstalled
      if (a.installed !== b.installed) {
        return a.installed ? -1 : 1;
      }

      // 3. For AUR packages, sort by votes/popularity (if available)
      if (a.repository === "aur" && b.repository === "aur") {
        const aVotes = (a as any).votes || 0;
        const bVotes = (b as any).votes || 0;
        if (aVotes !== bVotes) {
          return bVotes - aVotes; // Higher votes first
        }
      }

      // 4. Finally, sort alphabetically
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Optimized search for packages using pacman first, then AUR with batched installation checks
   */
  async searchPackagesOptimized(searchTerm: string, installedPackages?: Set<string>): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Search official repositories with pacman
    try {
      const pacmanOutput = await $`pacman -Ss ${searchTerm}`.text();
      const pacmanResults = this.parsePacmanSearchOutput(pacmanOutput);

      // Update installation status using batched data if available
      if (installedPackages) {
        pacmanResults.forEach(result => {
          result.installed = installedPackages.has(result.name);
        });
      }

      results.push(...pacmanResults);
    } catch {
      // Ignore pacman search errors
    }

    // Also check if the search term is a package group
    try {
      const groupOutput = await $`pacman -Sg ${searchTerm}`.text();
      if (groupOutput.trim()) {
        // If it's a package group, add it as a result
        const isInstalled = installedPackages
          ? installedPackages.has(searchTerm)
          : await this.isPackageInstalled(searchTerm);

        results.unshift({
          name: searchTerm,
          version: "group",
          description: `Package group containing multiple packages`,
          repository: "core",
          installed: isInstalled,
          inConfig: false
        });
      }
    } catch {
      // Ignore group search errors
    }

    // Search AUR for comprehensive results
    try {
      const aurResults = await this.aurFallback.searchPackagesOptimized(searchTerm, installedPackages);

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

     // Sort results to match yay's ordering
     return this.sortSearchResults(results, searchTerm);
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
   * Check if a package is installed
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
   * Check if a package group is installed (by checking if any of its packages are installed)
   */
  async isPackageGroupInstalled(groupName: string): Promise<boolean> {
    try {
      // Get the list of packages in the group
      const output = await $`pacman -Sg ${groupName}`.text();
      const lines = output.trim().split('\n');
      const groupPackages: string[] = [];

      for (const line of lines) {
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const pkg = parts[1];
          if (pkg && pkg !== groupName) {
            groupPackages.push(pkg);
          }
        }
      }

      // Check if any package from the group is installed
      for (const pkg of groupPackages) {
        if (await this.isPackageInstalled(pkg)) {
          return true;
        }
      }

      return false;
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
      const line = lines[i];
      if (!line) continue;
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Check if this is a package line (starts with repo/package)
      if (line.includes('/') && !line.startsWith('    ')) {
        const parts = line.split(/\s+/, 2);
        if (parts.length < 2) continue;

        const fullName = parts[0];
        const versionInfo = parts[1];

        if (!fullName || !versionInfo) continue;

        // Parse repository and package name
        const nameParts = fullName.split('/');
        if (nameParts.length !== 2) continue;

        const repository = nameParts[0];
        const packageName = nameParts[1];

        if (!repository || !packageName) continue;

        // Extract version from the version info
        let version = '';
        if (versionInfo.includes(' ')) {
          version = versionInfo.split(' ')[0] || '';
        } else {
          version = versionInfo;
        }

        // Get description from next line if available
        let description = '';
        if (i + 1 < lines.length) {
          const nextLineRaw = lines[i + 1];
          if (nextLineRaw) {
            const nextLine = nextLineRaw.trim();
            if (nextLine.startsWith('    ')) {
              description = nextLine.trim();
              i++; // Skip the description line in next iteration
            }
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