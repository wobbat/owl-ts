/**
 * Setup script processing utilities for the apply command
 */

import { runSetupScripts } from "../../modules/setup";

/**
 * Process setup script execution
 */
export async function processSetupScripts(allSetups: string[], dryRun: boolean): Promise<void> {
  if (allSetups.length > 0 && !dryRun) {
    await runSetupScripts(allSetups);
  }
}
