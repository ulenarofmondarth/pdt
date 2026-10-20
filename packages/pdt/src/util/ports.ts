/**
 * Free ports on the machine pdt runs on, for VTTs whose port is `auto`.
 */
import net from 'node:net';
import { m } from '@i18n/messages.js';

/** Where the search for a free port starts: the port Foundry VTT serves on by default. */
export const FIRST_AUTO_PORT = 30000;

/** The highest port there is. */
const LAST_PORT = 65535;

/** Whether `port` is free: nothing listens on it, so pdt could. */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    // Without a host, Node listens on every address, as Docker publishes a port.
    server.listen({ port, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

/**
 * The first free port from `from`.
 *
 * Nothing holds the port once it is found, so it may be taken before it is used.
 *
 * @param from - The first port to try
 * @param isFree - How to tell whether a port is free
 * @throws {Error} When no port from `from` is free
 */
export async function findFreePort(
  from: number = FIRST_AUTO_PORT,
  isFree: (port: number) => Promise<boolean> = isPortFree,
): Promise<number> {
  for (let port = from; port <= LAST_PORT; port++) {
    if (await isFree(port)) return port;
  }
  throw new Error(m['error.vtt.noFreePort']({ from }));
}
