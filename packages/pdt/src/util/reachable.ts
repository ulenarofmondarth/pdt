/**
 * Waiting for a server to answer, once its host has started it.
 */

/** How long a single request may take, in milliseconds. */
const REQUEST_TIMEOUT = 5000;

/** How long to wait between requests, in milliseconds. */
export const POLL_INTERVAL = 2000;

/**
 * Whether anything answers at `url`: any HTTP response counts, a redirect or an error status
 * included, as it is the server that gives it.
 */
export async function isUrlReachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
    return true;
  } catch {
    return false;
  }
}

/** How a wait for a server ended. */
export type WaitResult = 'reachable' | 'stopped' | 'timedOut';

/** What {@link waitUntilReachable} works with. */
export interface WaitOptions {
  /** Where the server answers. */
  url: string;
  /** How long to wait at most, in milliseconds. */
  timeout: number;
  /** Whether the server answers at a URL. */
  isReachable: (url: string) => Promise<boolean>;
  /** Whether what runs the server is still running. */
  isRunning: () => Promise<boolean>;
  /** The time now, in milliseconds. */
  now?: () => number;
  /** Wait for a number of milliseconds. */
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Ask the server at `url` until it answers, what runs it stops, or the time is up. It is asked at
 * least once, however short the time.
 */
export async function waitUntilReachable({
  url,
  timeout,
  isReachable,
  isRunning,
  now = Date.now,
  sleep = wait,
}: WaitOptions): Promise<WaitResult> {
  const deadline = now() + timeout;
  for (;;) {
    if (await isReachable(url)) return 'reachable';
    if (!(await isRunning())) return 'stopped';
    const left = deadline - now();
    if (left <= 0) return 'timedOut';
    await sleep(Math.min(POLL_INTERVAL, left));
  }
}
