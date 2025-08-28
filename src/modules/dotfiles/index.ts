import { join, resolve, dirname } from "path";
import { $ } from "bun";
import { ui, spinner, icon } from "../../ui";
import pc from "picocolors";
import { existsSync, lstatSync, mkdirSync } from "fs";
import { loadOwlLock, saveOwlLock, getFileHash } from "../../utils/lock";
import { getHomeDirectory } from "../../utils/fs";

interface ConfigAction {
  destination: string;
  source: string;
  status: 'copy' | 'skip' | 'update' | 'conflict' | 'create';
  reason?: string;
}

// Limited concurrency helper
function createLimiter(concurrency: number) {
  let active = 0; const queue: Array<() => void> = [];
  const next = () => { active--; const fn = queue.shift(); if (fn) fn(); };
  return function <T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = async () => { active++; try { resolve(await task()); } catch (e) { reject(e); } finally { next(); } };
      if (active < concurrency) run(); else queue.push(run);
    });
  };
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
      action = { destination, source, status: 'conflict', reason: 'Source file/folder does not exist' };
    } else if (!existsSync(destinationPath)) {
      action = { destination, source, status: 'create', reason: 'Destination does not exist' };
    } else {
      const currentSourceHash = await getFileHash(sourcePath);
      const lastAppliedHash = (lock.configs as any)[destination];
      if (currentSourceHash === lastAppliedHash && lastAppliedHash !== '') action = { destination, source, status: 'skip', reason: 'No changes detected' };
      else action = { destination, source, status: 'update', reason: 'Changes detected or first time setup' };
    }
    actions.push(action);
  }
  return actions;
}

export async function syncDotfilesByPackage(
  configEntries: Array<{package: string, configs?: Array<{source: string, destination: string}>, sourceFile?: string, sourceType?: string, groupName?: string}>,
  opts: { dryRun: boolean }
) {
  const packagesWithConfigs = configEntries.filter(entry => entry.configs && entry.configs.length > 0);
  if (packagesWithConfigs.length === 0) return;
  console.log("Config management:");

  const packagesWithChanges: typeof configEntries = [];
  const packagesUpToDate: typeof configEntries = [];
  const packagesWithConflicts: typeof configEntries = [];
  const limit = createLimiter(6);
  await Promise.all(packagesWithConfigs.map(entry => limit(async () => {
    const configs = entry.configs || [];
    const configMap = Object.fromEntries(configs.map(c => [c.destination, c.source]));
    const actions = await analyzeConfigs(configMap);
    const hasChanges = actions.some(a => a.status !== 'skip');
    const hasConflicts = actions.some(a => a.status === 'conflict');
    if (hasConflicts) packagesWithConflicts.push(entry);
    else if (hasChanges) packagesWithChanges.push(entry);
    else packagesUpToDate.push(entry);
  })));

  if (packagesUpToDate.length > 0) {
    await showDotfilesSummary(packagesUpToDate);
  }

  const allPackagesToProcess = [...packagesWithChanges, ...packagesWithConflicts];
  for (const entry of allPackagesToProcess) {
    const packageName = entry.package;
    const configs = entry.configs || [];
    const configMap = Object.fromEntries(configs.map(c => [c.destination, c.source]));
    const actions = await analyzeConfigs(configMap);
    const needsAction = actions.some(a => a.status !== 'skip');
    const hasConflicts = actions.some(a => a.status === 'conflict');
    const { styles, formatPackageSource } = await import("../../ui");
    const sourcePrefix = formatPackageSource(entry);
    process.stdout.write(`${sourcePrefix}${pc.cyan(packageName)} ${styles.muted("->")}\n`);

    if (hasConflicts) {
      const conflictSpinner = spinner(`  Dotfiles - checking...`);
      conflictSpinner.fail(`conflicts detected`);
    } else if (!needsAction) {
      const skipSpinner = spinner(`  Dotfiles - checking...`);
      skipSpinner.stop();
    } else {
      if (opts.dryRun) {
        for (const action of actions) {
          if (action.status === 'skip') continue;
          const home = getHomeDirectory();
          const destinationPath = action.destination.startsWith("~") ? join(home, action.destination.slice(1)) : resolve(action.destination);
          switch (action.status) {
            case 'create': console.log(`  ${icon.link} Copy: ${action.source} → ${destinationPath}`); break;
            case 'update': console.log(`  ${icon.upgrade} Replace: ${destinationPath} ← ${action.source}`); break;
            case 'conflict': console.log(`  ${icon.err} Conflict: ${destinationPath} (${action.reason})`); break;
          }
        }
      } else {
        const processSpinner = spinner(`  Dotfiles - syncing...`);
        let successCount = 0; let errorCount = 0; const lock = await loadOwlLock();
        for (const action of actions) {
          if (action.status === 'skip' || action.status === 'conflict') continue;
          try {
            const home = getHomeDirectory();
            const destinationPath = action.destination.startsWith("~") ? join(home, action.destination.slice(1)) : resolve(action.destination);
            const sourcePath = resolve(action.source);
            const parentDir = dirname(destinationPath);
            if (!existsSync(parentDir)) { mkdirSync(parentDir, { recursive: true }); }
            if (existsSync(destinationPath)) { await $`rm -rf ${destinationPath}`.quiet(); }
            const sourceStats = lstatSync(sourcePath);
            if (sourceStats.isDirectory()) await $`cp -r ${sourcePath} ${destinationPath}`.quiet();
            else await $`cp ${sourcePath} ${destinationPath}`.quiet();
            const newHash = await getFileHash(sourcePath);
            (lock.configs as any)[action.destination] = newHash;
            successCount++;
          } catch {
            errorCount++;
          }
        }
        if (successCount > 0) saveOwlLock(lock);
        if (errorCount === 0) processSpinner.stop(); else processSpinner.fail(`sync failed`);
      }
    }
    console.log();
  }
}

async function showDotfilesSummary(packages: Array<{package: string, configs?: Array<{source: string, destination: string}>, sourceFile?: string, sourceType?: string, groupName?: string}>) {
  if (packages.length === 0) return;
  const packageCount = packages.length;
  const { styles, formatPackageSource } = await import("../../ui");
  if (packageCount === 1) {
    const entry = packages[0]!;
    const sourcePrefix = formatPackageSource({ sourceType: entry.sourceType, sourceFile: entry.sourceFile, groupName: entry.groupName });
    process.stdout.write(`${sourcePrefix}${pc.cyan(entry.package)} ${styles.muted("->")}\n`);
    const summarySpinner = spinner("  Dotfiles - checking...", { enabled: true }); summarySpinner.stop(""); console.log();
  } else {
    const packageNames = packages.map(entry => entry.package);
    const summary = packageCount <= 5 ? packageNames.join(", ") : `${packageCount} packages`;
    console.log(`${pc.cyan(summary)} ${styles.muted("->")}`);
    const summarySpinner = spinner("  Dotfiles - checking...", { enabled: true }); summarySpinner.stop(""); console.log();
  }
}
