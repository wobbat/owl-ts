import { join, resolve, dirname } from "path";
import { $ } from "bun";
import { ui, spinner, icon } from "./ui";
import { existsSync, lstatSync, mkdirSync } from "fs";
import { loadOwlLock, saveOwlLock, getFileHash } from "./utils/lock";
import { getHomeDirectory } from "./utils/fs";

interface ConfigAction {
  destination: string;
  source: string;
  status: 'copy' | 'skip' | 'update' | 'conflict' | 'create';
  reason?: string;
}

async function analyzeConfigs(configs: Record<string, string>): Promise<ConfigAction[]> {
  const actions: ConfigAction[] = [];
  const lock = await loadOwlLock();
  
  for (const [destination, source] of Object.entries(configs)) {
    const home = getHomeDirectory();
    const destinationPath = destination.startsWith("~") ? join(home, destination.slice(1)) : resolve(destination);
    const sourcePath = resolve(source);
    
    let action: ConfigAction;
    
    if (!existsSync(sourcePath)) {
      action = {
        destination,
        source,
        status: 'conflict',
        reason: 'Source file/folder does not exist'
      };
    } else if (!existsSync(destinationPath)) {
      action = {
        destination,
        source,
        status: 'create',
        reason: 'Destination does not exist'
      };
    } else {
      const currentSourceHash = await getFileHash(sourcePath);
      const lastAppliedHash = lock.configs[destination];
      
      if (currentSourceHash === lastAppliedHash && lastAppliedHash !== '') {
        action = {
          destination,
          source,
          status: 'skip',
          reason: 'No changes detected'
        };
      } else {
        action = {
          destination,
          source,
          status: 'update',
          reason: 'Changes detected or first time setup'
        };
      }
    }
    
    actions.push(action);
  }
  
  return actions;
}

async function manageConfigs(configs: Record<string, string>) {
  if (Object.keys(configs).length === 0) return;
  
  console.log("Config management:");
  
  const actions = await analyzeConfigs(configs);
  const toProcess = actions.filter(a => a.status !== 'skip');
  
  if (toProcess.length === 0) {
    ui.ok("No config files to process");
    return;
  }
  
  // Show what will be done using consistent styling
  for (const action of actions) {
    const home = getHomeDirectory();
    const destinationPath = action.destination.startsWith("~") ? join(home, action.destination.slice(1)) : resolve(action.destination);
    
    switch (action.status) {
      case 'create':
        console.log(`  ${icon.link} Copy: ${action.source} → ${destinationPath}`);
        break;
      case 'update':
        console.log(`  ${icon.upgrade} Replace: ${destinationPath} ← ${action.source}`);
        break;
      case 'skip':
        console.log(`  ${icon.skip} Skip: ${destinationPath} (${action.reason})`);
        break;
      case 'conflict':
        console.log(`  ${icon.err} Conflict: ${destinationPath} (${action.reason})`);
        break;
    }
  }
  
  const setupSpinner = spinner(`Processing ${toProcess.length} config changes`);
  
  let successCount = 0;
  let errorCount = 0;
  const lock = await loadOwlLock();
  
  for (const action of toProcess) {
    if (action.status === 'conflict') {
      errorCount++;
      continue;
    }
    
    try {
      const home = getHomeDirectory();
      const destinationPath = action.destination.startsWith("~") ? join(home, action.destination.slice(1)) : resolve(action.destination);
      const sourcePath = resolve(action.source);
      
      // Create parent directory if it doesn't exist
      const parentDir = dirname(destinationPath);
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }
      
      // Remove existing destination if it exists
      if (existsSync(destinationPath)) {
        await $`rm -rf ${destinationPath}`.quiet();
      }
      
      // Copy source to destination
      const sourceStats = lstatSync(sourcePath);
      if (sourceStats.isDirectory()) {
        await $`cp -r ${sourcePath} ${destinationPath}`.quiet();
      } else {
        await $`cp ${sourcePath} ${destinationPath}`.quiet();
      }
      
      // Update the lock with the new hash
      const newHash = await getFileHash(sourcePath);
      lock.configs[action.destination] = newHash;
      
      successCount++;
    } catch (error: any) {
      errorCount++;
      ui.err(`Failed to copy ${action.destination}: ${error?.message || error}`);
    }
  }
  
  // Save the updated lock file
  if (successCount > 0) {
    saveOwlLock(lock);
  }
  
  if (errorCount === 0) {
    setupSpinner.stop(`${successCount} configs processed successfully`);
  } else {
    setupSpinner.fail(`${errorCount} failed, ${successCount} succeeded`);
  }
  
  console.log();
}

