# Owl Agents Guide

This guide explains Owl’s internal agents, how they work together during apply/dry‑run, and how to add a new agent or directive.

## What Is An Agent?

An agent is a focused subsystem that takes config entries and converges system state. Owl ships with agents for packages, dotfiles, setup scripts, services, and environment variables. Each agent:

- Defines inputs: parsed config fields and current system state.
- Plans actions: a dry‑run summary that is safe and idempotent.
- Applies changes: converges state with clear, minimal operations.
- Updates state: writes lock/state files for future runs.

## Architecture Overview

- CLI entry: `src/cli/main.ts` parses arguments and routes commands.
- Config parsing: `src/modules/config/parser.ts` (AST‑based, default) merges `~/.owl/main.owl`, `@group ...`, and `~/.owl/hosts/{host}.owl`.
- Apply pipeline: `src/cli/handlers/apply.ts` orchestrates agents in this order:
  1) Packages → 2) Dotfiles → 3) Setup Scripts (global first, then package) → 4) Services → 5) Package env vars → 6) Global env vars
- Agents (modules): live under `src/modules/**` with thin CLI “processors” under `src/cli/handlers/**` for dry‑run/apply UX.
- UI helpers: `src/ui/**` provides spinners, icons, and consistent formatting.
- State/lock files: `~/.owl/.state/*` and `~/.owl/env.*` track change detection and environment.

## Config To Data Flow

- Parser output: `loadConfigForHost(host)` returns:
  - `entries: ConfigEntry[]` with `package`, `configs`, `setups`, `services`, `envs`, plus `sourceType`/`sourceFile` for provenance.
  - `globalEnvs: Array<{ key; value }>` from `@env ...`.
  - `globalScripts: string[]` from `@script ...`.
- Apply handler: `src/cli/handlers/apply.ts` extracts flattened lists and calls per‑agent processors with `dryRun` flag.

## Agents

### Packages

- Files: `src/modules/packages/**`, processor: `src/cli/handlers/package-processor.ts`.
- Responsibilities:
  - Compute actions: `install | skip | remove` via `planPackageActions()`.
  - Install/remove using Pacman (no AUR helper required); integrates AUR availability checks for UX.
  - Track managed packages in `~/.owl/.state/managed.lock` with timestamps and protected packages.
- Idempotency & safety:
  - Version checks are tolerant of `-git` packages (treated as up‑to‑date).
  - Removals skip protected packages from `DEFAULT_PROTECTED_PACKAGES`.
- Dry‑run:
  - Shows install/remove/skip per package, then exits without changes.
- Apply:
  - Installs/removes and updates `managed.lock` via `updateManagedPackages()`/`removeUnmanagedPackages()`.

### Dotfiles

- Files: `src/modules/dotfiles/index.ts`, processor: `src/cli/handlers/config-processor.ts`.
- Inputs: `:config <src> -> <dest>` resolved from `~/.owl/dotfiles/<src>`.
- Change detection:
  - Computes hash of source; compares with last applied hash in `~/.owl/.state/owl.lock`.
- Dry‑run:
  - Summarizes pending creates/updates/conflicts, grouped by package.
- Apply:
  - Ensures parent directories, replaces atomically (`rm -rf` then `cp`), updates `owl.lock`.
- Concurrency:
  - Uses a simple limiter to bound parallel analysis for responsiveness.

### Setup Scripts

- Files: `src/modules/setup/index.ts`, processor: `src/cli/handlers/setup-processor.ts`.
- Inputs: `:script <file>` or legacy `!setup <file>` under `~/.owl/setup/`.
- Supported: `.sh` via `bash`, `.js`/`.ts` via `bun`.
- Change detection:
  - Hash stored in `~/.owl/.state/owl.lock`; executes only when the script changes.
- Dry‑run:
  - Lists which scripts would execute/skip and any errors (missing/unsupported).
- Apply:
  - Executes with a timeout, updates `owl.lock`; continues best‑effort with clear error messages.

### Services

- Files: `src/modules/services/index.ts`, processor: `src/cli/handlers/service-processor.ts`.
- Inputs: `:service <name> [ key = value, ... ]` with options:
  - `scope=user|system` (default: `system`), `enable`, `start`, `restart`, `reload`, `mask` (booleans).
- Behavior:
  - `systemctl` (or `systemctl --user` for user services). Uses sudo for system unit changes as needed.
  - Reads current status and performs only necessary actions.
