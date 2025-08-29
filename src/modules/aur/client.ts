/**
 * AUR Client for querying Arch User Repository API with simple in-memory cache and throttling
 */

import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { shouldSkipAUR, refreshAURStatusAsync } from "./status";
import type { AURPackage, AURResponse, AURClientOptions } from "../../types";

interface CacheEntry {
  response: AURResponse;
  timestamp: Date;
  url: string;
}

export class AURClient {
  private cache: Map<string, CacheEntry> = new Map();
  private lastRequest = new Date(0);
  private options: Required<AURClientOptions>;

  constructor(options: AURClientOptions = {}) {
    this.options = {
      bypassCache: options.bypassCache ?? false,
      cacheDir: options.cacheDir ?? join(process.env.HOME || '', '.owl', 'cache', 'aur')
    };
  }

  /**
   * Query a single package from AUR
   */
  async queryPackage(packageName: string): Promise<AURPackage> {
    const url = `https://aur.archlinux.org/rpc/?v=5&type=info&arg[]=${encodeURIComponent(packageName)}`;
    const response = await this.makeRequest(url);

    if (response.resultcount === 0 || !response.results || response.results.length === 0) {
      throw new Error(`Package ${packageName} not found in AUR`);
    }

    const result = response.results[0];
    if (!result) {
      throw new Error(`Package ${packageName} not found in AUR`);
    }

    return result;
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

    // Throttle requests
    await this.throttleRequest();

    try {
      const controller = new AbortController();
      const headers = { 'User-Agent': 'owl/1.0', 'Accept': 'application/json' } as const;
      const to = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(to);

      if (!response.ok) {
        throw new Error(`AUR API returned status ${response.status}`);
      }

      const data = await response.json() as AURResponse;
      this.setCached(url, data);
      return data;
    } catch (error) {
      // Avoid background refresh to prevent lingering network timers
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
    const memoryCached = this.cache.get(url);
    if (memoryCached && this.isCacheValid(memoryCached.timestamp, url)) {
      return memoryCached.response;
    }
    // Fallback to disk cache
    const diskCached = this.getDiskCached(url);
    if (diskCached && this.isCacheValid(diskCached.timestamp, url)) {
      // refresh memory cache
      this.cache.set(url, { response: diskCached.response, timestamp: diskCached.timestamp, url });
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

    this.cache.set(url, entry);
    // Persist to disk to avoid re-querying across runs
    this.setDiskCached(url, response);
  }

  /**
   * Get cached response from disk
   */
  // Disk cache removed for simplicity

  /**
   * Set response in disk cache
   */
  // Disk cache removed for simplicity

  /**
   * Check if cache entry is still valid
   */
  private isCacheValid(timestamp: Date, url: string): boolean {
    // Keep results fresh but reduce API pressure: 2h for search, 1h for info
    const isSearch = url.includes("type=search");
    const maxAge = isSearch ? 2 * 60 * 60 * 1000 : 60 * 60 * 1000;
    return Date.now() - timestamp.getTime() < maxAge;
  }

  // --- Minimal disk cache helpers ---
  private getDiskCached(url: string): { response: AURResponse; timestamp: Date } | null {
    try {
      const file = this.getCacheFilePath(url);
      if (!existsSync(file)) return null;
      const raw = readFileSync(file, 'utf8');
      const obj = JSON.parse(raw) as { response: AURResponse; timestamp: string };
      return { response: obj.response, timestamp: new Date(obj.timestamp) };
    } catch {
      return null;
    }
  }

  private setDiskCached(url: string, response: AURResponse): void {
    try {
      this.ensureCacheDirectory();
      const file = this.getCacheFilePath(url);
      const payload = { response, timestamp: new Date().toISOString() };
      writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    } catch {
      // best effort
    }
  }

  private ensureCacheDirectory(): void {
    try { mkdirSync(this.options.cacheDir, { recursive: true }); } catch {}
  }

  private getCacheFilePath(url: string): string {
    const hash = this.hashString(url).slice(0, 16);
    return join(this.options.cacheDir, `${hash}.json`);
  }

  private hashString(str: string): string {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
    return Math.abs(h).toString(16);
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

  // Budgeting removed; rely on TTL + throttle
}
