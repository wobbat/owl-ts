/**
 * Type definitions for Owl package manager
 */

export interface ConfigEntry {
  package: string;
  configs: ConfigMapping[];
  setups: string[];
  services?: string[];
  envs?: Array<{ key: string; value: string }>;
  sourceFile?: string;
  sourceType?: 'main' | 'host' | 'group';
  groupName?: string;
}

export interface ConfigMapping {
  source: string;
  destination: string;
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

export interface ManagedPackage {
  first_managed: string;
  last_seen: string;
  installed_version?: string;
  auto_installed: boolean;
}

export interface ManagedLock {
  schema_version: string;
  packages: Record<string, ManagedPackage>;
  protected_packages: string[];
}

export interface HostStats {
  host: string;
  packages: number;
}

export interface SpinnerOptions {
  enabled?: boolean;
  color?: (s: string) => string;
}

export interface ListOptions {
  indent?: boolean;
  numbered?: boolean;
  color?: (s: string) => string;
}

export interface PackageEntry {
  sourceType?: 'main' | 'host' | 'group';
  sourceFile?: string;
  groupName?: string;
}

// AUR-related types
export interface AURPackage {
  ID: number;
  Name: string;
  PackageBaseID: number;
  PackageBase: string;
  Version: string;
  Description: string;
  URL: string;
  NumVotes: number;
  Popularity: number;
  OutOfDate: number | null;
  Maintainer: string;
  FirstSubmitted: number;
  LastModified: number;
  URLPath: string;
  Depends: string[];
  MakeDepends: string[];
  OptDepends: string[];
  Conflicts: string[];
  Provides: string[];
  Replaces: string[];
  Groups: string[];
  License: string[];
  Keywords: string[];
}

export interface AURResponse {
  version: number;
  type: string;
  resultcount: number;
  results: AURPackage[];
}

export interface SearchResult {
  name: string;
  version: string;
  description: string;
  repository: string;
  installed: boolean;
  inConfig: boolean;
}

export interface AURClientOptions {
  bypassCache?: boolean;
  cacheDir?: string;
}

export interface AURBudget {
  resetAt: Date;
  usedCalls: number;
  maxCalls: number;
  budgetFile: string;
}

export type ProgressCallback = (message: string) => void;

// Add command specific types
export interface AddCommandOptions {
  noSpinner: boolean;
  verbose: boolean;
  debug: boolean;
  devel: boolean;
  useLibALPM: boolean;
  bypassCache: boolean;
  exact?: string;
  file?: string;
  source?: "repo" | "aur" | "any";
  yes?: boolean;
  json?: boolean;
  all?: boolean;
  dryRun?: boolean;
  aur?: boolean;
  repo?: boolean;
  limit?: number;
  asdeps?: boolean;
  asexplicit?: boolean;
  noconfirm?: boolean;
  needed?: boolean;
  timeupdate?: boolean;
  foreign?: boolean;
  explicit?: boolean;
  deps?: boolean;
  unrequired?: boolean;
}

