import { $ } from "bun";
// Service operations should be best-effort and tolerant of existing state.
import type { ServiceSpec } from "../../types";

export interface ServiceStatus { name: string; enabled: boolean; active: boolean; rawEnabled?: string; rawActive?: string; }

let printedSudoHint = false;

function isSudoAuthError(s: string): boolean {
  return /sudo|password|tty|a terminal is required|no tty present|permission denied/i.test(s || '');
}

function ctl(scope: ServiceSpec["scope"]): { cmd: (strings: TemplateStringsArray, ...expr: any[]) => any; sudo: boolean } {
  const isUser = scope === 'user';
  // Use --user for user services, otherwise sudo systemctl for system
  // For system operations, prefer non-interactive sudo (-n) to avoid hanging
  // when there is no TTY available for password prompts.
  const base = (strings: TemplateStringsArray, ...expr: any[]) =>
    isUser
      ? $`systemctl --user ${strings as any} ${expr as any}`
      : $`sudo -n systemctl ${strings as any} ${expr as any}`;
  return { cmd: base as any, sudo: !isUser };
}

async function runCtl(scope: 'system' | 'user', action: string, name: string): Promise<{ ok: boolean; stderr: string; stdout: string; exitCode: number }>{
  if (scope === 'user') {
    // Run quietly to avoid streaming stdout/stderr to the console
    const proc = await $`systemctl --user --quiet ${action} ${name}`.quiet().nothrow();
    const textOut = await proc.text();
    const ok = proc.exitCode === 0;
    // @ts-ignore
    const stderr = typeof proc.stderr === 'string' ? proc.stderr : (!ok ? textOut : '');
    return { ok, stderr: stderr || '', stdout: textOut || '', exitCode: proc.exitCode };
  }
  // system scope: try sudo -n first (non-interactive)
  let proc = await $`sudo -n systemctl --quiet ${action} ${name}`.quiet().nothrow();
  let textOut = await proc.text();
  let ok = proc.exitCode === 0;
  // @ts-ignore
  let stderr = typeof proc.stderr === 'string' ? proc.stderr : (!ok ? textOut : '');
  if (!ok && isSudoAuthError(stderr) && process.stdin.isTTY) {
    // Retry interactively if we have a TTY
    proc = await $`sudo systemctl --quiet ${action} ${name}`.quiet().nothrow();
    textOut = await proc.text();
    ok = proc.exitCode === 0;
    // @ts-ignore
    stderr = typeof proc.stderr === 'string' ? proc.stderr : (!ok ? textOut : '');
  }
  return { ok, stderr: stderr || '', stdout: textOut || '', exitCode: proc.exitCode };
}

export async function checkServiceStatus(serviceName: string, scope: 'system' | 'user' = 'system'): Promise<ServiceStatus> {
  try {
    // Read-only checks do not require sudo; use plain systemctl
    const enabledText = (await (scope === 'user' ?
      $`systemctl --user --quiet is-enabled ${serviceName}` :
      $`systemctl --quiet is-enabled ${serviceName}`)
    .quiet().text().catch(() => 'disabled')).trim();
    // Treat static/indirect/etc as "enabled enough" to avoid noisy enable attempts
    const ENABLE_OK = new Set(['enabled', 'enabled-runtime', 'alias', 'linked', 'static', 'indirect', 'transient', 'generated']);
    const isEnabled = ENABLE_OK.has(enabledText);
    const activeText = (await (scope === 'user' ?
      $`systemctl --user --quiet is-active ${serviceName}` :
      $`systemctl --quiet is-active ${serviceName}`)
    .quiet().text().catch(() => 'inactive')).trim();
    const isActive = activeText === 'active';
    return { name: serviceName, enabled: isEnabled, active: isActive, rawEnabled: enabledText, rawActive: activeText };
  } catch {
    return { name: serviceName, enabled: false, active: false };
  }
}

export async function enableService(serviceName: string, scope: 'system' | 'user' = 'system'): Promise<void> {
  const res = await runCtl(scope, 'enable', serviceName);
  if (!res.ok) {
    const msg = res.stderr || res.stdout || `Failed with exit code ${res.exitCode}`;
    if (scope === 'system' && !printedSudoHint && /sudo|password|tty/i.test(msg)) {
      printedSudoHint = true;
      console.warn("Hint: System service changes require sudo. Run 'sudo -v' first to cache credentials, or configure NOPASSWD for systemctl. You can also set scope: 'user' for user services.");
    }
    const st = await checkServiceStatus(serviceName, scope);
    if (!st.enabled) console.warn(`Warning: Could not enable ${serviceName} (${scope}): ${msg}`);
  }
}

export async function disableService(serviceName: string, scope: 'system' | 'user' = 'system'): Promise<void> {
  const res = await runCtl(scope, 'disable', serviceName);
  if (!res.ok) {
    const msg = res.stderr || res.stdout || `Failed with exit code ${res.exitCode}`;
    if (scope === 'system' && !printedSudoHint && /sudo|password|tty/i.test(msg)) {
      printedSudoHint = true;
      console.warn("Hint: System service changes require sudo. Run 'sudo -v' first to cache credentials, or configure NOPASSWD for systemctl. You can also set scope: 'user' for user services.");
    }
    const st = await checkServiceStatus(serviceName, scope);
    if (st.enabled) console.warn(`Warning: Could not disable ${serviceName} (${scope}): ${msg}`);
  }
}

