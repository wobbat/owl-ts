/**
 * Dotedit command handler for Owl package manager
 */

import { $ } from "bun";
import { existsSync } from "fs";
import { join, basename } from "path";
import { ui } from "../../ui";
import { loadConfigForHost } from "../../modules/config";
import { hostname } from "os";
import { getHomeDirectory } from "../../utils/fs";
import type { CommandOptions } from "../commands";

/**
 * Handle the dotedit command for editing dotfiles
 * This implementation matches the Go version exactly
 */
export async function handleDotEditCommand(
  target: string | undefined,
  options: CommandOptions
): Promise<void> {
  // Get EDITOR environment variable
  const editor = process.env.EDITOR;
  if (!editor) {
    throw new Error("EDITOR environment variable is not set");
  }

  const homeDir = getHomeDirectory();
  const dotfilesDir = join(homeDir, '.owl', 'dotfiles');

  let targetPath: string = dotfilesDir; // Default to dotfiles directory

  if (!target) {
    // No target specified, open the dotfiles directory
    ui.info("No target specified, opening dotfiles directory");
  } else {
    // Load configuration to find dotfile mappings
    const configResult = await loadConfigForHost(hostname(), options.legacyParser);
    const configEntries = configResult.entries;

    // Look for the target dotfile in configuration mappings
    let found = false;
    let foundType = '';

    // Search through all config entries for matching dotfile name
    for (const entry of configEntries) {
      if (!entry.configs) continue;

      for (const configMapping of entry.configs) {
        const sourcePath = configMapping.source;

        // Handle relative paths - make them absolute relative to dotfiles directory
        let absoluteSourcePath = sourcePath;
        if (!sourcePath.startsWith('/') && !sourcePath.startsWith('./') && !sourcePath.startsWith('../')) {
          absoluteSourcePath = join(dotfilesDir, sourcePath);
        }

        // Check if this matches our target (multiple ways to match)
        const matches = [
          absoluteSourcePath.endsWith(target),
          basename(absoluteSourcePath) === target,
          absoluteSourcePath.endsWith(`/${target}`),
          sourcePath === target,
          sourcePath.endsWith(`/${target}`)
        ];

        if (matches.some(match => match)) {
          targetPath = absoluteSourcePath;
          found = true;
          foundType = 'config mapping';
          break;
        }
      }
      if (found) break;
    }

    // If not found in config mappings, check if it's a direct path in dotfiles directory
    if (!found) {
      const directPath = join(dotfilesDir, target);
      if (existsSync(directPath)) {
        targetPath = directPath;
        found = true;
        foundType = 'direct path';
      }
    }

    // If still not found, check if target is a directory and open the whole directory
    if (!found) {
      const dirPath = join(dotfilesDir, target);
      if (existsSync(dirPath)) {
        const statResult = await $`test -d ${dirPath}`.quiet();
        if (statResult.exitCode === 0) {
          targetPath = dirPath;
          found = true;
          foundType = 'directory';
        }
      }
    }

    // If still not found, default to opening the entire dotfiles directory
    if (!found) {
      foundType = 'dotfiles directory';
      ui.info(`Dotfile '${target}' not found in configuration, opening dotfiles directory`);
    } else {
      ui.info(`Found ${foundType}: ${targetPath}`);
    }
  }

  // Ensure the target path exists
  if (!existsSync(targetPath)) {
    // If the specific file doesn't exist, create the dotfiles directory if it doesn't exist
    if (!existsSync(dotfilesDir)) {
      await $`mkdir -p ${dotfilesDir}`.quiet();
      ui.info(`Created dotfiles directory: ${dotfilesDir}`);
    }

    // If target is not the directory itself, then we default to the directory
    if (targetPath !== dotfilesDir) {
      targetPath = dotfilesDir;
    }
  }

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
