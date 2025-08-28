/**
 * Shared search utilities for both add and search commands
 */

import { PacmanManager } from "../modules/pacman/manager";
import type { SearchResult } from "../types";

/**
 * Perform narrowing search (yay-style): search with first term, then filter by subsequent terms
 */
export async function performNarrowingSearch(
  manager: PacmanManager,
  terms: string[],
  source: "repo" | "aur" | "any"
): Promise<SearchResult[]> {
  if (terms.length === 0) return [];

  // Search with the first term to get initial results
  let results = await manager.searchPackages(terms[0] || "");

  // Filter by source if specified
  if (source === "repo") {
    results = results.filter(r => r.repository !== "aur");
  } else if (source === "aur") {
    results = results.filter(r => r.repository === "aur");
  }

  // Apply narrowing with subsequent terms
  for (const term of terms.slice(1)) {
    results = filterResultsByTerm(results, term);
  }

  return results;
}

/**
 * Optimized search that batches installation checks to improve performance
 */
export async function performOptimizedSearch(
  manager: PacmanManager,
  terms: string[],
  source: "repo" | "aur" | "any"
): Promise<SearchResult[]> {
  if (terms.length === 0) return [];

  // Get all installed packages once for batch checking
  const installedPackages = await manager.getInstalledPackages();
  const installedSet = new Set(installedPackages);

  let results: SearchResult[];

  if (terms.length === 1) {
    // Single term search - use optimized search
    results = await manager.searchPackagesOptimized(terms[0] || "", installedSet);
  } else {
    // Compound search - search for packages that match ALL terms
    results = await performCompoundSearch(manager, terms, installedSet);
  }

  // Filter by source if specified
  if (source === "repo") {
    results = results.filter(r => r.repository !== "aur");
  } else if (source === "aur") {
    results = results.filter(r => r.repository === "aur");
  }

  return results;
}

/**
 * Perform compound search for packages that match ALL search terms
 */
async function performCompoundSearch(
  manager: PacmanManager,
  terms: string[],
  installedSet: Set<string>
): Promise<SearchResult[]> {
  // For compound searches, we need to search for each term and combine results
  // This ensures we don't miss packages like "neovim-git" when searching "neovim git"

  const allResults = new Map<string, SearchResult>();

  // Search for each term individually and collect all unique results
  for (const term of terms) {
    const termResults = await manager.searchPackagesOptimized(term, installedSet);

    // Add all results to our collection
    for (const result of termResults) {
      if (!allResults.has(result.name)) {
        allResults.set(result.name, result);
      }
    }
  }

  // Convert map to array
  let results = Array.from(allResults.values());

  // Filter results to only include packages that match ALL terms
  const filteredResults = results.filter(result => {
    const name = result.name.toLowerCase();
    const desc = result.description?.toLowerCase() || "";

    // Check if ALL search terms are present in name or description
    const matches = terms.every(term => {
      const lowerTerm = term.toLowerCase();
      return name.includes(lowerTerm) || desc.includes(lowerTerm);
    });

    return matches;
  });

  return filteredResults;
}

/**
 * Filter search results by checking if they contain the term (case-insensitive)
 */
export function filterResultsByTerm(results: SearchResult[], term: string): SearchResult[] {
  if (!term) return results;

  const lowerTerm = term.toLowerCase();
  return results.filter(result =>
    result.name.toLowerCase().includes(lowerTerm) ||
    result.description?.toLowerCase().includes(lowerTerm) ||
    result.repository.toLowerCase().includes(lowerTerm)
  );
}

/**
 * Display search results in legacy-compatible format
 */
export function displaySearchResults(results: SearchResult[]): void {
  if (results.length === 0) {
    return;
  }

  // Color functions - toned down to match Go version styling
  const aurFunc = (s: string) => `\x1b[34m${s}\x1b[0m`;    // Softer blue for AUR
  const repoFunc = (s: string) => `\x1b[33m${s}\x1b[0m`;   // Yellow for actual repo name
  const nameFunc = (s: string) => `\x1b[37m${s}\x1b[0m`;   // Clean white for package names
  const versionFunc = (s: string) => `\x1b[32m${s}\x1b[0m`; // Green for version
  const descFunc = (s: string) => `\x1b[37m${s}\x1b[0m`;    // Regular white for description

  // Display packages in reverse order so most relevant appear at bottom
  for (let i = results.length - 1; i >= 0; i--) {
    const result = results[i];

    if (!result) continue;

    // Format package name in clean white
    const namePart = nameFunc(result.name);

    // Format version in green
    const versionPart = versionFunc(result.version);

    // Format source tag
    let sourceTag: string;
    if (result.repository === "aur") {
      sourceTag = `[${aurFunc("aur")}]`;
    } else {
      sourceTag = `[${repoFunc(result.repository)}]`;
    }

    let line = `${namePart} ${versionPart} ${sourceTag}`;
    if (result.description) {
      line += ` - ${descFunc(result.description)}`;
    }

    console.log(line);
  }
}
