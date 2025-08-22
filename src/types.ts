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