/**
 * Performance monitoring utilities for Owl package manager
 */

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private timings = new Map<string, number>();
  private startTimes = new Map<string, number>();

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  startTimer(label: string): void {
    this.startTimes.set(label, performance.now());
  }

  endTimer(label: string): number {
    const startTime = this.startTimes.get(label);
    if (!startTime) {
      throw new Error(`Timer "${label}" was not started`);
    }

    const duration = performance.now() - startTime;
    this.timings.set(label, duration);
    this.startTimes.delete(label);
    return duration;
  }

  getTiming(label: string): number | undefined {
    return this.timings.get(label);
  }

  logTimings(): void {
    if (this.timings.size === 0) return;

    console.log('\nPerformance timings:');
    for (const [label, duration] of this.timings) {
      console.log(`  ${label}: ${duration.toFixed(2)}ms`);
    }
    console.log();
  }

  clear(): void {
    this.timings.clear();
    this.startTimes.clear();
  }
}

/**
 * Helper function to time async operations
 */
export async function timeOperation<T>(
  label: string,
  operation: () => Promise<T>
): Promise<T> {
  const monitor = PerformanceMonitor.getInstance();
  monitor.startTimer(label);

  try {
    return await operation();
  } finally {
    const duration = monitor.endTimer(label);
    if (process.env.DEBUG) {
      console.log(`[DEBUG] ${label}: ${duration.toFixed(2)}ms`);
    }
  }
}