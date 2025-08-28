/**
 * AUR availability checker
 */

class GlobalAURStatus {
  private status = { isAvailable: true, lastChecked: new Date(0), checkTTL: 5 * 60 * 1000 };
  public getStatus(): boolean {
    return this.status.isAvailable;
  }
  public async refreshStatus(): Promise<void> {
    const checker = new AURChecker();
    const isAvailable = await checker.checkAURAvailabilityAsync();
    this.status.isAvailable = isAvailable; this.status.lastChecked = new Date();
  }
  public refreshStatusSync(): void {
    this.refreshStatus().catch(() => { this.status.isAvailable = false; this.status.lastChecked = new Date(); });
  }
  public setAvailable(available: boolean): void { this.status.isAvailable = available; this.status.lastChecked = new Date(); }
}

export class AURChecker {
  private baseURL = "https://aur.archlinux.org";
  private timeout = 2000;
  public checkAURAvailability(): boolean { return true; }
  public async checkAURAvailabilityAsync(): Promise<boolean> {
    // Use a manually managed AbortController so we can clear the timeout
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

const globalAURStatus = new GlobalAURStatus();
export function getAURStatus(): boolean { return globalAURStatus.getStatus(); }
export function refreshAURStatus(): void { globalAURStatus.refreshStatusSync(); }
export async function refreshAURStatusAsync(): Promise<void> { await globalAURStatus.refreshStatus(); }
export function shouldSkipAUR(): boolean { return !getAURStatus(); }
export function initializeAURStatusIfNeeded(_useYay: boolean = false): void { refreshAURStatus(); }
