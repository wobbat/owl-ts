# Owl Configuration File Specification

This document describes the structure, supported directives, and best practices for `.owl` configuration files used by the Owl package and dotfile manager.

## Overview
Owl uses configuration files to manage packages, dotfiles, and setup scripts for Arch Linux systems. These files are stored in the `~/.owl/` directory and support global, host-specific, and group-based configurations. Config files are plain text and use a simple directive-based syntax.

## Config File Locations
- **Global config:** `~/.owl/main.owl`
- **Host-specific overrides:** `~/.owl/hosts/{hostname}.owl`
- **Group configs:** `~/.owl/groups/{groupname}.owl`

Configs are merged in the following order:
1. Global (`main.owl`)
2. Group includes (`@group ...`)
3. Host-specific (`hosts/{hostname}.owl`)

## Supported Directives

### 1. Package Management
- `@package <name>`: Declares a package to be managed (can be repeated)
- `@packages`: Starts a block of package names (one per line)

**Example:**
```
@package neovim
@package git

@packages
htop
fzf
bat
```

### 2. Dotfile Management
- `:config <src> -> <dest>`: Copies a file or directory from `~/.owl/dotfiles/<src>` to `<dest>`

**Example:**
```
:config nvim -> ~/.config/nvim
:config vimrc -> ~/.vimrc
```

### 3. Setup Scripts
- `!setup <script>`: Runs a setup script from `~/.owl/setup/<script>`
  - Supports `.sh` (bash), `.js` (bun), and `.ts` (bun) files

**Example:**
```
!setup setup.sh
!setup dev-setup.ts
```

### 4. Group Includes
- `@group <name>`: Includes another group config from `~/.owl/groups/<name>.owl`
  - Supports nested groups (e.g., `@group dev/editors`)

**Example:**
```
@group dev
@group dev/editors
```

### 5. Comments
- Lines starting with `#` are ignored as comments.

**Example:**
```
# This is a comment
```

## Full Example
```
# Global packages
@package neovim
@package git

# Batch package block
@packages
htop
fzf
bat

# Dotfile management
:config nvim -> ~/.config/nvim
:config vimrc -> ~/.vimrc

# Setup scripts
!setup setup.sh
!setup dev-setup.ts

# Include group configs
@group dev
@group dev/editors
```

## Merging and Overrides
- **Global config** is always loaded first.
- **Group configs** are included via `@group` and merged in order.
- **Host-specific config** (if present) is loaded last and can override previous settings.
- Directives are additive; repeated package or config entries are merged.

## Change Detection and Lockfiles
- Owl uses SHA256 hashes to detect changes in dotfiles and setup scripts.
- Only changed files/scripts are reapplied.
- State is tracked in lockfiles:
  - `~/.owl/.state/managed.lock`: Tracks installed packages
  - `~/.owl/.state/owl.lock`: Tracks config and setup hashes

## Best Practices
- Use comments to document your config files.
- Organize reusable configs in groups for easy inclusion.
- Place all dotfiles in `~/.owl/dotfiles/` and setup scripts in `~/.owl/setup/`.
- Use host-specific configs for machine-specific overrides.
- Run `owl dry-run` to preview changes before applying.

## Troubleshooting
- Ensure all referenced dotfiles and scripts exist in their respective directories.
- Check for correct syntax: directives must start at the beginning of the line (no leading spaces).
- If you encounter permission errors, verify your HOME directory and write access to `~/.owl/`.

---

For more details, see the [README.md](./README.md) and [agents.md](./agents.md).
