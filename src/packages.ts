import { $ } from "bun";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { getHomeDirectory, ensureOwlDirectories } from "./utils/fs";

export async function ensureYayInstalled(): Promise<void> {
  try {
    await $`which yay`.quiet();
    return;
  } catch {
    console.log("yay not found. Installing yay...");
    await installYay();
  }
}

async function installYay(): Promise<void> {
  const tempDir = '/tmp/yay-install';
  
  try {
    // Import spinner here to avoid circular dependencies
    const { spinner } = await import("./ui");
    
    const prereqSpinner = spinner("Installing yay prerequisites...", { enabled: true });
    try {
      await $`sudo pacman -S --needed --noconfirm git base-devel`.quiet();
      prereqSpinner.stop("Prerequisites installed");
    } catch (error: any) {
      prereqSpinner.fail("Failed to install prerequisites");
      throw error;
    }
    
    const cloneSpinner = spinner("Downloading yay from AUR...", { enabled: true });
    try {
      await $`rm -rf ${tempDir}`.quiet().catch(() => {});
      await $`git clone https://aur.archlinux.org/yay.git ${tempDir}`.quiet();
      cloneSpinner.stop("Downloaded yay source");
    } catch (error: any) {
      cloneSpinner.fail("Failed to download yay");
      throw error;
    }
    
    const buildSpinner = spinner("Building and installing yay...", { enabled: true });
    try {
      const proc = Bun.spawn(['makepkg', '-si', '--noconfirm'], {
        cwd: tempDir,
        stdout: 'pipe',
        stderr: 'pipe'
      });
      
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        buildSpinner.fail("Failed to build yay");
        throw new Error(`makepkg failed with exit code ${exitCode}`);
      }
      
      buildSpinner.stop("yay installed successfully");
    } catch (error: any) {
      buildSpinner.fail("Failed to build yay");
      throw error;
    }
    
    await $`rm -rf ${tempDir}`.quiet().catch(() => {});
    
  } catch (error) {
    await $`rm -rf ${tempDir}`.quiet().catch(() => {});
    throw new Error(`Failed to install yay: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface PackageInfo {
  name: string;
  installedVersion?: string;
  availableVersion?: string;
  status: 'not_installed' | 'up_to_date' | 'outdated';
}

export interface PackageAction {
  name: string;
  status: 'install' | 'skip' | 'remove';
  version?: string;
}

interface ManagedPackage {
  first_managed: string;
  last_seen: string;
  installed_version?: string;
  auto_installed: boolean;
}

interface ManagedLock {
  schema_version: string;
  packages: Record<string, ManagedPackage>;
  protected_packages: string[];
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
    const installed = await $`yay -Q ${packageName}`.text();
    const match = installed.match(new RegExp(`${packageName}\\s+([\\S]+)`));
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

async function getInstalled(): Promise<Set<string>> {
  try {
    const output = await $`yay -Qq`.text();
    return new Set(output.split("\n").filter(Boolean));
  } catch (error) {
    throw new Error(`Failed to get installed packages: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function getPackageInfo(packageName: string): Promise<PackageInfo> {
  try {
    // Check if package is installed and get version
    let installedVersion: string | undefined;
    try {
      const installed = await $`yay -Q ${packageName}`.text();
      const match = installed.match(new RegExp(`${packageName}\\s+([\\S]+)`));
      if (match) {
        installedVersion = match[1];
      }
    } catch {
      // Package not installed
    }

    // Get available version
    let availableVersion: string | undefined;
    try {
      const available = await $`yay -Si ${packageName}`.text();
      const versionMatch = available.match(/Version\s*:\s*([^\s\n]+)/);
      if (versionMatch) {
        availableVersion = versionMatch[1];
      }
    } catch {
      // Package not found in repos
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
  
  try {
    if (spinnerMode) {
      // Import spinner here to avoid circular dependencies
      const { spinner } = await import("./ui");
      const removeSpinner = spinner(`Removing ${packagesToRemove.length} packages...`, { enabled: true });
      
      try {
        await $`yay -Rns --noconfirm ${packagesToRemove}`.quiet();
        removeSpinner.stop(`Removed ${packagesToRemove.length} packages successfully`);
      } catch (error: any) {
        removeSpinner.fail(`Failed to remove packages`);
        throw error;
      }
    } else {
      await $`yay -Rns --noconfirm ${packagesToRemove}`.quiet();
    }
    
    // Remove from managed.lock
    for (const pkg of packagesToRemove) {
      delete managedLock.packages[pkg];
    }
    
    saveManagedLock(managedLock);
  } catch (error: any) {
    throw new Error(`Package removal failed: ${error?.stderr?.toString() || error?.message || "Unknown error"}`);
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
  
  try {
    if (spinnerMode) {
      // Import spinner here to avoid circular dependencies
      const { spinner } = await import("./ui");
      const installSpinner = spinner(`Package - installing...`, { enabled: true });
      
      try {
        await $`yay -S --needed --noconfirm ${packages}`.quiet();
        installSpinner.stop(`installed successfully`);
      } catch (error: any) {
        installSpinner.fail(`installation failed`);
        throw error;
      }
    } else if (streamOutput) {
      await installPackagesWithStreaming(packages);
    } else {
      await $`yay -S --needed ${packages}`.quiet();
    }
  } catch (error: any) {
    throw new Error(`Package installation failed: ${error?.stderr?.toString() || error?.message || "Unknown error"}`);
  }
}

async function installPackagesWithStreaming(packages: string[]): Promise<void> {
  const proc = Bun.spawn(['yay', '-S', '--needed', '--noconfirm', ...packages], {
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'inherit'
  });

  let lastLine = '';
  let currentDisplayLine = '';
  const decoder = new TextDecoder();
  
  const reader = proc.stdout.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n');
      
      // Process each line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] || '';
        
        if (i === lines.length - 1 && !text.endsWith('\n')) {
          // This is a partial line, save it for next iteration
          lastLine = line;
        } else {
          // Complete line (including empty lines from line breaks)
          const fullLine = lastLine + line;
          lastLine = '';
          
          if (fullLine.trim()) {
            // Only show the latest non-empty line, clearing the previous one
            currentDisplayLine = fullLine.trim();
            process.stdout.write('\r\x1b[K'); // Clear line
            process.stdout.write(`  ${currentDisplayLine}`);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Package installation failed with exit code ${exitCode}`);
  }
  
  // Clear the streaming line and move to next line
  process.stdout.write('\r\x1b[K\n');
}

