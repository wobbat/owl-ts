// AST-based parser (default)
import { existsSync, readFileSync } from "fs";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { resolve } from "path";

type SourceType = 'main' | 'host' | 'group';

interface OwlConfigEntry {
  package: string;
  configs: Array<{ source: string; destination: string }>;
  setups: string[];
  services?: Array<{ name: string; scope?: 'system' | 'user'; enable?: boolean; start?: boolean; restart?: boolean; reload?: boolean; mask?: boolean }>;
  envs?: Array<{ key: string; value: string }>;
  sourceFile?: string;
  sourceType?: SourceType;
  groupName?: string;
}

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

// Lexer
type TokenType =
  | 'AT_PACKAGE' | 'AT_PACKAGES' | 'AT_ENV' | 'AT_GROUP'
  | 'COLON_CONFIG' | 'COLON_ENV' | 'COLON_SERVICE' | 'COLON_SCRIPT'
  | 'AT_SCRIPT'
  | 'BANG_SETUP' | 'PACKAGE_NAME' | 'TEXT' | 'EOF';

interface Token { type: TokenType; value?: string; line: number; raw: string; file: string; }

function stripInlineComment(line: string): string {
  let out = '';
  let inQuotes = false;
  let q: string = '';
  let esc = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (esc) { out += ch; esc = false; continue; }
    if (ch === '\\') { out += ch; esc = true; continue; }
    if (!inQuotes && (ch === '"' || ch === "'")) { inQuotes = true; q = ch; out += ch; continue; }
    if (inQuotes && ch === q) { inQuotes = false; q = ''; out += ch; continue; }
    if (!inQuotes && ch === '#') break;
    out += ch;
  }
  return out.trim();
}

function lex(source: string, file: string): Token[] {
  const tokens: Token[] = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? '';
    const stripped = stripInlineComment(rawLine);
    const line = stripped.trim();
    if (!line) continue;
    const push = (type: TokenType, value?: string) => tokens.push({ type, value, line: i + 1, raw: rawLine, file });
    if (line === '@packages') { push('AT_PACKAGES'); continue; }
    if (line.startsWith('@package ')) { push('AT_PACKAGE', line.slice(9).trim()); continue; }
    if (line.startsWith('@env ')) { push('AT_ENV', line.slice(5).trim()); continue; }
    if (line.startsWith('@group ')) { push('AT_GROUP', line.slice(7).trim()); continue; }
    if (line.startsWith('@script ')) { push('AT_SCRIPT', line.slice(8).trim()); continue; }
    if (line.startsWith(':config ')) { push('COLON_CONFIG', line.slice(8).trim()); continue; }
    if (line.startsWith(':env ')) { push('COLON_ENV', line.slice(5).trim()); continue; }
    if (line.startsWith(':service ')) { push('COLON_SERVICE', line.slice(9).trim()); continue; }
    if (line.startsWith(':script ')) { push('COLON_SCRIPT', line.slice(8).trim()); continue; }
    if (line.startsWith('!setup ')) { push('BANG_SETUP', line.slice(7).trim()); continue; }
    // In @packages mode, bare words are package names; we handle them in parser, but lex as TEXT
    push('TEXT', line);
  }
  tokens.push({ type: 'EOF', line: lines.length + 1, raw: '', file });
  return tokens;
}

// AST nodes
type Node =
  | { kind: 'Program'; body: Node[]; file: string }
  | { kind: 'PackageDecl'; name: string; line: number; file: string }
  | { kind: 'PackagesStart'; line: number; file: string }
  | { kind: 'PackagesItem'; name: string; line: number; file: string }
  | { kind: 'GroupInclude'; name: string; line: number; file: string }
  | { kind: 'GlobalEnv'; key: string; value: string; line: number; file: string }
  | { kind: 'PkgConfig'; src: string; dest: string; line: number; file: string }
  | { kind: 'PkgEnv'; key: string; value: string; line: number; file: string }
  | { kind: 'PkgService'; name: string; props?: Record<string, any>; line: number; file: string }
  | { kind: 'PkgScript'; script: string; line: number; file: string }
  | { kind: 'GlobalScript'; script: string; line: number; file: string };

