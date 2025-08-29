/**
 * Add command handler for Owl package manager
 */

import { ui } from "../../ui";
import { loadConfigForHost } from "../../modules/config";
import { hostname } from "os";
import pc from "picocolors";
import { safeExecute } from "../../utils/errors";
import { PacmanManager } from "../../modules/pacman/manager";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getHomeDirectory } from "../../utils/fs";
import { performOptimizedSearch, filterResultsByTerm } from "../../utils/search";
import type { CommandOptions } from "../commands";
import type { SearchResult, ConfigEntry } from "../../types";
import { getRelevantConfigFilesForCurrentSystem } from "../../modules/config";

/**
 * Handle the add command for searching and adding packages to config files
 */
export async function handleAddCommand(
  searchTerms: string[],
  options: CommandOptions
): Promise<void> {
  // Validate arguments
  if (!options.exact && searchTerms.length === 0) {
    throw new Error("search query required (or use --exact)");
  }

  // Initialize package manager
  const packageManager = new PacmanManager();

  // Determine the search terms
  let queryTerms: string[];
  if (options.exact) {
    queryTerms = [options.exact];
  } else {
    queryTerms = searchTerms;
  }

  ui.header("Search Packages");

  // Perform optimized narrowing search (yay-style)
  const searchResults = await safeExecute(
    () => performOptimizedSearch(packageManager, queryTerms, options.source || "any"),
    "Failed to search packages"
  );

  if (searchResults.length === 0) {
    return handleNoResults(queryTerms, options);
  }

  // Handle exact match or single result
  if (options.exact || (searchResults.length === 1 && options.yes)) {
    const selectedPackage = options.exact
      ? searchResults.find(r => r.name.toLowerCase() === (options.exact || "").toLowerCase())
      : searchResults[0];

    if (!selectedPackage) {
      return handlePackageNotFound(options.exact || "", options);
    }

    await addPackageToConfig(selectedPackage, options);
    return;
  }

  // Handle multiple results with --yes flag
  if (searchResults.length > 1 && options.yes) {
    return handleMultipleResults(queryTerms, options);
  }

  // Interactive selection
  const selectedPackage = await selectPackageInteractively(searchResults as any);
  if (selectedPackage) {
    await addPackageToConfig(selectedPackage, options);
  }
}



/**
 * Handle case when no packages are found
 */
function handleNoResults(queryTerms: string[], options: CommandOptions): void {
  const searchQuery = queryTerms.join(" ");
  
  if (options.json) {
    console.log(JSON.stringify({
      action: "add",
      status: "no-results",
      dry_run: options.dryRun || false,
      query: searchQuery
    }, null, 2));
  } else {
    ui.error(`No packages found for: ${searchQuery}`);
  }
}

/**
 * Handle case when exact package is not found
 */
function handlePackageNotFound(exactName: string, options: CommandOptions): void {
  if (options.json) {
    console.log(JSON.stringify({
      action: "add",
      status: "error",
      dry_run: options.dryRun || false,
      error: `Package '${exactName}' not found`
    }, null, 2));
  } else {
    ui.error(`Package '${exactName}' not found`);
  }
}

/**
 * Handle case when multiple results are found with --yes flag
 */
function handleMultipleResults(queryTerms: string[], options: CommandOptions): void {
  const searchQuery = queryTerms.join(" ");
  
  if (options.json) {
    console.log(JSON.stringify({
      action: "add",
      status: "error",
      dry_run: options.dryRun || false,
      error: `Multiple packages found for '${searchQuery}'. Use --exact to specify package name`
    }, null, 2));
  } else {
    ui.error(`Multiple packages found for '${searchQuery}'. Use --exact to specify package name or select interactively.`);
  }
}

/**
 * Interactively select a package from search results
 */
async function selectPackageInteractively(results: SearchResult[]): Promise<SearchResult | null> {
  console.log(`\n${pc.bold("Found")} ${results.length} package(s):\n`);

  // Color functions - toned down for better readability (matching Go version)
  const bracketFunc = pc.green;
  const aurFunc = pc.blue;
  const repoFunc = pc.yellow;
  const nameFunc = pc.white;
  const versionFunc = pc.green;
  const descFunc = pc.white;

  // Display packages in reverse order so most relevant appear at bottom
  for (let i = results.length - 1; i >= 0; i--) {
    const pkg = results[i];
    if (!pkg) continue;

    // Format number with green brackets
    const numberPart = `${bracketFunc("[")}${i + 1}${bracketFunc("]")}`;

    // Format package name in clean white
    const namePart = nameFunc(pkg.name);

    // Format version in green
    const versionPart = versionFunc(pkg.version);

    // Format source tag
    let sourceTag: string;
    if (pkg.repository === "aur") {
      sourceTag = `[${aurFunc("aur")}]`;
    } else {
      sourceTag = `[${repoFunc(pkg.repository)}]`;
    }

    // Format installation status - only show if installed
    const statusPart = pkg.installed ? ` ${pc.green("installed")}` : "";

    let line = `${numberPart} ${namePart} ${versionPart} ${sourceTag}${statusPart}`;
    if (pkg.description) {
      line += ` - ${descFunc(pkg.description)}`;
    }
    console.log(line);
  }

  console.log();

  const selection = await promptSelection(results.length);
  if (selection > 0 && selection <= results.length) {
    return results[selection - 1] || null;
  }

  return null;
}

/**
 * Prompt user for package selection (matching Go version style)
 */
