import { $ } from "bun";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getHomeDirectory, ensureOwlDirectories } from "./utils/fs";
import { PacmanManager } from "./pacman-manager";
import type { PackageInfo, PackageAction, ManagedPackage, ManagedLock } from "./types";

// Global pacman manager instance
let pacmanManager: PacmanManager | null = null;

/**
 * Get or create the pacman manager instance
 */
function getPacmanManager(): PacmanManager {
  if (!pacmanManager) {
    pacmanManager = new PacmanManager();
  }
  return pacmanManager;
}

/**
 * Ensure that pacman is available (no need for yay anymore)
 */
export async function ensurePacmanAvailable(): Promise<void> {
  try {
    await $`which pacman`.quiet();
    return;
  } catch {
    throw new Error("pacman is not available on this system. This tool requires pacman");
  }
}



// Critical system packages that should NEVER be auto-removed
const DEFAULT_PROTECTED_PACKAGES = [
  'base', 'base-devel', 'linux', 'linux-firmware', 'linux-headers',
  'systemd', 'systemd-sysvcompat', 'dbus', 'dbus-broker',
  'grub', 'systemd-boot', 'refind', 'bootctl',
  'bash', 'zsh', 'fish', 'coreutils', 'util-linux', 'filesystem',
  'pacman', 'pacman-contrib', 'archlinux-keyring', 'ca-certificates',
  'networkmanager', 'dhcpcd', 'iwd', 'wpa_supplicant',
  'sudo', 'polkit', 'glibc', 'gcc-libs', 'binutils', 'gawk', 'sed', 'grep'
];

function loadManagedLock(): ManagedLock {
  const home = getHomeDirectory();
  const lockPath = join(home, '.owl', '.state', 'managed.lock');
  
  try {
    if (existsSync(lockPath)) {
      const content = readFileSync(lockPath, 'utf8');
      const lock = JSON.parse(content);
      
      // Ensure protected packages list is up to date
      lock.protected_packages = lock.protected_packages || DEFAULT_PROTECTED_PACKAGES;
      return lock;
    }
  } catch {
    // Ignore errors, use default
  }
  
  return {
    schema_version: "1.0",
    packages: {},
    protected_packages: DEFAULT_PROTECTED_PACKAGES
  };
}

function saveManagedLock(lock: ManagedLock): void {
  ensureOwlDirectories();
  const home = getHomeDirectory();
  const lockPath = join(home, '.owl', '.state', 'managed.lock');
  writeFileSync(lockPath, JSON.stringify(lock, null, 2), 'utf8');
}

