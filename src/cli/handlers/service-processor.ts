/**
 * Service processing utilities for the apply command
 */

import { ui, icon } from "../../ui";
import pc from "picocolors";
import { ensureServicesConfigured } from "../../modules/services";
import type { ServiceSpec } from "../../types";

/**
 * Process service management
 */
export async function processServices(allServices: ServiceSpec[], dryRun: boolean): Promise<void> {
  if (allServices.length > 0) {
    if (dryRun) {
      console.log("Services to manage:");
      for (const spec of allServices) {
        const scope = spec.scope || 'system';
        const actions: string[] = [];
        if (spec.enable === true) actions.push('enable');
        if (spec.enable === false) actions.push('disable');
        if (spec.restart) actions.push('restart');
        else if (spec.reload) actions.push('reload');
        else if (spec.start === true) actions.push('start');
        else if (spec.start === false) actions.push('stop');
        if (spec.mask) actions.push('mask');
        const actionStr = actions.length ? ` [${actions.join(', ')}]` : '';
        console.log(`  ${icon.ok} Would manage ${pc.cyan(spec.name)} (${scope})${actionStr}`);
      }
      console.log();
    } else {
      await ensureServicesConfigured(allServices);
    }
  }
}
