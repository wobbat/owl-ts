// Legacy text-based parser (pre-AST)
import { readFile } from "fs/promises";
import { resolve } from "path";
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";

import type { ConfigEntry, ServiceSpec } from "../../types";
type OwlConfigEntry = ConfigEntry;

class ConfigParseError extends Error {
  constructor(
    public filePath: string,
    public lineNumber: number,
    public line: string,
    message: string
  ) {
    super(`${filePath}:${lineNumber}: ${message}\n  → ${line.trim()}`);
    this.name = 'ConfigParseError';
  }
}

interface ParseOptions {
  strict?: boolean;
  sourcePath?: string;
  allowInlineComments?: boolean;
  sourceType?: 'main' | 'host' | 'group';
  groupName?: string;
}

function parseInlineComments(line: string): string {
  let result = '';
  let escaped = false;
  let inQuotes = false;
  let quoteChar = '';
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (escaped) { result += char; escaped = false; continue; }
    if (char === '\\') { result += char; escaped = true; continue; }
    if (!inQuotes && (char === '"' || char === "'")) { inQuotes = true; quoteChar = char; result += char; continue; }
    if (inQuotes && char === quoteChar) { inQuotes = false; quoteChar = ''; result += char; continue; }
    if (!inQuotes && char === '#') { break; }
    result += char;
  }
  return result.trim();
}

function validateDirective(directive: string, args: string, lineNum: number, sourcePath: string, rawLine: string): void {
  switch (directive) {
    case '@package':
      if (!args.trim()) throw new ConfigParseError(sourcePath, lineNum, rawLine, 'Package name cannot be empty');
      if (!/^[a-zA-Z0-9_\-\/\.]+$/.test(args.trim())) throw new ConfigParseError(sourcePath, lineNum, rawLine, 'Package name contains invalid characters');
      break;
    case '@group':
      if (!args.trim()) throw new ConfigParseError(sourcePath, lineNum, rawLine, 'Group name cannot be empty');
      if (!/^[a-zA-Z0-9_\-\/]+$/.test(args.trim())) throw new ConfigParseError(sourcePath, lineNum, rawLine, 'Group name contains invalid characters');
      break;
    case ':config':
      if (!/^\s*(\S+)\s*->\s*(\S+)\s*$/.test(args)) throw new ConfigParseError(sourcePath, lineNum, rawLine, 'Config directive must follow format ":config <source> -> <destination>"');
      break;
    case ':setup':
      if (!args.trim()) throw new ConfigParseError(sourcePath, lineNum, rawLine, 'Setup script cannot be empty');
      break;
    case ':service':
      if (!args.trim()) throw new ConfigParseError(sourcePath, lineNum, rawLine, 'Service name cannot be empty');
      if (!/^[a-zA-Z0-9_\-\.]+$/.test(args.trim())) throw new ConfigParseError(sourcePath, lineNum, rawLine, 'Service name contains invalid characters');
      break;
    case '@env':
    case ':env':
      if (!/^\s*(\S+)\s*=\s*(.+)\s*$/.test(args)) throw new ConfigParseError(sourcePath, lineNum, rawLine, `${directive} must follow format "${directive} <KEY> = <VALUE>"`);
      break;
    default:
      if (directive.startsWith('@') || directive.startsWith(':') || directive.startsWith('!')) throw new ConfigParseError(sourcePath, lineNum, rawLine, `Unknown directive: ${directive}`);
  }
}

function parseGlobalEnvironmentVariables(raw: string): Array<{ key: string; value: string }> {
  const lines = raw.split(/\r?\n/);
  const globalEnvs: Array<{ key: string; value: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] || '';
    let line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("@env ")) {
      const match = line.slice(5).trim().match(/^(\S+)\s*=\s*(.+)$/);
      if (match && match[1] && match[2]) globalEnvs.push({ key: match[1], value: match[2] });
    }
  }
  return globalEnvs;
}