async function getInstalledVersion(packageName: string): Promise<string | undefined> {
  try {
    const manager = getPacmanManager();
    if (await manager.isPackageInstalled(packageName)) {
      const output = await $`pacman -Q ${packageName}`.text();
      const match = output.match(new RegExp(`${packageName}\\s+([\\S]+)`));
      return match ? match[1] : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function getInstalled(): Promise<Set<string>> {
  try {
    const manager = getPacmanManager();
    const packages = await manager.getInstalledPackages();
    return new Set(packages);
  } catch (error) {
    throw new Error(`Failed to get installed packages: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function getPackageInfo(packageName: string): Promise<PackageInfo> {
  try {
    const manager = getPacmanManager();

    // Check if package is installed and get version
    let installedVersion: string | undefined;
    if (await manager.isPackageInstalled(packageName)) {
      try {
        const output = await $`pacman -Q ${packageName}`.text();
        const match = output.match(new RegExp(`${packageName}\\s+([\\S]+)`));
        if (match) {
          installedVersion = match[1];
        }
      } catch {
        // Package not installed
      }
    }

    // Get available version by searching
    let availableVersion: string | undefined;
    try {
      const searchResults = await manager.searchPackages(packageName);
      const exactMatch = searchResults.find(r => r.name === packageName);
      if (exactMatch) {
        availableVersion = exactMatch.version;
      }
    } catch {
      // Package not found
    }

    let status: PackageInfo['status'] = 'not_installed';
    if (installedVersion) {
      // For -git packages, always consider them up_to_date since they track HEAD
      // and version comparisons are unreliable due to commit-based versioning
      if (packageName.endsWith('-git')) {
        status = 'up_to_date';
      } else if (availableVersion && installedVersion !== availableVersion) {
        status = 'outdated';
      } else {
        status = 'up_to_date';
      }
    }

    return {
      name: packageName,
      installedVersion,
      availableVersion,
      status
    };
  } catch (error) {
    throw new Error(`Failed to get package info for ${packageName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function validateManagedPackages(packageNames: string[], managedLock: ManagedLock): Promise<void> {
  const now = new Date().toISOString();
  let lockUpdated = false;
  
  for (const pkg of packageNames) {
    // Check if package is installed but not in managed.lock
    if (!managedLock.packages[pkg]) {
      const installedVersion = await getInstalledVersion(pkg);
      if (installedVersion) {
        // Package is installed but not tracked - add it to managed.lock
        managedLock.packages[pkg] = {
          first_managed: now,
          last_seen: now,
          installed_version: installedVersion,
          auto_installed: false
        };
        lockUpdated = true;
      }
    }
  }
  
  // Save the updated lock if we made changes
  if (lockUpdated) {
    saveManagedLock(managedLock);
  }
}

export async function analyzePackages(packageNames: string[]): Promise<PackageAction[]> {
  const actions: PackageAction[] = [];
  const managedLock = loadManagedLock();
  
  // First, validate and update managed.lock with any missing packages that are already installed
  await validateManagedPackages(packageNames, managedLock);
  
  // Analyze current packages in config - simplified to only check if installed or not
  for (const name of packageNames) {
    try {
      const installedVersion = await getInstalledVersion(name);
      
      if (installedVersion) {
        // Package is installed, mark as skip (will be upgraded by system upgrade)
        actions.push({
          name,
          status: 'skip',
          version: installedVersion
        });
      } else {
        // Package not installed, needs to be installed
        actions.push({
          name,
          status: 'install'
        });
      }
    } catch (error) {
      // If we can't get info, assume it needs to be installed
      actions.push({
        name,
        status: 'install'
      });
    }
  }
  
  // Find packages to remove (in managed.lock but not in current config)
  const currentPackageSet = new Set(packageNames);
  const packagesToRemove = Object.keys(managedLock.packages).filter(pkg => 
    !currentPackageSet.has(pkg) && !managedLock.protected_packages.includes(pkg)
  );
  
  for (const pkg of packagesToRemove) {
    // Check if package is actually installed
    const isInstalled = await getInstalledVersion(pkg);
    if (isInstalled) {
      actions.push({
        name: pkg,
        status: 'remove',
        version: isInstalled
      });
    }
  }
  
  return actions;
}

export async function updateManagedPackages(packageNames: string[]): Promise<void> {
  const managedLock = loadManagedLock();
  const now = new Date().toISOString();
  
  // Update managed packages with current timestamp
  for (const pkg of packageNames) {
    const installedVersion = await getInstalledVersion(pkg);
    
    if (managedLock.packages[pkg]) {
      // Update existing entry
      managedLock.packages[pkg].last_seen = now;
      if (installedVersion) {
        managedLock.packages[pkg].installed_version = installedVersion;
      }
    } else {
      // Add new entry
      managedLock.packages[pkg] = {
        first_managed: now,
        last_seen: now,
        installed_version: installedVersion,
        auto_installed: false
      };
    }
  }
  
  saveManagedLock(managedLock);
}

export async function removeUnmanagedPackages(packagesToRemove: string[], spinnerMode: boolean = true): Promise<void> {
  if (packagesToRemove.length === 0) return;

  const managedLock = loadManagedLock();
  const manager = getPacmanManager();

  try {
    if (spinnerMode) {
      // Import spinner here to avoid circular dependencies
      const { spinner } = await import("./ui");
      const removeSpinner = spinner(`Removing ${packagesToRemove.length} packages...`, { enabled: true });

      try {
        for (const pkg of packagesToRemove) {
          await manager.removePackage(pkg);
        }
        removeSpinner.stop(`Removed ${packagesToRemove.length} packages successfully`);
      } catch (error: any) {
        removeSpinner.fail(`Failed to remove packages`);
        throw error;
      }
    } else {
      for (const pkg of packagesToRemove) {
        await manager.removePackage(pkg);
      }
    }

    // Remove from managed.lock
    for (const pkg of packagesToRemove) {
      delete managedLock.packages[pkg];
    }

    saveManagedLock(managedLock);
  } catch (error: any) {
    throw new Error(`Package removal failed: ${error?.message || "Unknown error"}`);
  }
}

export async function getManagedPackages(): Promise<string[]> {
  const managedLock = loadManagedLock();
  return Object.keys(managedLock.packages);
}

async function getPackagesToRemove(currentPackages: string[]): Promise<string[]> {
  const managedLock = loadManagedLock();
  const currentPackageSet = new Set(currentPackages);
  
  return Object.keys(managedLock.packages).filter(pkg => 
    !currentPackageSet.has(pkg) && 
    !managedLock.protected_packages.includes(pkg)
  );
}

export async function installPackages(packages: string[], streamOutput: boolean = false, spinnerMode: boolean = true): Promise<void> {
  if (packages.length === 0) return;

  const manager = getPacmanManager();

  try {
    if (spinnerMode) {
      // Import spinner here to avoid circular dependencies
      const { spinner } = await import("./ui");
      const installSpinner = spinner(`Installing packages...`, { enabled: true });

      try {
        await manager.installPackages(packages, false);
        installSpinner.stop(`Packages installed successfully`);
      } catch (error: any) {
        installSpinner.fail(`Installation failed`);
        throw error;
      }
    } else if (streamOutput) {
      await installPackagesWithStreaming(packages);
    } else {
      await manager.installPackages(packages, false);
    }
  } catch (error: any) {
    throw new Error(`Package installation failed: ${error?.message || "Unknown error"}`);
  }
}

async function installPackagesWithStreaming(packages: string[]): Promise<void> {
  const manager = getPacmanManager();

  // For streaming, we'll install packages one by one to show progress
  for (const pkg of packages) {
    process.stdout.write(`Installing ${pkg}... `);

    try {
      await manager.installPackageWithProgress(pkg, false, (message) => {
        process.stdout.write('\r\x1b[K'); // Clear line
        process.stdout.write(`  ${message}`);
      });
      process.stdout.write('\r\x1b[K'); // Clear line
      console.log(`✓ ${pkg} installed successfully`);
    } catch (error) {
      process.stdout.write('\r\x1b[K'); // Clear line
      console.log(`✗ ${pkg} failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}

