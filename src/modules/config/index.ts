import { loadConfigForHost as loadAst } from "./parser";
import { loadConfigForHost as loadLegacy } from "./parser_legacy";
export { getRelevantConfigFilesForCurrentSystem } from "./relevance";
import type { ConfigEntry } from "../../types";

export async function loadConfigForHost(hostname: string, useLegacyParser?: boolean): Promise<{ entries: ConfigEntry[]; globalEnvs: Array<{ key: string; value: string }>; globalScripts: string[] }> {
  if (useLegacyParser) {
    const legacy = await loadLegacy(hostname);
    // Normalize shape: ensure globalScripts exists
    return { entries: legacy.entries as unknown as ConfigEntry[], globalEnvs: legacy.globalEnvs, globalScripts: (legacy as any).globalScripts || [] };
  }
  const ast = await loadAst(hostname);
  return { entries: ast.entries as unknown as ConfigEntry[], globalEnvs: ast.globalEnvs, globalScripts: ast.globalScripts };
}
