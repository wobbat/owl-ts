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

### 1.1 Global Environment Variables
- `@env <KEY> = <VALUE>`: Sets global environment variables (not tied to specific packages)
  - Variables are set in `~/.owl/env.sh` (bash/zsh) and `~/.owl/env.fish` (fish shell)
  - Variables are automatically removed when removed from config
  - Tracked in state for proper cleanup (keys only for security)
  - No root/sudo access required
  - **Manual sourcing required**: Add the appropriate source line to your shell config

**Manual Sourcing Setup:**
```bash
# For bash/zsh users, add to ~/.bashrc or ~/.zshrc:
[ -f ~/.owl/env.sh ] && source ~/.owl/env.sh

# For fish users, add to ~/.config/fish/config.fish:
[ -f ~/.owl/env.fish ] && source ~/.owl/env.fish
```

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

### 3. Environment Variables
- `:env <KEY> = <VALUE>`: Sets environment variables for the package
  - Variables are set globally in `/etc/profile.d/owl-env.sh` when the package is installed
  - Variables are automatically removed when the package is uninstalled
  - Available to all login shells and processes started from them
  - Values can contain spaces and special characters

**Example:**
```
:env NODE_ENV = production
:env GOPATH = /home/user/go
:env JAVA_HOME = /usr/lib/jvm/java-11-openjdk
```

### 4. Setup Scripts
- `!setup <script>`: Runs a setup script from `~/.owl/setup/<script>`
  - Supports `.sh` (bash), `.js` (bun), and `.ts` (bun) files

**Example:**
```
!setup setup.sh
!setup dev-setup.ts
```

### 5. Group Includes
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
# Global environment variables (not package-specific)
@env GLOBAL_DEBUG = true
@env DEFAULT_EDITOR = nvim

@package neovim
@package git

# Batch package block
@packages
htop
fzf
bat
```

## Full Example
```
# Global environment variables (not package-specific)
@env GLOBAL_DEBUG = true
@env DEFAULT_EDITOR = nvim

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

# Package-specific environment variables
@package nodejs
:env NODE_ENV = production
:env NPM_CONFIG_PREFIX = ~/.npm-global

@package golang
:env GOPATH = /home/user/go
:env GO111MODULE = on

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
- Environment variables are managed automatically:
  - Package-specific env vars: Added when packages are installed, removed when uninstalled
  - Global env vars: Added when `@env` appears in config, removed when removed from config
  - All env vars stored in user directory (no sudo needed):
    - `~/.owl/env.sh` for bash/zsh shells
    - `~/.owl/env.fish` for fish shell
  - Manual sourcing required in shell config files
- State is tracked in lockfiles:
  - `~/.owl/.state/managed.lock`: Tracks installed packages
  - `~/.owl/.state/owl.lock`: Tracks config and setup hashes
  - `~/.owl/.state/global-env.lock`: Tracks global environment variables (keys only for security)

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
