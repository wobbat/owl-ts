/**
 * Configedit command handler for Owl package manager
 */

import { existsSync } from "fs";
import { join } from "path";
import { ui } from "../../ui";
import { getHomeDirectory } from "../../utils/fs";
import type { CommandOptions } from "../commands";

/**
 * Handle the configedit command for editing configuration files
 * This implementation matches the Go version exactly - only edits existing files
 */
export async function handleConfigEditCommand(
  target: string | undefined,
  _options: CommandOptions
): Promise<void> {
  // Get EDITOR environment variable
  const editor = process.env.EDITOR;
  if (!editor) {
    throw new Error("EDITOR environment variable is not set");
  }

  const homeDir = getHomeDirectory();
  const owlRoot = join(homeDir, '.owl');

  let targetPath: string;
  let configType: string;

  if (!target) {
    // No target specified, open main config
    targetPath = join(owlRoot, 'main.owl');
    configType = "main configuration";
  } else if (target.endsWith('.owl')) {
    // Target has .owl extension
    if (target === 'main.owl') {
      targetPath = join(owlRoot, 'main.owl');
      configType = "main configuration";
    } else {
      // Check if it's a host or group config
      const hostPath = join(owlRoot, 'hosts', target);
      if (existsSync(hostPath)) {
        targetPath = hostPath;
        configType = `host configuration: ${target.replace('.owl', '')}`;
      } else {
        const groupPath = join(owlRoot, 'groups', target);
        if (existsSync(groupPath)) {
          targetPath = groupPath;
          configType = `group configuration: ${target.replace('.owl', '')}`;
        } else {
          throw new Error(`Configuration file not found: ${target}`);
        }
      }
    }
  } else {
    // No .owl extension, try different possibilities
    if (target === 'main') {
      targetPath = join(owlRoot, 'main.owl');
      configType = "main configuration";
    } else {
      // Check host configurations
      const hostPath = join(owlRoot, 'hosts', `${target}.owl`);
      if (existsSync(hostPath)) {
        targetPath = hostPath;
        configType = `host configuration: ${target}`;
      } else {
        // Check group configurations
        const groupPath = join(owlRoot, 'groups', `${target}.owl`);
        if (existsSync(groupPath)) {
          targetPath = groupPath;
          configType = `group configuration: ${target}`;
        } else {
          throw new Error(`No configuration found for '${target}' (checked main, hosts, and groups)`);
        }
      }
    }
  }

  // Check if target path exists - Go version does NOT create files
  if (!existsSync(targetPath)) {
    throw new Error(`No configuration found for '${target}' (checked main, hosts, and groups)`);
  }

  ui.info(`Found ${configType}`);
  ui.info(`Opening ${targetPath} with ${editor}`);

  try {
    // Execute the editor command
    const proc = Bun.spawn([editor, targetPath], {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit'
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error(`Editor exited with code ${exitCode}`);
    }
  } catch (error) {
    throw new Error(`Failed to open editor: ${error instanceof Error ? error.message : String(error)}`);
  }
}
