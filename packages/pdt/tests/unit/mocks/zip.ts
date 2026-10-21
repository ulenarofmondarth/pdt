/**
 * Makes zip files for tests, stored without compression: enough for the extractor to read, and
 * able to hold what a real archiver would refuse to write, such as `..` names and links.
 */
import { crc32 } from 'node:zlib';

export interface ZipEntry {
  readonly name: string;
  /** The file's contents; a name ending in `/` is a folder and has none. */
  readonly data?: string | Buffer;
  /** The Unix file mode, kept in the external attributes, such as `0o120777` for a link. */
  readonly mode?: number;
  /** Mark the entry encrypted. */
  readonly encrypted?: boolean;
}

/** A zip of the entries, as a buffer. */
export function makeZip(entries: readonly ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const plain = entry.data === undefined ? Buffer.alloc(0) : Buffer.from(entry.data);
    const crc = crc32(plain);
    // An encrypted entry starts with a 12-byte encryption header.
    const data = entry.encrypted === true ? Buffer.concat([Buffer.alloc(12), plain]) : plain;
    const flags = (entry.encrypted === true ? 0x1 : 0) | 0x800;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(plain.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(plain.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((entry.mode ?? (entry.name.endsWith('/') ? 0o40755 : 0o100644)) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
