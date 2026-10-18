import { vi } from 'vitest';
import VTTHost from '@lib/VTT/VTTHost.js';

/**
 * A VTTHost whose every method is a spy.
 *
 * It extends the real abstract class, so the type check fails if VTTHost gains or
 * changes a member and this mock is not updated.
 */
export class VTTHostMock extends VTTHost {
  isAccessible = vi.fn<VTTHost['isAccessible']>().mockResolvedValue(true);
  start = vi.fn<VTTHost['start']>().mockResolvedValue(undefined);
  stop = vi.fn<VTTHost['stop']>();
  restart = vi.fn<VTTHost['restart']>();
  isRunning = vi.fn<VTTHost['isRunning']>().mockResolvedValue(false);
}

export function createHostMock(): VTTHostMock {
  return new VTTHostMock();
}
