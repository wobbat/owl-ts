/**
 * Constants used throughout the Owl package manager
 */

// File paths and directories
export const OWL_ROOT_DIR = '.owl';
export const OWL_STATE_DIR = '.state';
export const OWL_DOTFILES_DIR = 'dotfiles';
export const OWL_SETUP_DIR = 'setup';
export const OWL_HOSTS_DIR = 'hosts';
export const OWL_GROUPS_DIR = 'groups';
export const MANAGED_LOCK_FILE = 'managed.lock';

// Configuration file extensions
export const CONFIG_EXTENSIONS = ['.owl'] as const;

// Setup script extensions
export const SETUP_EXTENSIONS = ['.sh', '.js', '.ts'] as const;

// Timing constants (in milliseconds) - optimized for better performance
export const SPINNER_FRAME_INTERVAL = 80;
export const PACKAGE_INSTALL_DELAY = 150;
export const DOTFILES_INSTALL_DELAY = 100;

// Exit codes
export const EXIT_SUCCESS = 0;
export const EXIT_FAILURE = 1;

// Package manager commands
export const PACMAN = 'pacman';

// Default protected packages that should never be auto-removed
export const DEFAULT_PROTECTED_PACKAGES = [
  'base', 'base-devel', 'linux', 'linux-firmware', 'linux-headers',
  'systemd', 'systemd-sysvcompat', 'dbus', 'dbus-broker',
  'grub', 'systemd-boot', 'refind', 'bootctl',
  'bash', 'zsh', 'fish', 'coreutils', 'util-linux', 'filesystem',
  'pacman', 'pacman-contrib', 'archlinux-keyring', 'ca-certificates',
  'networkmanager', 'dhcpcd', 'iwd', 'wpa_supplicant',
  'sudo', 'polkit', 'glibc', 'gcc-libs', 'binutils', 'gawk', 'sed', 'grep'
] as const;

// Schema version for managed lock file
export const SCHEMA_VERSION = '1.0';

// UI constants
export const SPINNER_FRAMES = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"];

// Error messages
export const ERROR_MESSAGES = {
  UNKNOWN_COMMAND: 'Unknown command',
  CONFIG_NOT_FOUND: 'Configuration file not found',
  PACKAGE_INSTALL_FAILED: 'Package installation failed',
  PACKAGE_REMOVAL_FAILED: 'Package removal failed',
  INVALID_CONFIG: 'Invalid configuration',
  CIRCULAR_DEPENDENCY: 'Circular dependency detected'
} as const;