function assert(condition: any, file: string, line: number, raw: string, message: string): asserts condition {
  if (!condition) throw new ConfigParseError(file, line, raw, message);
}

function parseTokens(tokens: Token[]): Node {
  const file = tokens[0]?.file || '<unknown>';
  const program: Node = { kind: 'Program', body: [], file };
  let i = 0;
  let inPackages = false;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t.type === 'EOF') break;
    switch (t.type) {
      case 'AT_PACKAGES':
        program.body.push({ kind: 'PackagesStart', line: t.line, file });
        inPackages = true;
        i++;
        break;
      case 'TEXT':
        if (inPackages) {
          program.body.push({ kind: 'PackagesItem', name: t.value || '', line: t.line, file });
          i++;
          break;
        }
        // fallthrough to error below
        throw new ConfigParseError(t.file, t.line, t.raw, `Unrecognized line: "${t.value}"`);
      case 'AT_PACKAGE':
        inPackages = false;
        assert((t.value || '').trim().length > 0, t.file, t.line, t.raw, 'Package name cannot be empty');
        // Support inline lists: @package a, b, c
        const pkgList = (t.value as string).split(',').map(s => s.trim()).filter(Boolean);
        for (const name of pkgList) program.body.push({ kind: 'PackageDecl', name, line: t.line, file });
        i++;
        break;
      case 'AT_GROUP':
        inPackages = false;
        assert((t.value || '').trim().length > 0, t.file, t.line, t.raw, 'Group name cannot be empty');
        program.body.push({ kind: 'GroupInclude', name: (t.value as string).trim(), line: t.line, file });
        i++;
        break;
      case 'AT_ENV': {
        inPackages = false;
        const m = (t.value as string).match(/^(\S+)\s*=\s*(.+)$/);
        assert(!!m, t.file, t.line, t.raw, '@env must follow format "@env <KEY> = <VALUE>"');
        program.body.push({ kind: 'GlobalEnv', key: m![1] as string, value: m![2] as string, line: t.line, file });
        i++;
        break;
      }
      case 'COLON_CONFIG': {
        inPackages = false;
        const m = (t.value as string).match(/^(\S+)\s*->\s*(\S+)$/);
        assert(!!m, t.file, t.line, t.raw, ':config must follow format ":config <source> -> <destination>"');
        program.body.push({ kind: 'PkgConfig', src: m![1] as string, dest: m![2] as string, line: t.line, file });
        i++;
        break;
      }
      case 'COLON_ENV': {
        inPackages = false;
        const m = (t.value as string).match(/^(\S+)\s*=\s*(.+)$/);
        assert(!!m, t.file, t.line, t.raw, ':env must follow format ":env <KEY> = <VALUE>"');
        program.body.push({ kind: 'PkgEnv', key: m![1] as string, value: m![2] as string, line: t.line, file });
        i++;
        break;
      }
      case 'COLON_SERVICE': {
        inPackages = false;
        const raw = (t.value as string).trim();
        assert(!!raw, t.file, t.line, t.raw, 'Service cannot be empty');
        // Parse optional properties in brackets: name [ key = value, ... ]
        const svcMatch = raw.match(/^(\S+)(?:\s*\[(.+)\])?\s*$/);
        assert(!!svcMatch, t.file, t.line, t.raw, 'Invalid service syntax');
        const name = (svcMatch![1] || '').trim();
        const propsRaw = (svcMatch![2] || '').trim();
        const props: Record<string, any> = {};
        if (propsRaw) {
          const parts = propsRaw.split(',').map(s => s.trim()).filter(Boolean);
          for (const p of parts) {
            const m = p.match(/^(\S+)\s*=\s*(.+)$/);
            if (m) {
              const key = m[1];
              let val: any = m[2];
              if (/^(true|false)$/i.test(val)) val = /^true$/i.test(val);
              props[key] = val;
            }
          }
        }
        program.body.push({ kind: 'PkgService', name, props, line: t.line, file });
        i++;
        break;
      }
      case 'COLON_SCRIPT': {
        inPackages = false;
        const script = (t.value as string).trim();
        assert(!!script, t.file, t.line, t.raw, 'Script name cannot be empty');
        program.body.push({ kind: 'PkgScript', script, line: t.line, file });
        i++;
        break;
      }
      case 'AT_SCRIPT': {
        inPackages = false;
        const script = (t.value as string).trim();
        assert(!!script, t.file, t.line, t.raw, 'Script name cannot be empty');
        program.body.push({ kind: 'GlobalScript', script, line: t.line, file });
        i++;
        break;
      }
      case 'BANG_SETUP': { // back-compat: treat !setup as package script
        inPackages = false;
        const script = (t.value as string).trim();
        assert(!!script, t.file, t.line, t.raw, 'Setup script cannot be empty');
        program.body.push({ kind: 'PkgScript', script, line: t.line, file });
        i++;
        break;
      }
      default:
        throw new ConfigParseError(t.file, t.line, t.raw, `Unexpected token: ${t.type}`);
    }
  }
  return program;
}

