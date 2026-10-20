import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { packageName } from '../src/index.js';

/** What a consumer of the published package depends on, checked before anything is published. */

interface Manifest {
  name: string;
  type: string;
  files: string[];
  exports: Record<string, { types: string; default: string }>;
  repository: { url: string; directory: string };
  publishConfig: { access: string };
}

interface BuildConfig {
  compilerOptions: { rootDir: string; outDir: string; declaration: boolean };
}

const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8')) as Manifest;
const build = JSON.parse(fs.readFileSync('tsconfig.build.json', 'utf8')) as BuildConfig;

/** Where the build writes the output for a source file. */
const built = (source: string, extension: string) =>
  source.replace(`${build.compilerOptions.rootDir}/`, `./${build.compilerOptions.outDir}/`).replace(/\.ts$/, extension);

describe('the published package', () => {
  it('is the package the code says it is', () => {
    expect(manifest.name).toBe(packageName);
  });

  it('is an ES module package, published publicly', () => {
    expect(manifest.type).toBe('module');
    expect(manifest.publishConfig.access).toBe('public');
  });

  it('exports the build of src/index.ts, with its type declarations', () => {
    expect(build.compilerOptions.declaration).toBe(true);
    expect(manifest.exports['.']).toEqual({
      types: built('src/index.ts', '.d.ts'),
      default: built('src/index.ts', '.js'),
    });
  });

  it('exports the sources from their own subpath, so that the core does not load them', () => {
    expect(manifest.exports['./sources']).toEqual({
      types: built('src/sources/index.ts', '.d.ts'),
      default: built('src/sources/index.ts', '.js'),
    });
    expect(Object.keys(manifest.exports)).toEqual(['.', './sources']);
  });

  it('ships the build output', () => {
    expect(manifest.files).toContain(build.compilerOptions.outDir);
  });

  // npm checks provenance against the repository that published it.
  it('names the repository and directory it is built from', () => {
    expect(manifest.repository).toMatchObject({
      url: 'git+https://github.com/ulenarofmondarth/pdt.git',
      directory: 'packages/fvtt-resolver',
    });
  });
});
