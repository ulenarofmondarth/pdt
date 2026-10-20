import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import config, { bumpVersionCmd } from '../../release.config.js';

/**
 * The workspace's package.json declares pnpm in devEngines with onFail: error, so npm refuses to
 * run in this repository. @semantic-release/npm bumps the version with `npm version` and so fails the
 * release; the bump has to go through pnpm instead.
 *
 * The bump runs where the release does, at the workspace root beside pnpm-lock.yaml. Without the lockfile pnpm resolves
 * the devEngines range from the registry, which once took the test past its timeout on CI.
 */

const pluginNames = (config.plugins ?? []).map(plugin => (Array.isArray(plugin) ? plugin[0] : plugin));

describe('release version bump', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('does not use @semantic-release/npm, which runs npm', () => {
    expect(pluginNames).not.toContain('@semantic-release/npm');
  });

  it("sets the version in pdt's package.json and changes nothing else, offline", () => {
    dir = mkdtempSync(join(tmpdir(), 'pdt-release-'));
    const workspace = join(dir, 'workspace');
    const cache = join(dir, 'cache');
    mkdirSync(join(workspace, 'packages', 'pdt'), { recursive: true });
    for (const file of ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'packages/pdt/package.json']) {
      copyFileSync(file, join(workspace, file));
    }
    const contents = () =>
      Object.fromEntries(
        ['package.json', 'pnpm-lock.yaml', 'packages/pdt/package.json'].map(file => [
          file,
          readFileSync(join(workspace, file), 'utf8'),
        ]),
      );
    const before = contents();

    execFileSync('sh', ['-c', bumpVersionCmd.replaceAll('${nextRelease.version}', '9.8.7')], {
      cwd: workspace,
      stdio: 'pipe',
      // An empty pnpm cache: anything written to it was fetched from the registry.
      env: { ...process.env, XDG_CACHE_HOME: cache, npm_config_cache_dir: join(cache, 'pnpm') },
    });

    const after = contents();
    const pdtPackage = before['packages/pdt/package.json'] ?? '';
    expect(JSON.parse(after['packages/pdt/package.json'] ?? '')).toMatchObject({ version: '9.8.7' });
    expect(after).toEqual({
      ...before,
      'packages/pdt/package.json': pdtPackage.replace(/"version": "[^"]*"/, '"version": "9.8.7"'),
    });
    expect(existsSync(cache) ? readdirSync(cache, { recursive: true }) : []).toEqual([]);
  });
});