function transformToEntries(ast: Node, ctx: { sourcePath: string; sourceType: SourceType; groupName?: string; visited: Set<string> }): { entries: OwlConfigEntry[], globalEnvs: Array<{ key: string; value: string }>, globalScripts: string[] } {
  const entriesMap = new Map<string, OwlConfigEntry>();
  const globalEnvs: Array<{ key: string; value: string }> = [];
  const globalScripts: string[] = [];
  const body = (ast as any).body as Node[];
  let currentPkg: string | null = null;
  const OWL_ROOT = resolve(homedir(), ".owl");

  function ensureEntry(name: string): OwlConfigEntry {
    let e = entriesMap.get(name);
    if (!e) {
      e = {
        package: name,
        configs: [],
        setups: [],
        services: [],
        envs: [],
        sourceFile: ctx.sourcePath,
        sourceType: ctx.sourceType,
        groupName: ctx.groupName
      };
      entriesMap.set(name, e);
    }
    return e;
  }

  for (const node of body) {
    switch (node.kind) {
      case 'PackagesStart':
        currentPkg = null; // items follow
        break;
      case 'PackagesItem':
        ensureEntry(node.name);
        break;
      case 'PackageDecl':
        currentPkg = node.name;
        ensureEntry(node.name);
        break;
      case 'GroupInclude': {
        const name = node.name;
        if (ctx.visited.has(name)) {
          throw new ConfigParseError(resolve(OWL_ROOT, 'groups', `${name}.owl`), node.line, `@group ${name}`, `Circular dependency detected for group "${name}"`);
        }
        ctx.visited.add(name);
        const groupPath = resolve(OWL_ROOT, 'groups', `${name}.owl`);
        if (!existsSync(groupPath)) {
          throw new ConfigParseError(groupPath, node.line, `@group ${name}`, `Group file not found: ${groupPath}`);
        }
        const raw = readFileSync(groupPath, 'utf8');
        const toks = lex(raw, groupPath);
        const groupAst = parseTokens(toks);
        const { entries: ge } = transformToEntries(groupAst, { sourcePath: groupPath, sourceType: 'group', groupName: name, visited: ctx.visited });
        for (const e of ge) {
          // Entries from group are appended as-is; if duplicates, last wins by simple merge
          const existing = entriesMap.get(e.package);
          if (!existing) entriesMap.set(e.package, e);
          else entriesMap.set(e.package, { ...existing, ...e, configs: e.configs.length ? e.configs : existing.configs, setups: e.setups.length ? e.setups : existing.setups, services: (e.services?.length ? e.services : existing.services) });
        }
        break;
      }
      case 'GlobalEnv':
        globalEnvs.push({ key: node.key, value: node.value });
        break;
      case 'GlobalScript':
        globalScripts.push(node.script);
        break;
      case 'PkgConfig': {
        if (!currentPkg) throw new ConfigParseError(ast.file, node.line, ':config', 'Package context required before :config');
        const home = process.env.HOME || homedir();
        const owlDotfilesPath = resolve(home, '.owl', 'dotfiles', node.src);
        ensureEntry(currentPkg).configs.push({ source: owlDotfilesPath, destination: node.dest });
        break;
      }
      case 'PkgEnv': {
        if (!currentPkg) throw new ConfigParseError(ast.file, node.line, ':env', 'Package context required before :env');
        ensureEntry(currentPkg).envs!.push({ key: node.key, value: node.value });
        break;
      }
      case 'PkgService': {
        if (!currentPkg) throw new ConfigParseError(ast.file, (node as any).line, ':service', 'Package context required before :service');
        const props = (node as any).props || {};
        const scope = props.scope === 'user' ? 'user' : 'system';
        const svc = {
          name: (node as any).name,
          scope,
          // Defaults: if not specified, enable and start by default
          enable: props.enable !== undefined ? Boolean(props.enable) : true,
          start: props.start !== undefined ? Boolean(props.start) : true,
          restart: props.restart !== undefined ? Boolean(props.restart) : undefined,
          reload: props.reload !== undefined ? Boolean(props.reload) : undefined,
          mask: props.mask !== undefined ? Boolean(props.mask) : undefined,
        } as OwlConfigEntry['services'][number];
        ensureEntry(currentPkg).services!.push(svc);
        break;
      }
      case 'PkgScript': {
        if (!currentPkg) throw new ConfigParseError(ast.file, (node as any).line, ':script', 'Package context required before :script');
        ensureEntry(currentPkg).setups.push((node as any).script);
        break;
      }
    }
  }

  return { entries: Array.from(entriesMap.values()), globalEnvs, globalScripts };
}

