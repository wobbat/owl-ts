/**
 * Search command handler for Owl package manager
 */

import { ui } from "../ui";
import { performOptimizedSearch, displaySearchResults } from "../utils/search";
import { PacmanManager } from "../pacman-manager";
import { safeExecute } from "../utils/errors";
import type { CommandOptions } from "../commands";

/**
 * Handle the search command
 */
export async function handleSearchCommand(
  searchTerms: string[],
  options: CommandOptions
): Promise<void> {
  // Validate arguments
  if (searchTerms.length === 0) {
    throw new Error("search term required");
  }

  // Initialize package manager
  const packageManager = new PacmanManager();

  ui.header("Search Packages");

  // Determine source filter
  let source: "repo" | "aur" | "any" = "any";
  if (options.aur) {
    source = "aur";
  } else if (options.repo) {
    source = "repo";
  }

  // Perform optimized search
  const searchResults = await safeExecute(
    () => performOptimizedSearch(packageManager, searchTerms, source),
    "Failed to search packages"
  );

  if (searchResults.length === 0) {
    const searchQuery = searchTerms.join(" ");
    ui.error(`No packages found for: ${searchQuery}`);
    return;
  }

  // Display results
  displaySearchResults(searchResults);
}