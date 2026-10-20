import { vi } from 'vitest';
import VTTHost from '@lib/VTT/VTTHost.js';

/**
 * A VTTHost whose every method is a spy. It starts anything as `container-id`, and finds nothing
 * running.
 *
 * It extends the real abstract class, so the type check fails if VTTHost gains or
 * changes a member and this mock is not updated.
 */
export class VTTHostMock extends VTTHost {
  isAccessible = vi.fn<VTTHost['isAccessible']>().mockResolvedValue(true);
  start = vi.fn<VTTHost['start']>().mockResolvedValue({ id: 'container-id' });
  stop = vi.fn<VTTHost['stop']>().mockResolvedValue(undefined);
  isRunning = vi.fn<VTTHost['isRunning']>().mockResolvedValue(false);
}

export function createHostMock(): VTTHostMock {
  return new VTTHostMock();
}