export async function loadConfigForHost(hostname: string): Promise<{ entries: OwlConfigEntry[], globalEnvs: Array<{ key: string; value: string }>, globalScripts: string[] }> {
  const OWL_ROOT = resolve(homedir(), ".owl");
  const globalPath = resolve(OWL_ROOT, "main.owl");
  if (!existsSync(globalPath)) throw new ConfigParseError(globalPath, 0, '', `Global config file not found: ${globalPath}`);

  const visited = new Set<string>();
  const globalRaw = await readFile(globalPath, 'utf8');
  const globalAst = parseTokens(lex(globalRaw, globalPath));
  const { entries: globalEntries, globalEnvs: globalGlobalEnvs, globalScripts: globalScripts1 } = transformToEntries(globalAst, { sourcePath: globalPath, sourceType: 'main', visited });

  const hostPath = resolve(OWL_ROOT, `hosts/${hostname}.owl`);
  let hostEntries: OwlConfigEntry[] = [];
  let hostGlobalEnvs: Array<{ key: string; value: string }> = [];
  let hostGlobalScripts: string[] = [];

  if (existsSync(hostPath)) {
    const hostRaw = await readFile(hostPath, 'utf8');
    const hostAst = parseTokens(lex(hostRaw, hostPath));
    const hostTransformed = transformToEntries(hostAst, { sourcePath: hostPath, sourceType: 'host', visited: new Set<string>() });
    hostEntries = hostTransformed.entries; hostGlobalEnvs = hostTransformed.globalEnvs; hostGlobalScripts = hostTransformed.globalScripts;
  }

  // Merge host over global: if host has arrays non-empty, override
  const merged: Record<string, OwlConfigEntry> = {};
  for (const e of globalEntries) merged[e.package] = e;
  for (const e of hostEntries) {
    const existing = merged[e.package];
    if (existing) {
      merged[e.package] = {
        package: e.package,
        configs: e.configs.length ? e.configs : existing.configs,
        setups: e.setups.length ? e.setups : existing.setups,
        services: (e.services && e.services.length ? e.services : existing.services),
        envs: (e.envs && e.envs.length ? e.envs : existing.envs),
        sourceFile: e.sourceFile,
        sourceType: e.sourceType,
        groupName: e.groupName
      } as any;
    } else {
      merged[e.package] = e;
    }
  }

  const combinedGlobalEnvs = [...globalGlobalEnvs, ...hostGlobalEnvs];
  const combinedGlobalScripts = [...globalScripts1, ...hostGlobalScripts];
  return { entries: Object.values(merged), globalEnvs: combinedGlobalEnvs, globalScripts: combinedGlobalScripts };
}
