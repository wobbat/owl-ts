import { $ } from "bun";
import { safeExecute } from "./utils/errors";

/**
 * Service management functions for systemd services
 */

export interface ServiceStatus {
  name: string;
  enabled: boolean;
  active: boolean;
}

/**
 * Check if a systemd service is enabled and active
 */
export async function checkServiceStatus(serviceName: string): Promise<ServiceStatus> {
  try {
    // Check if service is enabled
    const enabled = await $`systemctl is-enabled ${serviceName}`.text().catch(() => 'disabled');
    const isEnabled = enabled.trim() === 'enabled';

    // Check if service is active
    const active = await $`systemctl is-active ${serviceName}`.text().catch(() => 'inactive');
    const isActive = active.trim() === 'active';

    return {
      name: serviceName,
      enabled: isEnabled,
      active: isActive
    };
  } catch (error) {
    return {
      name: serviceName,
      enabled: false,
      active: false
    };
  }
}

/**
 * Enable a systemd service
 */
export async function enableService(serviceName: string): Promise<void> {
  await safeExecute(
    () => $`sudo systemctl enable ${serviceName}`.quiet(),
    `Failed to enable service ${serviceName}`
  );
}

/**
 * Start a systemd service
 */
export async function startService(serviceName: string): Promise<void> {
  await safeExecute(
    () => $`sudo systemctl start ${serviceName}`.quiet(),
    `Failed to start service ${serviceName}`
  );
}

/**
 * Enable and start a systemd service
 */
export async function enableAndStartService(serviceName: string): Promise<void> {
  const status = await checkServiceStatus(serviceName);

  if (!status.enabled) {
    await enableService(serviceName);
  }

  if (!status.active) {
    await startService(serviceName);
  }
}

/**
 * Manage services for a package configuration
 */
export async function manageServices(services: string[]): Promise<void> {
  if (!services || services.length === 0) return;

  for (const serviceName of services) {
    try {
      await enableAndStartService(serviceName);
    } catch (error) {
      console.error(`Failed to manage service ${serviceName}:`, error);
    }
  }
}