- Dry‑run:
  - Shows planned operations per unit.
- Apply:
  - Best‑effort operations; logs warnings instead of hard‑failing on non‑critical errors.

### Environment Variables

- Files: `src/modules/env/index.ts`, processor: `src/cli/handlers/env-processor.ts`.
- Package envs: `:env KEY = VALUE` aggregated across packages.
- Global envs: `@env KEY = VALUE` aggregated top‑level and host overrides.
- Outputs:
  - `~/.owl/env.sh` (bash/zsh) and `~/.owl/env.fish` (fish) regenerated atomically on each run.
  - Keys of global envs tracked in `~/.owl/.state/global-env.lock` (values are not stored for security).
- Shell integration:
  - Manually source these files in your shell config. See config spec for examples.
- Dry‑run:
  - Prints which env vars would be set (global and package) with values.
- Apply:
  - Writes clean files (even when empty) under a lock to avoid races.

## State And Lock Files

- `~/.owl/.state/managed.lock`: Managed packages and metadata (timestamps, installed versions, protected list).
- `~/.owl/.state/owl.lock`: Hashes for dotfiles and setup scripts for change detection.
- `~/.owl/.state/global-env.lock`: Keys for global env vars.
- `~/.owl/env.sh`, `~/.owl/env.fish`: Generated environment files to be sourced by shells.

## Dry‑Run Contract

- Agents must avoid side effects in dry‑run. Show exactly what would change and why.
- Prefer precise, grouped output and consistent formatting via `src/ui` spinners/icons.
- Keep dry‑run and apply code paths close for parity but clearly separate the side effects.

## Adding A New Directive Or Agent

1) Update types
- Edit `src/types/index.ts` to add new types to `ConfigEntry` or global outputs.

2) Parse config
- In `src/modules/config/parser.ts`:
  - Add a token in the lexer (e.g., `COLON_FOO`).
  - Extend the parser to create an AST node.
  - In `transformToEntries()`, map the AST node into `entries` or global outputs (e.g., add `foos: ...` to `ConfigEntry`).

3) Implement the agent
- Create a module under `src/modules/<agent>/index.ts` that implements:
  - Planning helpers (compute current state vs desired).
  - Apply functions (idempotent convergence, minimal changes).
  - Any lock/state handling needed (prefer atomic writes and file locks via `src/utils/atomic.ts`).

4) Add a CLI processor
- Add `src/cli/handlers/<agent>-processor.ts` that:
  - Accepts flattened inputs from `apply.ts`.
  - Implements dry‑run output and calls the module’s apply functions.
  - Uses `src/ui` for spinners/icons/formatting.

5) Wire into the pipeline
- In `src/cli/handlers/apply.ts`, extract your new data from the parsed config and call your processor in the desired order.

6) Validate and document
- Ensure dry‑run prints exactly what apply will change.
- Update `README.md`, `config-specs.md`, and this guide if you introduced a new directive.

## UX And Safety Guidelines

- Prefer minimal, clear actions; avoid surprising side effects.
- Keep output consistent: headers, spinners, and icons from `src/ui`.
- Use `safeExecute()` for error boundaries and report friendly messages.
- Avoid unnecessary `sudo`; only the services agent uses privileged operations for system units.
- Use timeouts for external commands (e.g., setup scripts) and surface actionable errors.
- Constrain parallelism where it improves UX without overwhelming the system.

## Execution Order Rationale

- Packages first: provide binaries and files for later steps.
- Dotfiles next: place configs that scripts/services might rely on.
- Setup scripts: perform one‑time or change‑triggered tasks once files are in place.
- Services: enable/start after required packages/configs exist.
- Env vars last: regenerate final environment so shells can pick up changes.

## Useful Entry Points

- CLI: `src/cli/main.ts`, commands in `src/cli/commands/index.ts`.
- Apply: `src/cli/handlers/apply.ts`.
- Packages: `src/modules/packages/index.ts`.
- Dotfiles: `src/modules/dotfiles/index.ts`.
- Setup: `src/modules/setup/index.ts`.
- Services: `src/modules/services/index.ts`.
- Env: `src/modules/env/index.ts`.
- Parser: `src/modules/config/parser.ts`.
- UI helpers: `src/ui/**`.

If you want help sketching a new directive, open an issue with a concrete example and desired dry‑run/apply behavior.

