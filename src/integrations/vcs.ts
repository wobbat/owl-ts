/**
 * VCS (Version Control System) package support for Owl
 * Handles packages that end with -git, -hg, -svn, etc.
 */

import { $ } from "bun";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getHomeDirectory } from "../utils/fs";

export interface VCSInfo {
  url: string;
  branch: string;
  sha: string;
}

export interface VCSStore {
  originsByPackage: Record<string, VCSInfo[]>;
  cachePath: string;
}

/**
 * Check if a package name suggests it's a VCS package
 */
export function isVCSPackage(packageName: string): boolean {
  return packageName.endsWith("-git") ||
         packageName.endsWith("-hg") ||
         packageName.endsWith("-svn") ||
         packageName.endsWith("-bzr") ||
         packageName.endsWith("-darcs");
}

/**
 * Get VCS type based on package suffix
 */
export function getVCSType(packageName: string): string {
  if (packageName.endsWith("-git")) return "git";
  if (packageName.endsWith("-hg")) return "hg";
  if (packageName.endsWith("-svn")) return "svn";
  if (packageName.endsWith("-bzr")) return "bzr";
  if (packageName.endsWith("-darcs")) return "darcs";
  return "";
}

/**
 * Get the VCS cache file path
 */
function getVCSCachePath(): string {
  const homeDir = getHomeDirectory();
  return join(homeDir, ".cache", "owl", "vcs.json");
}

/**
 * Create a new VCS store
 */
export async function newVCSStore(): Promise<VCSStore> {
  const cachePath = getVCSCachePath();

  // Ensure cache directory exists
  const cacheDir = join(cachePath, "..");
  try {
    mkdirSync(cacheDir, { recursive: true });
  } catch (error) {
    // Directory might already exist, that's fine
  }

  const store: VCSStore = {
    originsByPackage: {},
    cachePath
  };

  // Load existing cache
  try {
    if (existsSync(cachePath)) {
      const content = readFileSync(cachePath, "utf8");
      const parsed = JSON.parse(content);
      store.originsByPackage = parsed.originsByPackage || {};
    }
  } catch (error) {
    // If cache is corrupted, start fresh
  }

  return store;
}

/**
 * Load VCS store from cache
 */
export async function loadVCSStore(): Promise<VCSStore> {
  return newVCSStore();
}

/**
 * Save VCS store to cache
 */
export async function saveVCSStore(store: VCSStore): Promise<void> {
  const content = JSON.stringify({
    originsByPackage: store.originsByPackage
  }, null, 2);
  writeFileSync(store.cachePath, content, "utf8");
}

/**
 * Check if a VCS package needs updating by comparing commit hashes
 */
export async function checkVCSUpdate(packageName: string, store: VCSStore): Promise<boolean> {
  const infos = store.originsByPackage[packageName];
  if (!infos || infos.length === 0) {
    // Package not in cache - need to check it once to establish baseline
    return false;
  }

  // Check remote commits for all VCS sources
  for (const info of infos) {
    try {
      const needsUpdate = await checkRemoteCommit(info);
      if (needsUpdate) {
        return true;
      }
    } catch (error) {
      // If we can't check, assume no update needed to avoid constant rebuilds
      continue;
    }
  }

  return false;
}

/**
 * Check if the remote commit differs from cached commit
 */
async function checkRemoteCommit(info: VCSInfo): Promise<boolean> {
  const branch = info.branch || "HEAD";
  
  try {
    // Using Bun.spawn for timeout control
    const proc = Bun.spawn(["git", "ls-remote", info.url, branch], {
      stdout: "pipe",
      stderr: "pipe"
    });
    
    // Set up timeout
    const timeoutId = setTimeout(() => {
      proc.kill();
    }, 15000);
    
    const result = await proc.exited;
    clearTimeout(timeoutId);
    
    if (result !== 0) {
      return false;
    }
    
    const output = await new Response(proc.stdout).text();
    
    if (!output.trim()) {
      return false;
    }
    
    const lines = output.trim().split("\n");
    const parts = lines[0]?.split(/\s+/);
    
    if (!parts || parts.length === 0) {
      return false;
    }
    
    const remoteCommit = parts[0];
    return remoteCommit !== info.sha;
  } catch (error) {
    // Network error or repo doesn't exist
    return false;
  }
}

/**
 * Get foreign packages (AUR packages) that are currently installed
 */
export async function getForeignPackages(): Promise<Array<{ name: string; version: string }>> {
  try {
    const result = await $`pacman -Qm`.quiet();
    const output = result.text();
    
    return output.trim().split("\n")
      .filter(line => line.trim())
      .map(line => {
        const [name, version] = line.trim().split(" ");
        return { name: name || "", version: version || "" };
      })
      .filter(pkg => pkg.name);
  } catch (error) {
    return [];
  }
}

/**
 * Filter packages to get only VCS packages
 */
export function filterVCSPackages(packages: Array<{ name: string; version: string }>): string[] {
  return packages
    .filter(pkg => isVCSPackage(pkg.name))
    .map(pkg => pkg.name);
}

/**
 * Update VCS info for a package after installation
 */