export async function analyzeConfigsPerPackage(configEntries: Array<{package: string, configs?: Array<{source: string, destination: string}>, sourceFile?: string, sourceType?: string, groupName?: string}>) {
  const packagesWithConfigs = configEntries.filter(entry => entry.configs && entry.configs.length > 0);
  
  if (packagesWithConfigs.length === 0) return;
  
  console.log("Config analysis:");
  
  for (const entry of packagesWithConfigs) {
    const packageName = entry.package;
    const configs = entry.configs || [];
    
    // Convert to the format expected by analyzeConfigs
    const configMap = Object.fromEntries(configs.map(c => [c.destination, c.source]));
    const actions = await analyzeConfigs(configMap);
    
    // Check if anything needs to be done
    const needsAction = actions.some(a => a.status !== 'skip');
    const hasConflicts = actions.some(a => a.status === 'conflict');
    
    // Import styles and formatPackageSource from ui
    const { styles, formatPackageSource } = await import("./ui");
    
    const sourcePrefix = formatPackageSource(entry);
    process.stdout.write(`${sourcePrefix}${packageName} ${styles.muted("->")}\n`);
    
    if (hasConflicts) {
      // Show conflicts immediately
      const conflictSpinner = spinner(`  Dotfiles - checking...`);
      conflictSpinner.fail(`conflicts detected`);
    } else if (!needsAction) {
      // All files are up to date
      const skipSpinner = spinner(`  Dotfiles - checking...`);
      skipSpinner.stop();
    } else {
      // Process the changes
      const processSpinner = spinner(`  Dotfiles - syncing...`);
      
      let successCount = 0;
      let errorCount = 0;
      const lock = await loadOwlLock();
      
      for (const action of actions) {
        if (action.status === 'skip' || action.status === 'conflict') continue;
        
        try {
          const home = getHomeDirectory();
          const destinationPath = action.destination.startsWith("~") ? join(home, action.destination.slice(1)) : resolve(action.destination);
          const sourcePath = resolve(action.source);
          
          // Create parent directory if it doesn't exist
          const parentDir = dirname(destinationPath);
          if (!existsSync(parentDir)) {
            mkdirSync(parentDir, { recursive: true });
          }
          
          // Remove existing destination if it exists
          if (existsSync(destinationPath)) {
            await $`rm -rf ${destinationPath}`.quiet();
          }
          
          // Copy source to destination
          const sourceStats = lstatSync(sourcePath);
          if (sourceStats.isDirectory()) {
            await $`cp -r ${sourcePath} ${destinationPath}`.quiet();
          } else {
            await $`cp ${sourcePath} ${destinationPath}`.quiet();
          }
          
          // Update the lock with the new hash
          const newHash = await getFileHash(sourcePath);
          lock.configs[action.destination] = newHash;
          
          successCount++;
        } catch (error: any) {
          errorCount++;
        }
      }
      
      // Save the updated lock file
      if (successCount > 0) {
        saveOwlLock(lock);
      }
      
      if (errorCount === 0) {
        processSpinner.stop();
      } else {
        processSpinner.fail(`sync failed`);
      }
    }
    
    console.log(); // Add spacing between packages
  }
}

export async function manageConfigsPerPackage(configEntries: Array<{package: string, configs?: Array<{source: string, destination: string}>, sourceFile?: string, sourceType?: string, groupName?: string}>) {
  const packagesWithConfigs = configEntries.filter(entry => entry.configs && entry.configs.length > 0);
  
  if (packagesWithConfigs.length === 0) return;
  
  console.log("Config management:");
  
  for (const entry of packagesWithConfigs) {
    const packageName = entry.package;
    const configs = entry.configs || [];
    
    // Convert to the format expected by analyzeConfigs
    const configMap = Object.fromEntries(configs.map(c => [c.destination, c.source]));
    const actions = await analyzeConfigs(configMap);
    
    // Check if anything needs to be done
    const needsAction = actions.some(a => a.status !== 'skip');
    const hasConflicts = actions.some(a => a.status === 'conflict');
    
    // Import styles from ui
    const { styles } = await import("./ui");
    
    process.stdout.write(`${packageName} ${styles.muted("->")}\n`);
    
    if (hasConflicts) {
      // Show conflicts immediately
      const conflictSpinner = spinner(`  Dotfiles - checking...`);
      conflictSpinner.fail(`conflicts detected`);
    } else if (!needsAction) {
      // All files are up to date
      const skipSpinner = spinner(`  Dotfiles - checking...`);
      skipSpinner.stop();
    } else {
      // Process the changes
      const processSpinner = spinner(`  Dotfiles - syncing...`);
      
      let successCount = 0;
      let errorCount = 0;
      const lock = await loadOwlLock();
      
      for (const action of actions) {
        if (action.status === 'skip' || action.status === 'conflict') continue;
        
        try {
          const home = getHomeDirectory();
          const destinationPath = action.destination.startsWith("~") ? join(home, action.destination.slice(1)) : resolve(action.destination);
          const sourcePath = resolve(action.source);
          
          // Create parent directory if it doesn't exist
          const parentDir = dirname(destinationPath);
          if (!existsSync(parentDir)) {
            mkdirSync(parentDir, { recursive: true });
          }
          
          // Remove existing destination if it exists
          if (existsSync(destinationPath)) {
            await $`rm -rf ${destinationPath}`.quiet();
          }
          
          // Copy source to destination
          const sourceStats = lstatSync(sourcePath);
          if (sourceStats.isDirectory()) {
            await $`cp -r ${sourcePath} ${destinationPath}`.quiet();
          } else {
            await $`cp ${sourcePath} ${destinationPath}`.quiet();
          }
          
          // Update the lock with the new hash
          const newHash = await getFileHash(sourcePath);
          lock.configs[action.destination] = newHash;
          
          successCount++;
        } catch (error: any) {
          errorCount++;
        }
      }
      
      // Save the updated lock file
      if (successCount > 0) {
        saveOwlLock(lock);
      }
      
      if (errorCount === 0) {
        processSpinner.stop();
      } else {
        processSpinner.fail(`sync failed`);
      }
    }
    
    console.log(); // Add spacing between packages
  }
}