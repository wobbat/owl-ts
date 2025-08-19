# agents.md

This repository implements "Owl" — a lightweight, host-aware package and dotfile manager for Arch Linux written in TypeScript (targeting Bun). The document below summarizes the codebase, agent-like responsibilities, data flows, configuration, how to run, extension points, and troubleshooting.

## Purpose
Owl automates:
- Installing and upgrading Arch/AUR packages (via `yay`)
- Managing dotfiles (copying from `~/.owl/dotfiles/` into place)
- Running host-specific setup scripts (`~/.owl/setup/`) with change detection
- Tracking managed packages and applied configs via lockfiles under `~/.owl/.state/`

It supports dry-run mode, per-host overrides, group includes, and minimal interactive uninstall.

## Repo layout (key files)
- `index.ts` — CLI entry (exports/starts `main`)
- `src/main.ts` — Primary command dispatch and high-level orchestration (commands: apply, dry-run/dr, upgrade/up, uninstall, help, version)
- `src/config.ts` — Parser for `.owl` config files plus host/group merging (exports `loadConfigForHost`)
- `src/packages.ts` — Package analysis, install/remove, managed lock handling (`.state/managed.lock`), wrappers around `yay` and Bun spawn
- `src/dotfiles.ts` — Dotfile analysis and management, hashing, copying, and `owl.lock` updates
- `src/setup.ts` — Setup-script analysis/execution with hashing to avoid re-running unchanged scripts
- `src/ui.ts` — Console UI helpers (icons, spinners, formatting, progress helpers)
- Top-level docs and metadata:
  - `README.md` — Usage, config format, features
  - `package.json`, `tsconfig.json`, `bun.lock`

## High-level flow (what each "agent" does)
- CLI agent (`main.ts`)
  - Parses command and options (--no-spinner, --verbose)
  - Loads merged configuration for the current host using `config.ts`
  - Coordinates package analysis/installation, dotfiles management, and setup scripts
  - Handles special flows for `upgrade` and `uninstall`
- Config agent (`config.ts`)
  - Parses `main.owl`, optional host owl, and group includes (`@group ...`)
  - Supports `@packages` block and `@package` entries, `:config` and `!setup` directives
  - Outputs list of entries: package + configs + setups
- Package agent (`packages.ts`)
  - Reads/writes `.owl/.state/managed.lock`
  - Queries system via `yay` to detect installed/outdated packages
  - Decides package actions (install/skip/remove) and performs installs/removals
  - Provides streaming install output and robust error messaging
  - Protects critical system packages via `protected_packages`
- Dotfiles agent (`dotfiles.ts`)
  - Maps `:config src -> dest` to source path under `~/.owl/dotfiles/`
  - Computes file/directory SHA256 hashes for change detection (uses `find` to hash dirs)
  - Copies/overwrites destinations, updates `owl.lock` (`configs` map)
  - Produces a list of actions and prints a summary with spinners
- Setup agent (`setup.ts`)
  - Validates and runs scripts from `~/.owl/setup/` (.sh, .js, .ts)
  - Hashes scripts, skips unchanged ones, updates `owl.lock` (`setups` map)
  - Uses `bun` (for .js/.ts) or `bash` (for .sh) to execute
- UI/UX agent (`ui.ts`)
  - Centralized console formatting: icons, spinners, lists, progress bars, headers, and small simulated progress helpers used during dry-run

## Configuration format
Supported in `README.md` and the parser:
- Global: `~/.owl/main.owl`
- Host overrides: `~/.owl/hosts/{hostname}.owl`
- Groups: `~/.owl/groups/{groupname}.owl`
- Directives:
  - `@packages` block — list of package names
  - `@package <name>` — start package block
  - `:config <src> -> <dest>` — copy `~/.owl/dotfiles/<src>` to `<dest>`
  - `!setup <script>` — run `~/.owl/setup/<script>`
  - `@group <name>` — include group file (supports subdirs like `dev/editors`)

Note: `config.ts` resolves sources to absolute paths under `~/.owl/dotfiles/` and expands `~` in destinations.

## Lockfiles and state
- `~/.owl/.state/managed.lock` — tracks managed packages, first/last seen, installed versions, and protected packages
- `~/.owl/.state/owl.lock` — tracks config and setup hashes (prevents reapplying unchanged files/scripts)