function loadGroup(groupName: string, visited: Set<string> = new Set()): OwlConfigEntry[] {
  const OWL_ROOT = resolve(homedir(), ".owl");
  if (visited.has(groupName)) throw new ConfigParseError(`${OWL_ROOT}/groups/${groupName}.owl`, 0, `@group ${groupName}`, `Circular dependency detected for group "${groupName}"`);
  visited.add(groupName);
  const groupPath = resolve(OWL_ROOT, "groups", `${groupName}.owl`);
  if (!existsSync(groupPath)) throw new ConfigParseError(groupPath, 0, `@group ${groupName}`, `Group file not found: ${groupPath}`);
  try {
    const groupRaw = readFileSync(groupPath, "utf8");
    const { entries } = parseOwlConfig(groupRaw, visited, { sourcePath: groupPath, sourceType: 'group', groupName, strict: true });
    return entries;
  } catch (error) {
    if (error instanceof ConfigParseError) throw error;
    throw new ConfigParseError(groupPath, 0, `@group ${groupName}`, `Error loading group "${groupName}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseOwlConfig(raw: string, visited: Set<string> = new Set(), options: ParseOptions = {}): { entries: OwlConfigEntry[], globalEnvs: Array<{ key: string; value: string }> } {
  const lines = raw.split(/\r?\n/);
  const entries: OwlConfigEntry[] = [];
  let current: Partial<OwlConfigEntry> = {};
  let configs: Array<{ source: string; destination: string }> = [];
  let setups: string[] = [];
  let services: string[] = [];
  let envs: Array<{ key: string; value: string }>[] = [] as any;
  let packagesMode = false;
  let pendingPackages: string[] = [];

  const sourcePath = options.sourcePath || '<unknown>';
  const sourceType = options.sourceType;
  const groupName = options.groupName;
  const strict = options.strict ?? true;
  const allowInlineComments = options.allowInlineComments ?? true;

  function createEntry(packageName: string, configs: Array<{ source: string; destination: string }>, setups: string[], svcs: string[], envs: Array<{ key: string; value: string }>): OwlConfigEntry {
    const servicesStruct: ServiceSpec[] = (svcs || []).map(name => ({ name, enable: true, start: true }));
    return { package: packageName, configs, setups, services: servicesStruct, envs, sourceFile: sourcePath, sourceType, groupName } as OwlConfigEntry;
  }

  function errorAt(lineNum: number, rawLine: string, message: string): void {
    const error = new ConfigParseError(sourcePath, lineNum, rawLine, message);
    if (strict) throw error; else console.warn(error.message);
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] || '';
    let line = rawLine;
    if (allowInlineComments) line = parseInlineComments(rawLine);
    line = line.trim();
    if (!line) continue;

    if (line.startsWith("@group ")) {
      const name = line.slice(7).trim();
      try {
        validateDirective('@group', name, i + 1, sourcePath, rawLine);
        const groupEntries = loadGroup(name, visited);
        entries.push(...groupEntries);
      } catch (error) {
        if (error instanceof ConfigParseError) errorAt(i + 1, rawLine, error.message.split(': ')[1] ?? error.message);
        else errorAt(i + 1, rawLine, `Error loading group: ${error}`);
      }
    } else if (line.startsWith("@env ")) {
      // parsed separately
    } else if (line === "@packages") {
      packagesMode = true; pendingPackages = [];
    } else if (packagesMode && !line.startsWith("@") && !line.startsWith(":") && !line.startsWith("!")) {
      try {
        validateDirective('@package', line, i + 1, sourcePath, rawLine);
        pendingPackages.push(line);
      } catch (error) { if (error instanceof ConfigParseError) errorAt(i + 1, rawLine, error.message.split(': ')[1] ?? error.message); }
    } else {
      if (packagesMode) { packagesMode = false; for (const pkg of pendingPackages) entries.push(createEntry(pkg, [], [], [], [])); pendingPackages = []; }
      if (line.startsWith("@package ")) {
        if (current.package) entries.push(createEntry(current.package, configs, setups, services, (envs as any)));
        const pkgName = line.slice(9).trim();
        try {
          validateDirective('@package', pkgName, i + 1, sourcePath, rawLine);
          current = { package: pkgName }; configs = []; setups = []; services = []; envs = [] as any;
        } catch (error) { if (error instanceof ConfigParseError) errorAt(i + 1, rawLine, error.message.split(': ')[1] ?? error.message); }
      } else if (line.startsWith(":config ")) {
        const configArgs = line.slice(8).trim();
        try {
          validateDirective(':config', configArgs, i + 1, sourcePath, rawLine);
          const match = configArgs.match(/^(\S+)\s*->\s*(\S+)$/);
          if (match && match[1] && match[2]) {
            const home = process.env.HOME || homedir();
            const owlDotfilesPath = resolve(home, ".owl", "dotfiles", match[1]);
            configs.push({ source: owlDotfilesPath, destination: match[2] });
          }
        } catch (error) { if (error instanceof ConfigParseError) errorAt(i + 1, rawLine, error.message.split(': ')[1] ?? error.message); }
      } else if (line.startsWith(":service ")) {
        const serviceName = line.slice(9).trim();
        try { validateDirective(':service', serviceName, i + 1, sourcePath, rawLine); services.push(serviceName); }
        catch (error) { if (error instanceof ConfigParseError) errorAt(i + 1, rawLine, error.message.split(': ')[1] ?? error.message); }
      } else if (line.startsWith(":env ")) {
        const envArgs = line.slice(6).trim();
        try { validateDirective(':env', envArgs, i + 1, sourcePath, rawLine); const m = envArgs.match(/^(\S+)\s*=\s*(.+)$/); if (m && m[1] && m[2]) (envs as any).push({ key: m[1], value: m[2] }); }
        catch (error) { if (error instanceof ConfigParseError) errorAt(i + 1, rawLine, error.message.split(': ')[1] ?? error.message); }
      } else if (line.startsWith("!")) {
        // reserved for future
      } else {
        if (line.startsWith("@") || line.startsWith(":") || line.startsWith("!")) {
          const parts = line.split(/\s+/); const directive = parts[0] || ''; const args = parts.slice(1).join(' ') || '';
          try { validateDirective(directive, args, i + 1, sourcePath, rawLine); } catch (error) { if (error instanceof ConfigParseError) { const em = error.message.split(': '); const msg = em.length > 1 ? em[1] : error.message; errorAt(i + 1, rawLine, msg || 'Unknown error'); } }
        } else {
          errorAt(i + 1, rawLine, `Unrecognized line: "${line}". Expected a directive (@package, @group, :config, :setup) or package name in @packages block`);
        }
      }
    }
  }

  if (packagesMode && pendingPackages.length > 0) { for (const pkg of pendingPackages) entries.push(createEntry(pkg, [], [], [], [])); }
  if ((current as any).package) entries.push(createEntry((current as any).package, configs, setups, services, (envs as any)));

  const parsedGlobalEnvs = parseGlobalEnvironmentVariables(raw);
  return { entries, globalEnvs: parsedGlobalEnvs };
}

export async function loadConfigForHost(hostname: string): Promise<{ entries: OwlConfigEntry[], globalEnvs: Array<{ key: string; value: string }>, globalScripts: string[] }> {
  const OWL_ROOT = resolve(homedir(), ".owl");
  const globalPath = resolve(OWL_ROOT, "main.owl");
  try {
    if (!existsSync(globalPath)) throw new ConfigParseError(globalPath, 0, '', `Global config file not found: ${globalPath}`);

    const globalRaw = await readFile(globalPath, "utf8");
    const { entries: globalEntries, globalEnvs: globalGlobalEnvs } = parseOwlConfig(globalRaw, new Set(), { sourcePath: globalPath, sourceType: 'main', strict: true });

    const hostPath = resolve(OWL_ROOT, `hosts/${hostname}.owl`);
    let hostEntries: OwlConfigEntry[] = [];
    let hostGlobalEnvs: Array<{ key: string; value: string }> = [];

    if (existsSync(hostPath)) {
      try {
        const hostRaw = await readFile(hostPath, "utf8");
        const { entries: hostConfigEntries, globalEnvs: parsedHostGlobalEnvs } = parseOwlConfig(hostRaw, new Set(), { sourcePath: hostPath, sourceType: 'host', strict: true });
        hostEntries = hostConfigEntries; hostGlobalEnvs = parsedHostGlobalEnvs;
      } catch (error) {
        if (error instanceof ConfigParseError) throw error;
        throw new ConfigParseError(hostPath, 0, '', `Failed to parse host config: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const merged: Record<string, OwlConfigEntry> = {};
    for (const entry of globalEntries) merged[entry.package] = entry;
    for (const entry of hostEntries) {
      const existingEntry = merged[entry.package];
      if (existingEntry) {
        merged[entry.package] = {
          package: entry.package,
          configs: entry.configs.length > 0 ? entry.configs : existingEntry.configs,
          setups: entry.setups.length > 0 ? entry.setups : existingEntry.setups,
          sourceFile: entry.sourceFile,
          sourceType: entry.sourceType,
          groupName: entry.groupName
        } as any;
      } else {
        merged[entry.package] = entry;
      }
    }

    const allConfigContent = [globalRaw];
    let hostRaw = '';
    if (existsSync(hostPath)) { hostRaw = await readFile(hostPath, "utf8"); allConfigContent.push(hostRaw); }

    const combinedGlobalEnvs = [...globalGlobalEnvs, ...hostGlobalEnvs];
    return { entries: Object.values(merged), globalEnvs: combinedGlobalEnvs, globalScripts: [] };
  } catch (error) {
    if (error instanceof ConfigParseError) throw error;
    throw new ConfigParseError('<unknown>', 0, '', `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
  }
}
