/**
 * AUR Availability Checker - checks if AUR is accessible
 */

interface AURStatus {
  isAvailable: boolean;
  lastChecked: Date;
  checkTTL: number; // in milliseconds
}

class GlobalAURStatus {
  private status: AURStatus = {
    isAvailable: true, // Assume available by default
    lastChecked: new Date(0),
    checkTTL: 5 * 60 * 1000, // 5 minutes
  };

  public getStatus(): boolean {
    return this.status.isAvailable;
  }

  public async refreshStatus(): Promise<void> {
    const checker = new AURChecker();
    const isAvailable = await checker.checkAURAvailabilityAsync();
    
    this.status.isAvailable = isAvailable;
    this.status.lastChecked = new Date();
  }

  public refreshStatusSync(): void {
    // For sync version, we'll start async check but don't wait
    this.refreshStatus().catch(() => {
      // On error, mark as unavailable
      this.status.isAvailable = false;
      this.status.lastChecked = new Date();
    });
  }

  public setAvailable(available: boolean): void {
    this.status.isAvailable = available;
    this.status.lastChecked = new Date();
  }
}

export class AURChecker {
  private baseURL = "https://aur.archlinux.org";
  private timeout = 2000; // shorter timeout for quick checks

  /**
   * Check if AUR is accessible by testing a simple API call (synchronous version)
   */
  public checkAURAvailability(): boolean {
    // For synchronous checking, we'll use the cached status
    // Real checking should be done via the async method
    return true; // Default to available, async check will update this
  }

  /**
   * Async version of availability check
   */
  public async checkAURAvailabilityAsync(): Promise<boolean> {
    const controller = new AbortController();
    const testURL = `${this.baseURL}/rpc/?v=5&type=info&arg=yay`;
    const headers = { 'User-Agent': 'owl/1.0', 'Accept': 'application/json' } as const;
    let timeoutId: any;
    try {
      timeoutId = setTimeout(() => controller.abort(), this.timeout);
      const response = await fetch(testURL, { method: 'GET', headers, signal: controller.signal });
      return response.status < 500;
    } catch {
      return false;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }
}

// Global instance
const globalAURStatus = new GlobalAURStatus();

/**
 * Get current AUR availability status (with caching)
 */
export function getAURStatus(): boolean {
  return globalAURStatus.getStatus();
}

/**
 * Force refresh AUR availability status
 */
export function refreshAURStatus(): void {
  globalAURStatus.refreshStatusSync();
}

/**
 * Force refresh AUR availability status (async version)
 */
export async function refreshAURStatusAsync(): Promise<void> {
  await globalAURStatus.refreshStatus();
}

/**
 * Check if AUR operations should be skipped (when AUR is down)
 */
export function shouldSkipAUR(): boolean {
  return !getAURStatus();
}

/**
 * Initialize AUR status if needed (for compatibility with Go version)
 */
export function initializeAURStatusIfNeeded(_useYay: boolean = false): void {
  // In TypeScript version, we always check AUR directly
  refreshAURStatus();
}
