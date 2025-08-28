import { $ } from "bun";
// Service operations should be best-effort and tolerant of existing state.
import type { ServiceSpec } from "../../types";

export interface ServiceStatus { name: string; enabled: boolean; active: boolean; rawEnabled?: string; rawActive?: string; }

function ctl(scope: ServiceSpec["scope"]): { cmd: (strings: TemplateStringsArray, ...expr: any[]) => any; sudo: boolean } {
  const isUser = scope === 'user';
  // Use --user for user services, otherwise sudo systemctl for system
  const base = (strings: TemplateStringsArray, ...expr: any[]) =>
    isUser ? $`systemctl --user ${strings as any} ${expr as any}` : $`sudo systemctl ${strings as any} ${expr as any}`;
  return { cmd: base as any, sudo: !isUser };
}

export async function checkServiceStatus(serviceName: string, scope: 'system' | 'user' = 'system'): Promise<ServiceStatus> {
  try {
    // Read-only checks do not require sudo; use plain systemctl
    const enabledText = (await (scope === 'user' ?
      $`systemctl --user is-enabled ${serviceName}` :
      $`systemctl is-enabled ${serviceName}`)
    .text().catch(() => 'disabled')).trim();
    // Treat static/indirect/etc as "enabled enough" to avoid noisy enable attempts
    const ENABLE_OK = new Set(['enabled', 'enabled-runtime', 'alias', 'linked', 'static', 'indirect', 'transient', 'generated']);
    const isEnabled = ENABLE_OK.has(enabledText);
    const activeText = (await (scope === 'user' ?
      $`systemctl --user is-active ${serviceName}` :
      $`systemctl is-active ${serviceName}`)
    .text().catch(() => 'inactive')).trim();
    const isActive = activeText === 'active';
    return { name: serviceName, enabled: isEnabled, active: isActive, rawEnabled: enabledText, rawActive: activeText };
  } catch {
    return { name: serviceName, enabled: false, active: false };
  }
}

export async function enableService(serviceName: string, scope: 'system' | 'user' = 'system'): Promise<void> {
  const { cmd } = ctl(scope);
  try { await cmd`enable ${serviceName}`.quiet(); }
  catch (error) {
    // If already enabled or cannot enable, do not hard-fail; verify state
    const st = await checkServiceStatus(serviceName, scope);
    if (!st.enabled) console.warn(`Warning: Could not enable ${serviceName} (${scope}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function disableService(serviceName: string, scope: 'system' | 'user' = 'system'): Promise<void> {
  const { cmd } = ctl(scope);
  try { await cmd`disable ${serviceName}`.quiet(); }
  catch (error) {
    const st = await checkServiceStatus(serviceName, scope);
    if (st.enabled) console.warn(`Warning: Could not disable ${serviceName} (${scope}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function startService(serviceName: string, scope: 'system' | 'user' = 'system'): Promise<void> {
  const { cmd } = ctl(scope);
  try { await cmd`start ${serviceName}`.quiet(); }
  catch (error) {
    const st = await checkServiceStatus(serviceName, scope);
    if (!st.active) console.warn(`Warning: Could not start ${serviceName} (${scope}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function stopService(serviceName: string, scope: 'system' | 'user' = 'system'): Promise<void> {
  const { cmd } = ctl(scope);
  try { await cmd`stop ${serviceName}`.quiet(); }
  catch (error) {
    const st = await checkServiceStatus(serviceName, scope);
    if (st.active) console.warn(`Warning: Could not stop ${serviceName} (${scope}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function restartService(serviceName: string, scope: 'system' | 'user' = 'system'): Promise<void> {
  const { cmd } = ctl(scope);
  try { await cmd`restart ${serviceName}`.quiet(); }
  catch (error) {
    console.warn(`Warning: Could not restart ${serviceName} (${scope}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function reloadService(serviceName: string, scope: 'system' | 'user' = 'system'): Promise<void> {
  const { cmd } = ctl(scope);
  try { await cmd`reload ${serviceName}`.quiet(); }
  catch (error) {
    console.warn(`Warning: Could not reload ${serviceName} (${scope}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function maskService(serviceName: string, scope: 'system' | 'user' = 'system'): Promise<void> {
  const { cmd } = ctl(scope);
  try { await cmd`mask ${serviceName}`.quiet(); }
  catch (error) {
    console.warn(`Warning: Could not mask ${serviceName} (${scope}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function unmaskService(serviceName: string, scope: 'system' | 'user' = 'system'): Promise<void> {
  const { cmd } = ctl(scope);
  try { await cmd`unmask ${serviceName}`.quiet(); }
  catch (error) {
    console.warn(`Warning: Could not unmask ${serviceName} (${scope}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function ensureServiceState(spec: ServiceSpec): Promise<void> {
  const name = spec.name;
  const scope = spec.scope || 'system';
  const status = await checkServiceStatus(name, scope);

  if (spec.mask === true) {
    await maskService(name, scope);
  }

  if (spec.enable === true && !status.enabled) {
    await enableService(name, scope);
  } else if (spec.enable === false && status.enabled) {
    await disableService(name, scope);
  }

  if (spec.restart) {
    await restartService(name, scope);
  } else if (spec.reload) {
    await reloadService(name, scope);
  } else if (spec.start === true && !status.active) {
    await startService(name, scope);
  } else if (spec.start === false && status.active) {
    await stopService(name, scope);
  }
}

export async function ensureServicesConfigured(services: ServiceSpec[]): Promise<void> {
  if (!services || services.length === 0) return;
  for (const spec of services) {
    try { await ensureServiceState(spec); }
    catch (error) { console.error(`Failed to manage service ${spec.name}:`, error); }
  }
}

// Backwards-compatible helpers for legacy string[] services
export async function ensureServicesEnabled(services: string[]): Promise<void> {
  if (!services || services.length === 0) return;
  const specs = services.map(name => ({ name, enable: true, start: true }) as ServiceSpec);
  await ensureServicesConfigured(specs);
}
