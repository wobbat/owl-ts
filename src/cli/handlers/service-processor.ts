/**
 * Service processing utilities for the apply command
 */

import { ui, icon, spinner } from "../../ui";
import pc from "picocolors";
import { ensureServicesConfigured } from "../../modules/services";
import type { ServiceSpec } from "../../types";

/**
 * Process service management
 */
export async function processServices(allServices: ServiceSpec[], dryRun: boolean): Promise<void> {
  if (allServices.length > 0) {
    // Styled header to match other sections
    ui.sectionHeader("Services", "teal");
    if (dryRun) {
      console.log("  Plan:");
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
        console.log(`    ${icon.ok} Would manage ${pc.cyan(spec.name)} (${scope})${actionStr}`);
      }
      console.log();
      console.log(`  ${icon.ok} ${pc.green(`Planned ${allServices.length} service(s)`)}`);
      console.log();
    } else {
      const svcSpinner = spinner("Validating services...", { enabled: true });
      const result = await ensureServicesConfigured(allServices);
      if (result.changed) {
        svcSpinner.stop("Services configured");
        console.log();
        console.log(`  ${icon.ok} ${pc.green(`Managed ${allServices.length} service(s)`)}`);
        console.log();
      } else {
        svcSpinner.stop("Service state verified");
        console.log();
      }
    }
  }
}
