/**
 * Logging module.
 */

/**
 * Log a message to the console.
 */
export function log(message: string): void {
  // tslint:disable-next-line:no-console
  console.log(`monist: ${message}`);
}

/**
 * Log an error to the console.
 */
export function error(message: string): void {
  // tslint:disable-next-line:no-console
  console.error(`monist: ${message}`);
}