Both locks are JSON files managed via `packages.ts`, `dotfiles.ts`, and `setup.ts`.

## How to run (development)
- Install dependencies with Bun:
  - bun install
- Run:
  - bun run index.ts apply    # default apply flow
  - bun run index.ts dry-run  # preview only
  - bun run index.ts upgrade  # upgrade system packages
  - bun run index.ts uninstall
- Dev run (watch):
  - bun run --watch index.ts

Options:
- --no-spinner — disable spinners
- --verbose — print full command output for long-running system commands

## Testing and simulation
- The codebase simulates progress in dry-run via UI helpers. There's no automated test suite included.
- Manual checks:
  - Validate parsing for sample `.owl` files (create `~/.owl/main.owl` and `~/.owl/hosts/<host>.owl`)
  - Run `dry-run` to ensure expected actions are displayed without changes

## Extension points and where to add agents
- Add new package sources or package providers:
  - Extend `packages.ts` to support alternate installers or additional queries (e.g., pacman-only mode)
- Add more config directives:
  - Update `config.ts` parser to recognize new directive tokens (e.g., :symlink, :template)
- Add an agent to perform backups before overwrite:
  - Insert into `dotfiles.manageConfigs` before copying to snapshot previous state to `~/.owl/.state/backups/`
- Add parallel installs or concurrency:
  - Modify `main.ts` installation loop to batch installs and call `installPackages` with multiple packages; `packages.installPackagesWithStreaming` already supports multi-package invocation
- Add unit/integration tests:
  - Create a tests directory and mock `bun`/$ calls with a lightweight harness or inject a `runner` interface for system calls

## Safety and notable behaviors
- `managed.lock` prevents auto-removal of `protected_packages` (system-critical pkg list embedded)
- Directory hashing uses `find` + `sha256sum` — this relies on available system tools
- Script execution supports only `.js`, `.ts`, `.sh` — other extensions error
- `upgrade` command runs `yay -Syu --noconfirm`, which will automatically upgrade system packages without interactive prompts (use with caution)
- Removal uses `yay -Rns --noconfirm` — this will remove packages and their dependencies; protected packages are excluded

## Troubleshooting
- Permission errors when writing `~/.owl/.state/*`: ensure your HOME is correct and you have write permission
- `find` / `sha256sum` missing: hashing of directories will fail; install coreutils or ensure these are present
- `bun` runtime issues: confirm Bun is installed and compatible with the `@types/bun` dev dep
- `yay` not available: commands relying on yay will fail (install yay or modify `packages.ts` to use pacman)
- Unexpected config parsing: check whitespace and comment lines; parser expects directive tokens at start of trimmed lines

## Quick code pointers (where to look)
- CLI + orchestration: `src/main.ts`
- Config parsing + host merging: `src/config.ts`
- Package lifecycle + lock: `src/packages.ts`
- Dotfile copy + hashing + lock: `src/dotfiles.ts`
- Setup scripts + hashing + lock: `src/setup.ts`
- Console UI and spinners: `src/ui.ts`
- Readme + usage examples: `README.md`

## Suggested improvements
- Add unit tests for `config.ts` parsing edge cases (groups, @packages, mixing directives)
- Abstract system command runner to allow mocking in tests (replace direct use of `$` and `Bun.spawn` with an injectable runner)
- Add safety confirmation flag for destructive actions (uninstall/remove) or a `--yes` to skip prompt
- Improve directory hashing to use a pure-Node implementation (avoid system `find`/`sha256sum` dependency)
- Add logging to a file for audit and easier debugging of failures
- Add CI build/typecheck step (run `bun`/`tsc`) and pre-commit hooks for linting

## Summary
Owl is a concise, pragmatic tool that combines package management, dotfile syncing, and setup script orchestration for host-specific environments. The code is modular and split into clear agent-like responsibilities: config parsing, package management, dotfile management, setup script execution, and UI. It is straightforward to extend (new directives, new package backends) and ready for immediate use on an Arch Linux system with Bun installed.

---

If you want, I can also shorten this to a one-page README summary or add a CONTRIBUTING.md with development notes.