export async function startService(serviceName: string, scope: 'system' | 'user' = 'system'): Promise<void> {
  const res = await runCtl(scope, 'start', serviceName);
  if (!res.ok) {
    const msg = res.stderr || res.stdout || `Failed with exit code ${res.exitCode}`;
    if (scope === 'system' && !printedSudoHint && /sudo|password|tty/i.test(msg)) {
      printedSudoHint = true;
      console.warn("Hint: System service changes require sudo. Run 'sudo -v' first to cache credentials, or configure NOPASSWD for systemctl. You can also set scope: 'user' for user services.");
    }
    const st = await checkServiceStatus(serviceName, scope);
    if (!st.active) console.warn(`Warning: Could not start ${serviceName} (${scope}): ${msg}`);
  }
}

export async function stopService(serviceName: string, scope: 'system' | 'user' = 'system'): Promise<void> {
  const res = await runCtl(scope, 'stop', serviceName);
  if (!res.ok) {
    const msg = res.stderr || res.stdout || `Failed with exit code ${res.exitCode}`;
    if (scope === 'system' && !printedSudoHint && /sudo|password|tty/i.test(msg)) {
      printedSudoHint = true;
      console.warn("Hint: System service changes require sudo. Run 'sudo -v' first to cache credentials, or configure NOPASSWD for systemctl. You can also set scope: 'user' for user services.");
    }
    const st = await checkServiceStatus(serviceName, scope);
    if (st.active) console.warn(`Warning: Could not stop ${serviceName} (${scope}): ${msg}`);
  }
}

export async function restartService(serviceName: string, scope: 'system' | 'user' = 'system'): Promise<void> {
  const res = await runCtl(scope, 'restart', serviceName);
  if (!res.ok) {
    const msg = res.stderr || res.stdout || `Failed with exit code ${res.exitCode}`;
    if (scope === 'system' && !printedSudoHint && /sudo|password|tty/i.test(msg)) {
      printedSudoHint = true;
      console.warn("Hint: System service changes require sudo. Run 'sudo -v' first to cache credentials, or configure NOPASSWD for systemctl. You can also set scope: 'user' for user services.");
    }
    console.warn(`Warning: Could not restart ${serviceName} (${scope}): ${msg}`);
  }
}

export async function reloadService(serviceName: string, scope: 'system' | 'user' = 'system'): Promise<void> {
  const res = await runCtl(scope, 'reload', serviceName);
  if (!res.ok) {
    const msg = res.stderr || res.stdout || `Failed with exit code ${res.exitCode}`;
    if (scope === 'system' && !printedSudoHint && /sudo|password|tty/i.test(msg)) {
      printedSudoHint = true;
      console.warn("Hint: System service changes require sudo. Run 'sudo -v' first to cache credentials, or configure NOPASSWD for systemctl. You can also set scope: 'user' for user services.");
    }
    console.warn(`Warning: Could not reload ${serviceName} (${scope}): ${msg}`);
  }
}

export async function maskService(serviceName: string, scope: 'system' | 'user' = 'system'): Promise<void> {
  const res = await runCtl(scope, 'mask', serviceName);
  if (!res.ok) {
    const msg = res.stderr || res.stdout || `Failed with exit code ${res.exitCode}`;
    if (scope === 'system' && !printedSudoHint && /sudo|password|tty/i.test(msg)) {
      printedSudoHint = true;
      console.warn("Hint: System service changes require sudo. Run 'sudo -v' first to cache credentials, or configure NOPASSWD for systemctl. You can also set scope: 'user' for user services.");
    }
    console.warn(`Warning: Could not mask ${serviceName} (${scope}): ${msg}`);
  }
}

export async function unmaskService(serviceName: string, scope: 'system' | 'user' = 'system'): Promise<void> {
  const res = await runCtl(scope, 'unmask', serviceName);
  if (!res.ok) {
    const msg = res.stderr || res.stdout || `Failed with exit code ${res.exitCode}`;
    if (scope === 'system' && !printedSudoHint && /sudo|password|tty/i.test(msg)) {
      printedSudoHint = true;
      console.warn("Hint: System service changes require sudo. Run 'sudo -v' first to cache credentials, or configure NOPASSWD for systemctl. You can also set scope: 'user' for user services.");
    }
    console.warn(`Warning: Could not unmask ${serviceName} (${scope}): ${msg}`);
  }
}

export async function ensureServiceState(spec: ServiceSpec): Promise<boolean> {
  const name = spec.name;
  const scope = spec.scope || 'system';
  const status = await checkServiceStatus(name, scope);
  let changed = false;

  if (spec.mask === true) {
    await maskService(name, scope);
    changed = true;
  }

  if (spec.enable === true && !status.enabled) {
    await enableService(name, scope);
    changed = true;
  } else if (spec.enable === false && status.enabled) {
    await disableService(name, scope);
    changed = true;
  }

  if (spec.restart) {
    await restartService(name, scope);
    changed = true;
  } else if (spec.reload) {
    await reloadService(name, scope);
    changed = true;
  } else if (spec.start === true && !status.active) {
    await startService(name, scope);
    changed = true;
  } else if (spec.start === false && status.active) {
    await stopService(name, scope);
    changed = true;
  }

  return changed;
}

export async function ensureServicesConfigured(services: ServiceSpec[]): Promise<{ changed: boolean; changes: number }> {
  if (!services || services.length === 0) return { changed: false, changes: 0 };
  let changes = 0;
  for (const spec of services) {
    try {
      const didChange = await ensureServiceState(spec);
      if (didChange) changes += 1;
    }
    catch (error) { console.error(`Failed to manage service ${spec.name}:`, error); }
  }
  return { changed: changes > 0, changes };
}

// Backwards-compatible helpers for legacy string[] services
export async function ensureServicesEnabled(services: string[]): Promise<void> {
  if (!services || services.length === 0) return;
  const specs = services.map(name => ({ name, enable: true, start: true }) as ServiceSpec);
  await ensureServicesConfigured(specs);
}
