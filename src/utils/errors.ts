/**
 * Error handling utilities for Owl package manager
 */

export class OwlError extends Error {
  constructor(
    message: string,
    public code?: string,
    public override cause?: unknown
  ) {
    super(message);
    this.name = 'OwlError';
  }
}

export class ConfigError extends Error {
  constructor(
    public filePath: string,
    public lineNumber: number,
    public line: string,
    message: string
  ) {
    super(`${filePath}:${lineNumber}: ${message}\n  → ${line.trim()}`);
    this.name = 'ConfigError';
  }
}

/**
 * Handle errors consistently across the application
 */
export function handleError(message: string, error?: unknown): never {
  const errorMessage = error instanceof Error ? error.message : String(error || "Unknown error");
  console.error(`${message}: ${errorMessage}`);
  process.exit(1);
}

/**
 * Safely execute async operations with consistent error handling
 */
export async function safeExecute<T>(
  operation: () => Promise<T>,
  errorMessage: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    handleError(errorMessage, error);
  }
}

/**
 * Wrap a function with error handling and return a default value on failure
 */
export async function safeExecuteWithFallback<T>(
  operation: () => Promise<T>,
  fallback: T,
  errorMessage?: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (errorMessage) {
      console.warn(`Warning: ${errorMessage}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return fallback;
  }
}