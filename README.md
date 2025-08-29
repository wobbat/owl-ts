# 🦉 Owl

Friendly, reliable system setup for Arch Linux. Define what your machine needs (packages, dotfiles, services, and scripts) in plain text. Owl applies it safely, repeatably, and fast.

## Why Owl

- Simplicity: one tiny config language, no YAML/JSON sprawl
- Clarity: dry‑run shows exactly what will change
- Safety: idempotent operations and change detection
- Flexibility: host‑specific overrides and sharable groups
- Speed: built on Bun, optimized for quick feedback

## Quick Start

- Requirements: Arch Linux (with `pacman`), [Bun](https://bun.sh) installed

1) Install deps
```bash
bun install
```

2) Create your config at `~/.owl/main.owl`
```text
@packages
git
neovim
htop

@package neovim
:config nvim -> ~/.config/nvim    # copies ~/.owl/dotfiles/nvim
:env EDITOR = nvim

@env DEFAULT_EDITOR = nvim         # global env var
@script setup.sh                   # global script in ~/.owl/setup/setup.sh
```

3) Add dotfiles and scripts
- Dotfiles: put files/folders under `~/.owl/dotfiles/` (e.g. `~/.owl/dotfiles/nvim`)
- Scripts: put `.sh`, `.js`, or `.ts` under `~/.owl/setup/` (executed when changed)

4) Preview changes (dry‑run)
```bash
bun run index.ts dr
```

5) Apply
```bash
bun run index.ts apply
```

Tip for shells: source the generated environment files once
```bash
# bash/zsh
[ -f ~/.owl/env.sh ] && source ~/.owl/env.sh

# fish
[ -f ~/.owl/env.fish ] && source ~/.owl/env.fish
```

## Commands

```bash
# Apply configuration (install packages, copy dotfiles, run scripts/services)
bun run index.ts apply

# Dry run (no changes, full plan)
bun run index.ts dry-run   # or: bun run index.ts dr

# Upgrade system packages
bun run index.ts upgrade   # or: bun run index.ts up

# Remove all managed packages and configs
bun run index.ts uninstall

# Dotfiles only (check/sync)
bun run index.ts dots --dry-run

# Search and add packages interactively
bun run index.ts search ripgrep
bun run index.ts add ripgrep

# Edit configs/dotfiles with your editor
bun run index.ts configedit         # or: ce
bun run index.ts dotedit nvim       # or: de nvim

# Options
bun run index.ts apply --no-spinner   # Disable spinner animations
bun run index.ts apply --verbose      # Stream output (install)
bun run index.ts apply --debug        # Verbose env file generation
```

## Configuration Overview

Owl reads from `~/.owl/`:

- `~/.owl/main.owl`: global configuration
- `~/.owl/hosts/{hostname}.owl`: host‑specific overrides
- `~/.owl/groups/{name}.owl`: reusable group fragments
- `~/.owl/dotfiles/*`: sources for `:config ... -> ...`
- `~/.owl/setup/*`: scripts for `:script <file>` or legacy `!setup <file>`

Supported directives (quick taste):

```text
@packages               # begin list of packages (one per line)
@package <name>         # switch context to a package for settings
@group dev/editors      # include group config
@env KEY = VALUE        # global environment variable
@script setup.sh        # global script (runs when changed)

:config src -> dest     # copy ~/.owl/dotfiles/src to dest
:env KEY = VALUE        # package-specific env var
:service svc [ key = value, ... ]  # manage systemd units
!setup file.sh          # legacy per-package script (like :script)
```

See full language details and examples in `config-specs.md`.

## How It Works (short)

- Parses config into a plan, then runs agents in order:
  1) Packages → 2) Dotfiles → 3) Setup Scripts → 4) Services → 5) Env vars
- Dry‑run shows exactly what would happen; apply converges state and writes lock files.
- Change detection prevents unnecessary work (dotfiles and scripts only run on change).

Deeper dive: see `agents.md` for architecture and extension points.

## Safety & Idempotence

- Dry‑run first: safe preview before any change
- Minimal changes: only what’s needed, based on current state
- Lock/state files: track what’s managed and what changed
- Services: uses `systemctl` (with sudo for system units) and avoids hard failures on non‑critical issues
- Environment files: regenerated atomically; you opt‑in by sourcing them

## Troubleshooting

- Verify `pacman` available and Bun installed
- Ensure files referenced in `:config` and `:script` actually exist
- Check `~/.owl/.state/` lock files for clues (hashes, managed packages)
- AUR down? Owl will continue with system packages and warn once
- Services (sudo): system service actions use `sudo` non‑interactively. If you see sudo/TTY errors, run `sudo -v` first to cache credentials, or configure passwordless sudo for `systemctl`. For user services, set `scope: 'user'` in `:service`.

## Contributing

Issues and PRs welcome. Start with `agents.md` (architecture) and `config-specs.md` (language). For local dev:

```bash
bun install
bun run --watch index.ts
```

Built with [Bun](https://bun.com).
