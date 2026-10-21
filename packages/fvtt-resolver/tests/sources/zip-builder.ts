/**
 * Building zips for tests, as a packager would: each file stored or deflated, then the directory
 * and its end record. Fields a test wants wrong can be given.
 */
import { crc32, deflateRawSync } from 'node:zlib';

export interface ZipFile {
  readonly name: string;
  readonly content: string | Uint8Array;
  /** Deflated by default. */
  readonly method?: 'store' | 'deflate' | number;
  readonly encrypted?: boolean;
  /** The uncompressed size the directory gives, when it should lie. */
  readonly claimedSize?: number;
}

export interface ZipOptions {
  readonly comment?: string;
  /** Write the ZIP64 marker in place of the directory's offset. */
  readonly zip64?: boolean;
}

export function makeZip(files: readonly ZipFile[], { comment = '', zip64 = false }: ZipOptions = {}): Uint8Array {
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const content = Buffer.from(file.content);
    const method =
      file.method === 'store' ? 0 : file.method === undefined || file.method === 'deflate' ? 8 : file.method;
    const data = method === 8 ? deflateRawSync(content) : content;
    const fields = (header: Buffer, at: number) => {
      header.writeUInt16LE(file.encrypted === true ? 1 : 0, at);
      header.writeUInt16LE(method, at + 2);
      header.writeUInt32LE(crc32(content), at + 8);
      header.writeUInt32LE(data.length, at + 12);
      header.writeUInt32LE(file.claimedSize ?? content.length, at + 16);
      header.writeUInt16LE(name.length, at + 20);
    };
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    fields(local, 6);
    parts.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    fields(central, 8);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const size = directory.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(zip64 ? 0xffffffff : offset, 16);
  end.writeUInt16LE(Buffer.byteLength(comment), 20);
  return new Uint8Array(Buffer.concat([...parts, ...directory, end, Buffer.from(comment)]));
}
