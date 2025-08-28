import { loadConfigForHost as loadAst } from "./parser";
import { loadConfigForHost as loadLegacy } from "./parser_legacy";
export { getRelevantConfigFilesForCurrentSystem } from "./relevance";

export async function loadConfigForHost(hostname: string, useLegacyParser?: boolean) {
  if (useLegacyParser) {
    return loadLegacy(hostname);
  }
  return loadAst(hostname);
}
