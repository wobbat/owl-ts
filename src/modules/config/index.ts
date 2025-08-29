import { loadConfigForHost as loadAst } from "./parser";
export { getRelevantConfigFilesForCurrentSystem } from "./relevance";
import type { ConfigEntry } from "../../types";

export async function loadConfigForHost(hostname: string): Promise<{ entries: ConfigEntry[]; globalEnvs: Array<{ key: string; value: string }>; globalScripts: string[] }> {
  const ast = await loadAst(hostname);
  return { entries: ast.entries as unknown as ConfigEntry[], globalEnvs: ast.globalEnvs, globalScripts: ast.globalScripts };
}
