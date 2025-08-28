import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { hostname } from "os";
import { getHomeDirectory } from "../../utils/fs";

/**
 * Returns absolute paths to relevant Owl config files for the current system:
 * - ~/.owl/main.owl
 * - ~/.owl/hosts/<hostname>.owl
 * - Any @group <name> included by those files (recursively)
 */
export async function getRelevantConfigFilesForCurrentSystem(): Promise<string[]> {
  const home = getHomeDirectory();
  const owlRoot = join(home, ".owl");
  const absFiles = new Set<string>();
  const mainPath = join(owlRoot, "main.owl");
  const hostPath = join(owlRoot, "hosts", `${hostname()}.owl`);

  const groupPaths = new Set<string>();
  const visitedGroups = new Set<string>();

  function collectGroupsFromFile(absPath: string) {
    try {
      const raw = readFileSync(absPath, 'utf8');
      const lines = raw.split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.replace(/#.*/, '').trim();
        const m = line.match(/^@group\s+(\S+)/);
        if (m) {
          const name = m[1] || "";
          if (!name) continue;
          if (visitedGroups.has(name)) continue;
          visitedGroups.add(name);
          const p = join(owlRoot, 'groups', `${name}.owl`);
          if (existsSync(p)) {
            groupPaths.add(p);
            collectGroupsFromFile(p);
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (existsSync(mainPath)) {
    absFiles.add(mainPath);
    collectGroupsFromFile(mainPath);
  }
  if (existsSync(hostPath)) {
    absFiles.add(hostPath);
    collectGroupsFromFile(hostPath);
  }

  for (const gp of groupPaths) absFiles.add(gp);
  return Array.from(absFiles);
}
