/**
 * Reading a package's manifest from its zip, without downloading the zip.
 *
 * A zip ends with a directory of its files, which says where each one starts. So the manifest is
 * read in three or four small requests for parts of the zip: its first byte, to learn its size;
 * its end; the directory, if the end did not hold it all; and the manifest itself. The size is
 * asked for first because GitHub's file storage refuses a range counted from the end of a file,
 * and a browser sends a request for the first byte without asking the server first (CORS). As Foundry VTT does, the manifest is the `module.json`
 * or `system.json` nearest the top of the zip.
 *
 * The zip comes from the network, so nothing in it is trusted: a directory or manifest larger than
 * the limits below, an encrypted manifest, or one compressed other than by deflate is not read.
 */
import type { Fetched, HttpClient } from './http.js';

/** The most the zip's directory may take: room for tens of thousands of files. */
export const MAX_DIRECTORY = 8 * 1024 ** 2;

/** The most a manifest may take, compressed or not. Real ones are a few kilobytes. */
export const MAX_MANIFEST = 1024 ** 2;

const END_SIGNATURE = 0x06054b50;
const DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
/** The end record is 22 bytes, then a comment of up to 65535. */
const TAIL = 22 + 0xffff;
/** Where a size or offset that does not fit says to look in the ZIP64 records, not read here. */
const ZIP64 = 0xffffffff;

/** A file in the zip's directory. */
interface Entry {
  readonly name: string;
  /** The name's length in bytes. */
  readonly nameLength: number;
  readonly method: number;
  readonly encrypted: boolean;
  readonly compressedSize: number;
  readonly size: number;
  readonly offset: number;
}

class Unreadable extends Error {}

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Where the directory is, from the end record, and where that record is in `tail`. */
function endOfDirectory(tail: Uint8Array): { size: number; offset: number; at: number } {
  const data = view(tail);
  for (let at = tail.length - 22; at >= 0; at--) {
    if (data.getUint32(at, true) !== END_SIGNATURE) continue;
    const size = data.getUint32(at + 12, true);
    const offset = data.getUint32(at + 16, true);
    if (size === ZIP64 || offset === ZIP64) throw new Unreadable('zip64');
    return { size, offset, at };
  }
  throw new Unreadable('no end of directory');
}

/** The files the directory lists. */
function entries(directory: Uint8Array): Entry[] {
  const data = view(directory);
  const found: Entry[] = [];
  for (let at = 0; at < directory.length;) {
    if (data.getUint32(at, true) !== DIRECTORY_SIGNATURE) throw new Unreadable('directory');
    const nameLength = data.getUint16(at + 28, true);
    const name = new TextDecoder().decode(directory.subarray(at + 46, at + 46 + nameLength));
    found.push({
      name,
      nameLength,
      encrypted: (data.getUint16(at + 8, true) & 1) === 1,
      method: data.getUint16(at + 10, true),
      compressedSize: data.getUint32(at + 20, true),
      size: data.getUint32(at + 24, true),
      offset: data.getUint32(at + 42, true),
    });
    at += 46 + nameLength + data.getUint16(at + 30, true) + data.getUint16(at + 32, true);
  }
  return found;
}

/** The manifest's entry: the one nearest the top named `<type>.json`. */
function manifestEntry(found: readonly Entry[], type: 'module' | 'system'): Entry {
  const depth = (entry: Entry) => entry.name.split('/').length;
  const [entry] = found
    .filter(entry => entry.name.split('/').at(-1) === `${type}.json`)
    .sort((a, b) => depth(a) - depth(b));
  if (entry === undefined) throw new Unreadable('no manifest');
  if (entry.encrypted || (entry.method !== 0 && entry.method !== 8)) throw new Unreadable('unsupported');
  if (entry.compressedSize > MAX_MANIFEST || entry.size > MAX_MANIFEST) throw new Unreadable('too large');
  return entry;
}

/** Inflates deflated data, refusing more than {@link MAX_MANIFEST}, whatever the zip claimed. */
async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'))) {
    total += chunk.length;
    if (total > MAX_MANIFEST) throw new Unreadable('too large');
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  chunks.reduce((at, chunk) => (out.set(chunk, at), at + chunk.length), 0);
  return out;
}

/**
 * The manifest in a package's zip, as parsed JSON, kept once read: the zip of a release does not
 * change. A zip that cannot be read so is an `invalid` gap.
 *
 * @param headers - Headers to send, such as a token
 */
export function zipManifest(
  http: HttpClient,
  url: string,
  type: 'module' | 'system',
  headers: Readonly<Record<string, string>> = {},
): Promise<Fetched> {
  return http.remember(`zip-manifest:${type}:${url}`, Infinity, async (): Promise<Fetched> => {
    const part = async (start: number, end?: number): Promise<Fetched<Uint8Array>> => {
      const fetched = await http.getBytes(url, end === undefined ? { start } : { start, end }, { headers });
      return fetched.ok ? { ok: true, value: fetched.value.bytes } : fetched;
    };
    try {
      const first = await http.getBytes(url, { start: 0, end: 0 }, { headers });
      if (!first.ok) return first;
      // Without the size, as when a browser cannot see it, the end is asked for from the end.
      const { size } = first.value;
      const tail = await part(size === undefined ? -TAIL : Math.max(0, size - TAIL));
      if (!tail.ok) return tail;
      const end = endOfDirectory(tail.value);
      if (end.size > MAX_DIRECTORY) throw new Unreadable('too large');
      // The end record follows the directory, so the tail starts where the directory ends, less
      // where the record is in the tail.
      const tailStart = end.offset + end.size - end.at;
      const fetched =
        end.offset >= tailStart
          ? { ok: true as const, value: tail.value.subarray(end.offset - tailStart, end.at) }
          : await part(end.offset, end.offset + end.size - 1);
      if (!fetched.ok) return fetched;
      const directory = fetched.value;
      const entry = manifestEntry(entries(directory), type);
      // The local header repeats the name, and has an extra field of its own, of up to 65535 bytes.
      const local = await part(entry.offset, entry.offset + 30 + entry.nameLength + 0xffff + entry.compressedSize);
      if (!local.ok) return local;
      const header = view(local.value);
      if (header.getUint32(0, true) !== LOCAL_SIGNATURE) throw new Unreadable('local header');
      const start = 30 + header.getUint16(26, true) + header.getUint16(28, true);
      const data = local.value.subarray(start, start + entry.compressedSize);
      if (data.length < entry.compressedSize) throw new Unreadable('truncated');
      const manifest = entry.method === 0 ? data : await inflate(data);
      return { ok: true, value: JSON.parse(new TextDecoder().decode(manifest)) as unknown };
    } catch {
      return { ok: false, gap: { url, reason: 'invalid' } };
    }
  });
}