export async function updateVCSInfo(packageName: string, store: VCSStore): Promise<void> {
  if (!isVCSPackage(packageName)) {
    return; // Not a VCS package
  }

  try {
    // Download PKGBUILD from AUR to extract VCS sources
    const pkgbuildContent = await downloadPKGBUILD(packageName);
    if (!pkgbuildContent) {
      return;
    }

    const sources = parseSourcesFromPKGBUILD(pkgbuildContent);
    const vcsInfos: VCSInfo[] = [];

    for (const source of sources) {
      const info = parseVCSSource(source);
      if (info) {
        // Get current commit for this source
        try {
          const sha = await getCurrentCommit(info);
          info.sha = sha;
          vcsInfos.push(info);
        } catch (error) {
          // If we can't get current commit, store without SHA
          vcsInfos.push(info);
        }
      }
    }

    if (vcsInfos.length > 0) {
      store.originsByPackage[packageName] = vcsInfos;
      await saveVCSStore(store);
    }
  } catch (error) {
    // If we can't update VCS info, that's ok
  }
}

/**
 * Download PKGBUILD from AUR
 */
async function downloadPKGBUILD(packageName: string): Promise<string | null> {
  try {
    const tempDir = `/tmp/owl-vcs-${packageName}-${Date.now()}`;
    const gitURL = `https://aur.archlinux.org/${packageName}.git`;
    
    // Using Bun.spawn for timeout control
    const proc = Bun.spawn(["git", "clone", "--depth=1", gitURL, tempDir], {
      stdout: "pipe",
      stderr: "pipe"
    });
    
    // Set up timeout
    const timeoutId = setTimeout(() => {
      proc.kill();
    }, 30000);
    
    const result = await proc.exited;
    clearTimeout(timeoutId);
    
    if (result !== 0) {
      return null;
    }
    
    const pkgbuildPath = join(tempDir, "PKGBUILD");
    if (existsSync(pkgbuildPath)) {
      const content = readFileSync(pkgbuildPath, "utf8");
      
      // Clean up temp directory
      await $`rm -rf ${tempDir}`.quiet();
      
      return content;
    }
    
    // Clean up temp directory
    await $`rm -rf ${tempDir}`.quiet();
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Parse source URLs from PKGBUILD content
 */
function parseSourcesFromPKGBUILD(content: string): string[] {
  const sources: string[] = [];
  
  // Look for source array definition
  const sourceRegex = /source\s*=\s*\([^)]*\)/gs;
  const matches = content.match(sourceRegex);
  
  if (matches) {
    for (const match of matches) {
      // Extract URLs from the source array
      const urlRegex = /["']([^"']+)["']/g;
      let urlMatch;
      
      while ((urlMatch = urlRegex.exec(match)) !== null) {
        if (urlMatch[1]) {
          sources.push(urlMatch[1]);
        }
      }
    }
  }
  
  return sources;
}

/**
 * Parse a VCS source URL and extract relevant information
 */
function parseVCSSource(source: string): VCSInfo | null {
  // Look for git+ protocol
  if (!source.startsWith("git+")) {
    return null;
  }
  
  // Remove git+ prefix
  let url = source.replace(/^git\+/, "");
  
  // Extract branch if specified
  let branch = "HEAD";
  if (url.includes("#branch=")) {
    const parts = url.split("#branch=");
    if (parts.length === 2) {
      url = parts[0] || "";
      branch = parts[1] || "HEAD";
    }
  } else if (url.includes("#")) {
    // Skip sources with specific commit/tag references
    return null;
  }
  
  return {
    url,
    branch,
    sha: "" // Will be filled later
  };
}

/**
 * Get the current commit SHA for a VCS source
 */
async function getCurrentCommit(info: VCSInfo): Promise<string> {
  const branch = info.branch || "HEAD";
  
  // Using Bun.spawn for timeout control
  const proc = Bun.spawn(["git", "ls-remote", info.url, branch], {
    stdout: "pipe",
    stderr: "pipe"
  });
  
  // Set up timeout
  const timeoutId = setTimeout(() => {
    proc.kill();
  }, 15000);
  
  const result = await proc.exited;
  clearTimeout(timeoutId);
  
  if (result !== 0) {
    throw new Error("Git ls-remote failed");
  }
  
  const output = await new Response(proc.stdout).text();
  
  if (!output.trim()) {
    throw new Error("No output from git ls-remote");
  }
  
  const lines = output.trim().split("\n");
  const parts = lines[0]?.split(/\s+/);
  
  if (!parts || parts.length === 0) {
    throw new Error("Invalid git ls-remote output");
  }
  
  return parts[0] || "";
}

/**
 * Clean orphans removes VCS info for packages that are no longer installed
 */
export async function cleanOrphans(store: VCSStore, installedPackages: string[]): Promise<void> {
  const installedSet = new Set(installedPackages);

  for (const packageName of Object.keys(store.originsByPackage)) {
    if (!installedSet.has(packageName)) {
      delete store.originsByPackage[packageName];
    }
  }
}

/**
 * Initialize VCS info for packages that don't have it yet (gendb functionality)
 */
export async function initializeVCSPackages(vcsPackages: string[]): Promise<number> {
  const store = await loadVCSStore();
  let generatedCount = 0;

  for (const packageName of vcsPackages) {
    if (isVCSPackage(packageName)) {
      // Skip if we already have VCS info for this package
      if (store.originsByPackage[packageName]) {
        continue;
      }

      try {
        await updateVCSInfo(packageName, store);
        generatedCount++;
      } catch (error) {
        // Log error but continue with other packages
        console.warn(`Warning: Failed to initialize VCS info for ${packageName}: ${error}`);
      }
    }
  }

  await saveVCSStore(store);
  return generatedCount;
}
