# Uninstall Strategy for Owl Package Manager

## Overview

This document outlines a safe strategy for implementing uninstall functionality in Owl that avoids removing critical system components while properly cleaning up managed packages, configs, and setup scripts.

## Core Principles

1. **Only manage what we installed**: Only track and uninstall packages that were explicitly managed by Owl
2. **Preserve system integrity**: Never remove critical system packages, even if they appear in configs
3. **Backup before removal**: Create backups of configs and important files before removal
4. **Granular control**: Allow selective uninstalling (packages only, configs only, etc.)

## Implementation Strategy

### 1. Enhanced Lock File Tracking

Extend `owl.lock` to track what Owl has actually installed/managed:

```json
{
  "configs": {
    "~/.config/nvim": {
      "hash": "abc123...",
      "managed_by_owl": true,
      "backup_path": "~/.owl/backups/config/nvim-20250117.tar.gz",
      "installed_at": "2025-01-17T10:30:00Z"
    }
  },
  "setups": {
    "nvim.ts": {
      "hash": "def456...",
      "executed_at": "2025-01-17T10:31:00Z"
    }
  },
  "packages": {
    "neovim": {
      "installed_by_owl": true,
      "version": "0.9.5-1",
      "installed_at": "2025-01-17T10:29:00Z",
      "dependencies": ["luajit", "tree-sitter"] // auto-detected deps
    },
    "git": {
      "installed_by_owl": false, // was already installed
      "version": "2.43.0-1"
    }
  },
  "system_packages": {
    // Critical packages that should NEVER be removed
    "base": true,
    "linux": true,
    "systemd": true,
    "grub": true,
    "networkmanager": true
    // ... populated from system analysis
  }
}
```

### 2. System Package Protection

Maintain a comprehensive list of critical system packages that should never be uninstalled:

- **Base system**: `base`, `base-devel`, `linux`, `linux-firmware`
- **Bootloaders**: `grub`, `systemd-boot`, `refind`
- **Core utilities**: `systemd`, `dbus`, `networkmanager`, `sudo`
- **Shell essentials**: `bash`, `coreutils`, `util-linux`, `filesystem`
- **Package management**: `pacman`, `archlinux-keyring`

### 3. Dependency Management

- **Track auto-installed dependencies**: When installing packages, record which dependencies were auto-installed
- **Smart dependency removal**: Only remove dependencies if they're not needed by other packages
- **Use pacman's orphan detection**: Leverage `pacman -Qtdq` to find orphaned packages safely

### 4. Config Backup and Restoration

Before making any changes to configs:

```bash
# Create timestamped backups
~/.owl/backups/config/nvim-20250117-103000.tar.gz
~/.owl/backups/config/vimrc-20250117-103000.backup

# Track original state
~/.owl/backups/original/config-state-before-owl.json
```

### 5. Uninstall Commands

```bash
# Full uninstall (packages + configs + setups)
owl uninstall --all

# Package-only uninstall
owl uninstall --packages-only

# Config-only removal (restore to pre-owl state)
owl uninstall --configs-only

# Specific package uninstall
owl uninstall neovim

# Dry run to preview what would be removed
owl uninstall --dry-run --all

# Force removal (bypass safety checks) - dangerous!
owl uninstall --force neovim
```

### 6. Safety Checks and Confirmations

1. **Pre-uninstall analysis**: Show exactly what will be removed
2. **Dependency impact analysis**: Show what packages depend on items being removed
3. **Interactive confirmations**: Require explicit user confirmation for risky operations
4. **Rollback capability**: Ability to undo uninstall operations

### 7. Uninstall Process Flow

```
1. Parse uninstall command and target(s)
2. Load owl.lock and analyze current state
3. Determine what was installed/managed by Owl vs. pre-existing
4. Check against protected system packages list
5. Analyze dependencies and impact
6. Create removal plan and show to user
7. Require confirmation for destructive operations
8. Create backups of configs being removed
9. Execute removal in safe order:
   - Stop/disable any services
   - Remove configs (with backup)
   - Remove packages (non-critical only)
   - Clean up orphaned dependencies
   - Update owl.lock
10. Provide rollback instructions
```

### 8. Error Handling and Recovery

- **Atomic operations**: Either complete fully or rollback completely
- **Detailed logging**: Log all removal operations for debugging
- **Recovery mode**: `owl recover` command to restore from backups
- **Partial failure handling**: Continue with safe operations even if some fail

### 9. Special Considerations

#### Config Files in System Locations
- Files in `/etc/` require special handling (backup to `~/.owl/backups/system/`)
- Verify ownership and permissions before removal
- Some configs may be managed by multiple tools

#### User vs System Packages
- Distinguish between user-installed packages and system packages
- Handle AUR packages differently from official repo packages

#### Shared Dependencies
- Don't remove packages that other non-Owl software depends on
- Use `pactree` to analyze dependency trees

### 10. Implementation Priority

1. **Phase 1**: Basic package uninstall with safety checks
2. **Phase 2**: Config backup/restore functionality  
3. **Phase 3**: Smart dependency management
4. **Phase 4**: Full rollback/recovery system
5. **Phase 5**: Advanced features (selective uninstall, etc.)

## Example Usage Scenarios

### Scenario 1: Clean Removal of Development Environment
```bash
# User wants to remove their development setup but keep base system
owl uninstall --dry-run
# Shows: neovim, git-lfs, nodejs, python-pip, custom configs
# Keeps: git (pre-existing), bash, core system

owl uninstall --confirm
# Removes managed packages, restores original configs
```

### Scenario 2: Package-Only Cleanup
```bash
# User wants to remove packages but keep customized configs
owl uninstall --packages-only neovim nodejs
# Removes packages but leaves ~/.config/nvim/ intact
```

### Scenario 3: Emergency Recovery
```bash
# Something went wrong, restore everything
owl recover --from-backup --date 2025-01-17
# Restores packages and configs from specified backup
```

## Security Considerations

- **Privilege escalation**: Some operations require sudo, minimize usage
- **Backup encryption**: Consider encrypting sensitive config backups
- **Path validation**: Prevent directory traversal attacks in backup paths
- **Verification**: Verify backups before performing destructive operations

---

**Note**: This is a design document for future implementation. The uninstall functionality should be implemented gradually with extensive testing, starting with the safest operations first.