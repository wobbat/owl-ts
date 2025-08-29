import { $ } from "bun";

/**
 * Pacman query helpers
 */

export async function getInstalledPackages(): Promise<string[]> {
  try {
    const output = await $`pacman -Qq`.text();
    return output.split('\n').filter(Boolean);
  } catch (error) {
    throw new Error(`Pacman list failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function isInstalled(packageName: string): Promise<boolean> {
  try {
    await $`pacman -Qq ${packageName}`.quiet();
    return true;
  } catch {
    return false;
  }
}

export async function isGroupInstalled(groupName: string): Promise<boolean> {
  try {
    const output = await $`pacman -Sg ${groupName}`.text();
    const lines = output.trim().split('\n');
    const pkgs: string[] = [];
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const pkg = parts[1];
        if (pkg && pkg !== groupName) pkgs.push(pkg);
      }
    }
    for (const pkg of pkgs) {
      if (await isInstalled(pkg)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function getInstalledVersion(packageName: string): Promise<string | undefined> {
  try {
    if (await isInstalled(packageName)) {
      const output = await $`pacman -Q ${packageName}`.text();
      const match = output.match(new RegExp(`${packageName}\\s+([\\S]+)`));
      return match ? match[1] : undefined;
    }
    if (await isGroupInstalled(packageName)) {
      return "group";
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function isPackageNewer(installedVersion: string, availableVersion: string): Promise<boolean> {
  try {
    const result = await $`vercmp ${installedVersion} ${availableVersion}`.text();
    const comparison = parseInt(result.trim(), 10);
    return comparison < 0;
  } catch {
    return installedVersion !== availableVersion;
  }
}
