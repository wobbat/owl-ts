/**
 * AUR Client for querying Arch User Repository API with caching and rate limiting
 */

import { $ } from "bun";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { getHomeDirectory, ensureOwlDirectories } from "./utils/fs";
import { shouldSkipAUR, refreshAURStatusAsync } from "./aur-checker";
import type { AURPackage, AURResponse, AURClientOptions, AURBudget } from "./types";

interface CacheEntry {
  response: AURResponse;
  timestamp: Date;
  url: string;
}

interface DiskCacheEntry {
  response: AURResponse;
  timestamp: string;
  url: string;
}

export class AURClient {
  private cache: Map<string, CacheEntry> = new Map();
  private lastRequest = new Date(0);
  private budget: AURBudget;
  private options: Required<AURClientOptions>;

  constructor(options: AURClientOptions = {}) {
    this.options = {
      bypassCache: options.bypassCache ?? false,
      cacheDir: options.cacheDir ?? join(getHomeDirectory(), '.owl', 'cache', 'aur')
    };

    this.budget = this.initializeBudget();
    this.ensureCacheDirectory();
  }

  /**
   * Query a single package from AUR
   */
  async queryPackage(packageName: string): Promise<AURPackage> {
    const url = `https://aur.archlinux.org/rpc/?v=5&type=info&arg[]=${encodeURIComponent(packageName)}`;
    const response = await this.makeRequest(url);

    if (response.resultcount === 0) {
      throw new Error(`Package ${packageName} not found in AUR`);
    }

    return response.results[0];
  }

  /**
   * Search for packages in AUR
   */
  async searchPackages(query: string): Promise<AURResponse> {
    const url = `https://aur.archlinux.org/rpc/?v=5&type=search&arg=${encodeURIComponent(query)}`;
    return this.makeRequest(url);
  }

  /**
   * Query multiple packages in a single request
   */
  async queryMultiplePackages(packageNames: string[]): Promise<AURResponse> {
    if (packageNames.length === 0) {
      return { version: 5, type: "multiinfo", resultcount: 0, results: [] };
    }

    // Remove duplicates
    const uniqueNames = [...new Set(packageNames)];

    // For large lists, split into batches
    if (uniqueNames.length > 100) {
      return this.queryPackagesBatched(uniqueNames);
    }

    let url = "https://aur.archlinux.org/rpc/?v=5&type=info";
    for (const name of uniqueNames) {
      url += `&arg[]=${encodeURIComponent(name)}`;
    }

    return this.makeRequest(url);
  }

