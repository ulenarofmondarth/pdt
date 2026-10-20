import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bumpVersionCmd } from '../../release.base.js';
import { packageDirs, packageReleases, pluginOptions } from './release-packages.js';

/**
 * The workspace's package.json declares pnpm in devEngines with onFail: error, so npm refuses to
 * run in this repository. @semantic-release/npm bumps the version with `npm version` and so fails
 * the release; the bump has to go through pnpm instead.
 *
 * The bump runs where each package's release does, in the package's directory of the workspace,
 * with pnpm-lock.yaml at the root. Without the lockfile pnpm resolves the devEngines range from the
 * registry, which once took the test past its timeout on CI.
 */

describe('release version bump', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('does not use @semantic-release/npm, which runs npm', async () => {
    for (const { config } of await packageReleases()) {
      expect(pluginOptions(config, '@semantic-release/npm')).toBeUndefined();
    }
  });

  it.each(packageDirs)('sets the version in %s/package.json and changes nothing else, offline', packageDir => {
    dir = mkdtempSync(join(tmpdir(), 'pdt-release-'));
    const workspace = join(dir, 'workspace');
    const cache = join(dir, 'cache');
    const files = [
      'package.json',
      'pnpm-workspace.yaml',
      'pnpm-lock.yaml',
      ...packageDirs.map(p => `${p}/package.json`),
    ];
    for (const file of files) {
      mkdirSync(dirname(join(workspace, file)), { recursive: true });
      copyFileSync(file, join(workspace, file));
    }
    const contents = () => Object.fromEntries(files.map(file => [file, readFileSync(join(workspace, file), 'utf8')]));
    const before = contents();

    execFileSync('sh', ['-c', bumpVersionCmd.replaceAll('${nextRelease.version}', '9.8.7')], {
      cwd: join(workspace, packageDir),
      stdio: 'pipe',
      // An empty pnpm cache: anything written to it was fetched from the registry.
      env: { ...process.env, XDG_CACHE_HOME: cache, npm_config_cache_dir: join(cache, 'pnpm') },
    });

    const after = contents();
    const manifest = `${packageDir}/package.json`;
    expect(JSON.parse(after[manifest] ?? '')).toMatchObject({ version: '9.8.7' });
    expect(after).toEqual({
      ...before,
      [manifest]: (before[manifest] ?? '').replace(/"version": "[^"]*"/, '"version": "9.8.7"'),
    });
    expect(existsSync(cache) ? readdirSync(cache, { recursive: true }) : []).toEqual([]);
  });
});
