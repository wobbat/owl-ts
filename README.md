# 🦉 Owl

A modern package manager for Arch Linux that handles packages, dotfiles, and setup scripts with host-specific configurations.

## Features

- **Package Management**: Install and manage Arch packages using `yay` with upgrade support and automatic cleanup
- **Dotfile Management**: Copy dotfiles from `~/.owl/dotfiles/` to target locations
- **Setup Scripts**: Run custom setup scripts (.js, .ts, .sh) with change detection
- **Host-specific Configs**: Different configurations per hostname
- **Dry Run Mode**: Preview changes before applying them

## Installation

```bash
bun install
```

## Usage

```bash
# Apply configuration (install packages, link dotfiles, run setup)
bun run index.ts apply

# Dry run (preview what would be done)
bun run index.ts dry-run
# or
bun run index.ts dr

# Upgrade all packages to latest versions
bun run index.ts upgrade
# or
bun run index.ts up

# Remove all managed packages and configs
bun run index.ts uninstall

# Options
bun run index.ts apply --no-spinner  # Disable spinner animations
```

## Configuration

Owl uses configuration files stored in `~/.owl/`:

- `~/.owl/main.owl` - Global configuration
- `~/.owl/hosts/{hostname}.owl` - Host-specific overrides
- `~/.owl/group/{groupname}.owl` - Reusable group configurations

### Config Format

```
@package package-name
:config nvim -> ~/.config/nvim
!setup setup-script.sh

@package another-package
:config vimrc -> ~/.vimrc
!setup dev-setup.ts

# Include a group configuration
@group dev

# Include nested group configurations
@group dev/editors
```

**Notes**: 
- `:config` commands copy files/folders from `~/.owl/dotfiles/` to the destination. For example, `:config nvim -> ~/.config/nvim` copies `~/.owl/dotfiles/nvim` to `~/.config/nvim`.
- `!setup` commands execute scripts from `~/.owl/setup/`. Supports `.sh` (bash), `.js` (bun), and `.ts` (bun) files.
- Both configs and setup scripts use hash-based change detection - they only run when the source files have actually changed.
- Packages are automatically tracked in `~/.owl/.state/managed.lock` - packages removed from config are automatically uninstalled.
- `@group` includes configurations from `~/.owl/group/{groupname}.owl` files, supporting subdirectories like `dev/editors`.

Built with [Bun](https://bun.com) - a fast all-in-one JavaScript runtime.