  /**
   * Make HTTP request to AUR API with caching and rate limiting
   */
  private async makeRequest(url: string): Promise<AURResponse> {
    // Check AUR availability before making request
    if (shouldSkipAUR()) {
      // Try to refresh status once before giving up
      await refreshAURStatusAsync();
      if (shouldSkipAUR()) {
        throw new Error("AUR is currently unavailable");
      }
    }

    // Check cache first
    if (!this.options.bypassCache) {
      const cached = this.getCached(url);
      if (cached) {
        return cached;
      }
    }

    // Check rate limit
    if (!this.options.bypassCache && !this.canMakeCall()) {
      throw new Error(`AUR API daily budget exceeded (${this.budget.maxCalls} calls), results may be stale. Try again tomorrow or use cached data`);
    }

    // Throttle requests
    await this.throttleRequest();

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'owl/1.0',
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });

      if (response.status === 429) {
        // Wait and retry once
        await new Promise(resolve => setTimeout(resolve, 2000));
        const retryResponse = await fetch(url, {
          headers: {
            'User-Agent': 'owl/1.0',
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(30000)
        });

        if (retryResponse.status === 429) {
          throw new Error("AUR API rate limit exceeded (429), please try again later");
        }

        const data = await retryResponse.json() as AURResponse;
        this.recordCall();
        this.setCached(url, data);
        return data;
      }

      if (!response.ok) {
        throw new Error(`AUR API returned status ${response.status}`);
      }

      const data = await response.json() as AURResponse;
      this.recordCall();
      this.setCached(url, data);
      return data;
    } catch (error) {
      // If it's a timeout or network error, mark AUR as potentially down
      if (error instanceof Error && (error.name === 'TimeoutError' || error.message.includes('fetch'))) {
        // Force refresh AUR status in background
        refreshAURStatusAsync().catch(() => {}); // Don't wait for this
      }
      throw new Error(`Failed to query AUR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Query packages in batches for large lists
   */
  private async queryPackagesBatched(packageNames: string[]): Promise<AURResponse> {
    const batchSize = 100;
    const allResults: AURPackage[] = [];

    for (let i = 0; i < packageNames.length; i += batchSize) {
      const end = Math.min(i + batchSize, packageNames.length);
      const batch = packageNames.slice(i, end);

      const response = await this.queryMultiplePackages(batch);
      allResults.push(...response.results);
    }

    return {
      version: 5,
      type: "multiinfo",
      resultcount: allResults.length,
      results: allResults
    };
  }

  /**
   * Get cached response if available and not expired
   */
  private getCached(url: string): AURResponse | null {
    // Check memory cache first
    const memoryCached = this.cache.get(url);
    if (memoryCached && this.isCacheValid(memoryCached.timestamp, url)) {
      return memoryCached.response;
    }

    // Check disk cache
    const diskCached = this.getDiskCached(url);
    if (diskCached && this.isCacheValid(new Date(diskCached.timestamp), url)) {
      // Update memory cache
      this.cache.set(url, {
        response: diskCached.response,
        timestamp: new Date(diskCached.timestamp),
        url
      });
      return diskCached.response;
    }

    return null;
  }

  /**
   * Set response in cache
   */
  private setCached(url: string, response: AURResponse): void {
    const entry: CacheEntry = {
      response,
      timestamp: new Date(),
      url
    };

    // Update memory cache
    this.cache.set(url, entry);

    // Update disk cache
    this.setDiskCached(url, response);
  }

  /**
   * Get cached response from disk
   */
  private getDiskCached(url: string): CacheEntry | null {
    try {
      const cacheFile = this.getCacheFilePath(url);
      if (!existsSync(cacheFile)) {
        return null;
      }

      const data = readFileSync(cacheFile, 'utf8');
      const entry = JSON.parse(data) as DiskCacheEntry;

      return {
        response: entry.response,
        timestamp: new Date(entry.timestamp),
        url: entry.url
      };
    } catch {
      return null;
    }
  }

  /**
   * Set response in disk cache
   */
  private setDiskCached(url: string, response: AURResponse): void {
    try {
      const entry: DiskCacheEntry = {
        response,
        timestamp: new Date().toISOString(),
        url
      };

      const cacheFile = this.getCacheFilePath(url);
      writeFileSync(cacheFile, JSON.stringify(entry, null, 2), 'utf8');
    } catch {
      // Silently fail cache write
    }
  }

  /**
   * Check if cache entry is still valid
   */
  private isCacheValid(timestamp: Date, url: string): boolean {
    const maxAge = url.includes("type=search") ? 6 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 6h for search, 24h for info
    return Date.now() - timestamp.getTime() < maxAge;
  }

  /**
   * Get cache file path for URL
   */
  private getCacheFilePath(url: string): string {
    const hash = this.hashString(url);
    return join(this.options.cacheDir, `${hash.slice(0, 16)}.json`);
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDirectory(): void {
    try {
      mkdirSync(this.options.cacheDir, { recursive: true });
    } catch {
      // Silently fail
    }
  }

  /**
   * Throttle requests to avoid overwhelming the API
   */
  private async throttleRequest(): Promise<void> {
    const timeSince = Date.now() - this.lastRequest.getTime();
    const minInterval = 200; // 200ms between requests

    if (timeSince < minInterval) {
      await new Promise(resolve => setTimeout(resolve, minInterval - timeSince));
    }

    this.lastRequest = new Date();
  }

  /**
   * Check if we can make an API call within budget
   */
  private canMakeCall(): boolean {
    this.refreshBudget();
    return this.budget.usedCalls < this.budget.maxCalls;
  }

  /**
   * Record an API call usage
   */
  private recordCall(): void {
    if (this.options.bypassCache) return;

    this.budget.usedCalls++;
    this.saveBudget();
  }

  /**
   * Initialize budget tracking
   */
  private initializeBudget(): AURBudget {
    const budgetFile = join(this.options.cacheDir, 'budget.json');
    const maxCalls = 500; // Default daily budget

    try {
      if (existsSync(budgetFile)) {
        const data = readFileSync(budgetFile, 'utf8');
        const budget = JSON.parse(data) as AURBudget;
        budget.resetAt = new Date(budget.resetAt);
        budget.budgetFile = budgetFile;
        return budget;
      }
    } catch {
      // Fall through to create new budget
    }

    const budget: AURBudget = {
      resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      usedCalls: 0,
      maxCalls,
      budgetFile
    };

    this.saveBudget();
    return budget;
  }

  /**
   * Refresh budget if needed
   */
  private refreshBudget(): void {
    if (new Date() >= this.budget.resetAt) {
      this.budget.resetAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      this.budget.usedCalls = 0;
      this.saveBudget();
    }
  }

  /**
   * Save budget to disk
   */
  private saveBudget(): void {
    try {
      writeFileSync(this.budget.budgetFile, JSON.stringify(this.budget, null, 2), 'utf8');
    } catch {
      // Silently fail
    }
  }

  /**
   * Get remaining API calls for today
   */
  getRemainingCalls(): number {
    this.refreshBudget();
    const remaining = this.budget.maxCalls - this.budget.usedCalls;
    return Math.max(0, remaining);
  }

  /**
   * Clean expired cache entries
   */
  cleanExpiredCache(): void {
    // This would be implemented to clean old cache files
    // For now, we'll rely on the TTL checks
  }
}