/**
 * Service processing utilities for the apply command
 */

import { ui, icon } from "../ui";
import pc from "picocolors";
import { manageServices } from "../services";

/**
 * Process service management
 */
export async function processServices(allServices: string[], dryRun: boolean): Promise<void> {
  if (allServices.length > 0) {
    if (dryRun) {
      console.log("Services to manage:");
      for (const serviceName of allServices) {
        console.log(`  ${icon.ok} Would manage service: ${pc.cyan(serviceName)}`);
      }
      console.log();
    } else {
      await manageServices(allServices);
    }
  }
}