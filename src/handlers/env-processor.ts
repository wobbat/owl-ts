/**
 * Environment variable processing utilities for the apply command
 */

import { ui, icon } from "../ui";
import pc from "picocolors";
import { setEnvironmentVariables, manageGlobalEnvironmentVariables } from "../environment";

/**
 * Process environment variable management
 */
export async function processEnvironmentVariables(allEnvs: Array<{ key: string; value: string }>, dryRun: boolean, debug: boolean): Promise<void> {
  if (allEnvs.length > 0) {
    if (dryRun) {
      console.log("Environment variables to set:");
      for (const env of allEnvs) {
        console.log(`  ${icon.ok} Would set: ${pc.cyan(env.key)}=${pc.green(env.value)}`);
      }
      console.log();
    } else {
      await setEnvironmentVariables(allEnvs, debug);
    }
  }
}

/**
 * Process global environment variable management
 */
export async function processGlobalEnvironmentVariables(globalEnvs: Array<{ key: string; value: string }>, dryRun: boolean, debug: boolean): Promise<void> {
  if (debug) {
    console.log(`Processing ${globalEnvs.length} global environment variables`);
  }

  if (globalEnvs.length > 0) {
    if (dryRun) {
      console.log("Global environment variables to set:");
      for (const env of globalEnvs) {
        console.log(`  ${icon.ok} Would set global: ${pc.cyan(env.key)}=${pc.green(env.value)}`);
      }
      console.log();
    } else {
      if (debug) {
        console.log("Calling manageGlobalEnvironmentVariables...");
      }
      await manageGlobalEnvironmentVariables(globalEnvs, debug);
      if (debug) {
        console.log("manageGlobalEnvironmentVariables completed");
      }
    }
  } else {
    if (debug) {
      console.log("No global environment variables to process");
    }
    // Still call the function with empty array to ensure files are cleaned up
    await manageGlobalEnvironmentVariables(globalEnvs, debug);
  }
}