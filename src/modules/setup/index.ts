import { resolve, extname } from "path";
import { ui, spinner, icon } from "../../ui";
import { existsSync } from "fs";
import { loadOwlLock, saveOwlLock, getFileHash } from "../../utils/lock";
import { getHomeDirectory } from "../../utils/fs";

interface SetupAction {
  script: string;
  scriptPath: string;
  status: 'execute' | 'skip' | 'error';
  reason?: string;
}

function getScriptExecutor(scriptPath: string): { command: string; args: string[] } {
  const ext = extname(scriptPath).toLowerCase();
  
  switch (ext) {
    case '.js':
    case '.ts':
      return { command: 'bun', args: [scriptPath] };
    case '.sh':
      return { command: 'bash', args: [scriptPath] };
    default:
      throw new Error(`Unsupported script type: ${ext}`);
  }
}


async function analyzeSetupScripts(scripts: string[]): Promise<SetupAction[]> {
  const actions: SetupAction[] = [];
  const lock = await loadOwlLock();
  
  for (const script of scripts) {
    const home = getHomeDirectory();
    const scriptPath = resolve(home, '.owl', 'setup', script);
    
    if (!existsSync(scriptPath)) {
      actions.push({
        script,
        scriptPath,
        status: 'error',
        reason: 'Script file does not exist'
      });
      continue;
    }
    
    // Check if script supports the file extension
    const ext = extname(scriptPath).toLowerCase();
    if (!['.js', '.ts', '.sh'].includes(ext)) {
      actions.push({
        script,
        scriptPath,
        status: 'error',
        reason: `Unsupported script type: ${ext} (supported: .js, .ts, .sh)`
      });
      continue;
    }
    
    // Check if script has changed using hash comparison
    const currentHash = await getFileHash(scriptPath);
    const lastExecutedHash = lock.setups[script];
    
    if (currentHash === lastExecutedHash && lastExecutedHash !== '') {
      actions.push({
        script,
        scriptPath,
        status: 'skip',
        reason: 'No changes detected'
      });
    } else {
      actions.push({
        script,
        scriptPath,
        status: 'execute',
        reason: 'Changes detected or first time execution'
      });
    }
  }
  
  return actions;
}

export async function runSetupScripts(scripts: string[]) {
  if (scripts.length === 0) return;
  
  console.log("Setup scripts:");
  
  const actions = await analyzeSetupScripts(scripts);
  const executable = actions.filter(a => a.status === 'execute');
  const errors = actions.filter(a => a.status === 'error');
  
  // Show what will be done using consistent styling
  for (const action of actions) {
    switch (action.status) {
      case 'execute':
        console.log(`  ${icon.script} Execute: ${action.script}`);
        break;
      case 'skip':
        console.log(`  ${icon.skip} Skip: ${action.script} (${action.reason})`);
        break;
      case 'error':
        console.log(`  ${icon.err} Error: ${action.script} (${action.reason})`);
        break;
    }
  }
  
  if (executable.length === 0) {
    if (errors.length > 0) {
      ui.err("All scripts have errors");
    } else {
      ui.ok("No setup scripts to execute");
    }
    return;
  }
  
  const setupSpinner = spinner(`Executing ${executable.length} setup scripts`);
  
  let successCount = 0;
  let errorCount = 0;
  const lock = await loadOwlLock();
  
  for (const action of executable) {
    try {
      setupSpinner.update(`Executing ${action.script}...`);
      
      const { command, args } = getScriptExecutor(action.scriptPath);
      const proc = Bun.spawn([command, ...args], { stdout: 'pipe', stderr: 'pipe' });
      const code = await proc.exited;
      if (code !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(stderr || `Command failed: ${command}`);
      }
      
      // Update the lock with the new hash
      const newHash = await getFileHash(action.scriptPath);
      lock.setups[action.script] = newHash;
      
      successCount++;
    } catch (error: any) {
      errorCount++;
      ui.err(`Failed to execute ${action.script}: ${error?.message || error}`);
    }
  }
  
  // Save the updated lock file
  if (successCount > 0) {
    await saveOwlLock(lock);
  }
  
  if (errorCount === 0) {
    setupSpinner.stop(`${successCount} scripts executed successfully`);
  } else {
    setupSpinner.fail(`${errorCount} failed, ${successCount} succeeded`);
  }
  
  console.log();
}