async function promptSelection(max: number): Promise<number> {
  const { createInterface } = await import("readline");

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${pc.green("[Enter number:]")} `, (answer) => {
      rl.close();
      const num = parseInt(answer.trim(), 10);
      resolve(isNaN(num) ? 0 : num);
    });
  });
}

/**
 * Add selected package to configuration file
 */
async function addPackageToConfig(
   selectedPackage: SearchResult,
   options: CommandOptions
 ): Promise<void> {
  ui.header("Add Package to Configuration");

  // Load current configuration
  const configResult = await safeExecute(
    () => loadConfigForHost(hostname()),
    "Failed to load configuration"
  );

  // Find or create configuration file to add package to
  const configFile = await selectConfigFile(configResult.entries, options);

  if (!configFile) {
    if (options.json) {
      console.log(JSON.stringify({
        action: "add",
        status: "error",
        dry_run: options.dryRun || false,
        error: "No configuration file selected"
      }, null, 2));
    } else {
      ui.error("No configuration file selected");
    }
    return;
  }

  // Check if package already exists in config (using Go format)
  const alreadyExists = configResult.entries.some((entry: any) =>
    entry.package === selectedPackage.name &&
    entry.sourceFile === configFile
  );

  if (alreadyExists) {
    if (options.json) {
      console.log(JSON.stringify({
        action: "add",
        package: {
          name: selectedPackage.name,
          source: selectedPackage.repository
        },
        file: configFile,
        status: "already-present",
        dry_run: options.dryRun || false
      }, null, 2));
    } else {
      ui.warn(`Package '${selectedPackage.name}' is already in ${configFile}`);
    }
    return;
  }

  // Dry run mode
  if (options.dryRun) {
    if (options.json) {
      console.log(JSON.stringify({
        action: "add",
        package: {
          name: selectedPackage.name,
          source: selectedPackage.repository
        },
        file: configFile,
        status: "would-add",
        dry_run: true
      }, null, 2));
    } else {
      ui.info(`Would add '${selectedPackage.name}' to ${configFile}`);
    }
    return;
  }

  // Add package to config file
  await addPackageToFile(selectedPackage.name, configFile);

  if (options.json) {
    console.log(JSON.stringify({
      action: "add",
      package: {
        name: selectedPackage.name,
        source: selectedPackage.repository
      },
      file: configFile,
      status: "added",
      dry_run: false
    }, null, 2));
  } else {
    ui.success(`Added '${selectedPackage.name}' to ${configFile}`);
  }
}

/**
 * Discover .owl configuration files using simple directory traversal
 */
// Use shared util; convert to friendly paths for display
async function getRelevantConfigFilesForSelection(): Promise<string[]> {
  const abs = await getRelevantConfigFilesForCurrentSystem();
  const home = getHomeDirectory();
  return abs.map(p => p.replace(home, '~'));
}

/**
 * Select which configuration file to add the package to
 */
async function selectConfigFile(
   configEntries: ConfigEntry[],
   options: CommandOptions
 ): Promise<string | null> {
   // If specific file is requested, use it
   if (options.file) {
     return options.file;
   }

   // Discover only relevant files for this system
   const owlFiles = await getRelevantConfigFilesForSelection();
   
   if (owlFiles.length === 0) {
     // Default to main config if no files exist
     return "~/.owl/main.owl";
   }

   if (owlFiles.length === 1) {
     return owlFiles[0] || null;
   }

    // Interactive selection for multiple config files
    console.log(`\n${pc.bold("Select a configuration file:")}\n`);

    // Color functions - matching Go version
    const bracketFunc = pc.green;
    const fileFunc = pc.cyan;
    const pathFunc = pc.white;
    const countFunc = pc.blue;

    // Display files in reverse order so most relevant appear at bottom
    for (let i = owlFiles.length - 1; i >= 0; i--) {
      const file = owlFiles[i];
      if (!file) continue;
      // Count packages by matching absolute path of sourceFile to absolute of friendly file
      const home = getHomeDirectory();
      const absFile = file.replace(/^~\//, `${home}/`);
      const packageCount = configEntries.filter(entry => (entry as any).sourceFile === absFile).length;

      // Convert to friendly path
      const friendlyPath = file.replace(/^~\//, '');

      // Format number with green brackets
      const numberPart = `${bracketFunc("[")}${i + 1}${bracketFunc("]")}`;

      // Format file name in soft cyan
      const fileName = fileFunc(friendlyPath.split('/').pop() || friendlyPath);

      // Format path in regular white
      const pathPart = `(${pathFunc(friendlyPath)})`;

      // Format package count in soft blue
      const countPart = `[${countFunc(`${packageCount} packages`)}]`;

      console.log(`${numberPart} ${fileName} ${pathPart} ${countPart}`);
    }
    console.log();

   const selection = await promptSelection(owlFiles.length);
   if (selection > 0 && selection <= owlFiles.length) {
     return owlFiles[selection - 1] || null;
   }

   return null;
 }

/**
 * Add package to the specified configuration file
 * Uses Go-compatible format: @package packageName
 */
async function addPackageToFile(
   packageName: string,
   configFile: string
): Promise<void> {
   const homeDir = getHomeDirectory();
   const configPath = configFile.replace(/^~/, homeDir);

   let content = "";
   try {
     content = readFileSync(configPath, "utf8");
   } catch {
     // File doesn't exist, create it with proper format
     content = `# Owl configuration file
# This file contains package and configuration specifications for Owl

@packages

@package ${packageName}
`;
     writeFileSync(configPath, content, "utf8");
     return;
   }

   // Check if package already exists in Go format
   const packageLine = `@package ${packageName}`;
   if (content.includes(packageLine)) {
     return; // Already exists
   }

   // Add package in Go format
   content += `\n@package ${packageName}\n`;

   // Write back to file
   writeFileSync(configPath, content, "utf8");
}
