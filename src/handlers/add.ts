/**
 * Add command handler for Owl package manager
 */

import { ui } from "../ui";
import { loadConfigForHost } from "../config";
import { hostname } from "os";
import pc from "picocolors";
import { safeExecute } from "../utils/errors";
import { PacmanManager } from "../pacman-manager";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getHomeDirectory } from "../utils/fs";
import type { CommandOptions } from "../commands";
import type { SearchResult, ConfigEntry } from "../types";

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

  // Perform narrowing search (yay-style)
  const searchResults = await safeExecute(
    () => performNarrowingSearch(packageManager, queryTerms, options.source || "any"),
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
  const selectedPackage = await selectPackageInteractively(searchResults);
  if (selectedPackage) {
    await addPackageToConfig(selectedPackage, options);
  }
}

/**
 * Perform narrowing search (yay-style): search with first term, then filter by subsequent terms
 */
async function performNarrowingSearch(
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
 * Filter search results by checking if they contain the term (case-insensitive)
 */
function filterResultsByTerm(results: SearchResult[], term: string): SearchResult[] {
  if (!term) return results;

  const lowerTerm = term.toLowerCase();
  return results.filter(result => 
    result.name.toLowerCase().includes(lowerTerm) ||
    result.description?.toLowerCase().includes(lowerTerm) ||
    result.repository.toLowerCase().includes(lowerTerm)
  );
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

  results.forEach((pkg, index) => {
    const status = pkg.installed ? pc.green("✓ installed") : pc.gray("○ not installed");
    const repo = pkg.repository === "aur" ? pc.yellow("aur") : pc.blue(pkg.repository);
    const version = pc.cyan(pkg.version);

    console.log(`${index + 1}. ${pc.bold(pkg.name)} ${version} [${repo}] ${status}`);
    if (pkg.description) {
      console.log(`   ${pc.gray(pkg.description)}`);
    }
  });

  console.log();

  const selection = await promptSelection(results.length);
  if (selection > 0 && selection <= results.length) {
    return results[selection - 1] || null;
  }

  return null;
}

/**
 * Prompt user for package selection (simplified version)
 */
async function promptSelection(max: number): Promise<number> {
  const { createInterface } = await import("readline");

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`Select package (1-${max}) or 0 to cancel: `, (answer) => {
      rl.close();
      const num = parseInt(answer, 10);
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
  const alreadyExists = configResult.entries.some(entry =>
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
async function discoverOwlFiles(): Promise<string[]> {
  const homeDir = getHomeDirectory();
  const owlRoot = join(homeDir, '.owl');
  
  const files: string[] = [];
  
  try {
    const { readdirSync, statSync } = await import("fs");
    
    // Check main config file
    const mainConfig = join(owlRoot, 'main.owl');
    try {
      statSync(mainConfig);
      files.push(`~/.owl/main.owl`);
    } catch {
      // File doesn't exist, that's fine
    }
    
    // Check hosts directory
    const hostsDir = join(owlRoot, 'hosts');
    try {
      const hostFiles = readdirSync(hostsDir);
      for (const file of hostFiles) {
        if (file.endsWith('.owl')) {
          files.push(`~/.owl/hosts/${file}`);
        }
      }
    } catch {
      // Directory doesn't exist, that's fine
    }
    
    // Check groups directory
    const groupsDir = join(owlRoot, 'groups');
    try {
      const groupFiles = readdirSync(groupsDir);
      for (const file of groupFiles) {
        if (file.endsWith('.owl')) {
          files.push(`~/.owl/groups/${file}`);
        }
      }
    } catch {
      // Directory doesn't exist, that's fine
    }
  } catch (error) {
    // If we can't read the directory, just return empty array
  }
  
  return files;
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

   // Discover .owl files  
   const owlFiles = await discoverOwlFiles();
   
   if (owlFiles.length === 0) {
     // Default to main config if no files exist
     return "~/.owl/main.owl";
   }

   if (owlFiles.length === 1) {
     return owlFiles[0] || null;
   }

   // Interactive selection for multiple config files
   console.log(`\n${pc.bold("Select configuration file:")}\n`);
   
   owlFiles.forEach((file, index) => {
     const packageCount = configEntries.filter(entry => entry.sourceFile === file).length;
     const relativeFile = file.replace(/^~\//, '');
     console.log(`${index + 1}. ${pc.cyan(relativeFile)} (${packageCount} packages)`);
   });
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