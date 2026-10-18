import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import config, { bumpVersionCmd } from '../../../release.config.js';

/**
 * package.json declares pnpm in devEngines with onFail: error, so npm refuses to run in this
 * repository. @semantic-release/npm bumps the version with `npm version` and so fails the
 * release; the bump has to go through pnpm instead.
 *
 * The bump runs where the release does, beside pnpm-lock.yaml. Without the lockfile pnpm resolves
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

  it('sets the version in package.json and changes nothing else, offline', () => {
    dir = mkdtempSync(join(tmpdir(), 'pdt-release-'));
    const project = join(dir, 'project');
    const cache = join(dir, 'cache');
    mkdirSync(project);
    copyFileSync('package.json', join(project, 'package.json'));
    copyFileSync('pnpm-lock.yaml', join(project, 'pnpm-lock.yaml'));
    const before = readFileSync(join(project, 'package.json'), 'utf8');
    const lockfile = readFileSync(join(project, 'pnpm-lock.yaml'), 'utf8');

    execFileSync('sh', ['-c', bumpVersionCmd.replaceAll('${nextRelease.version}', '9.8.7')], {
      cwd: project,
      stdio: 'pipe',
      // An empty pnpm cache: anything written to it was fetched from the registry.
      env: { ...process.env, XDG_CACHE_HOME: cache, npm_config_cache_dir: join(cache, 'pnpm') },
    });

    const after = readFileSync(join(project, 'package.json'), 'utf8');
    expect(JSON.parse(after)).toMatchObject({ version: '9.8.7' });
    expect(after).toBe(before.replace(/"version": "[^"]*"/, '"version": "9.8.7"'));
    expect(readFileSync(join(project, 'pnpm-lock.yaml'), 'utf8')).toBe(lockfile);
    expect(existsSync(cache) ? readdirSync(cache, { recursive: true }) : []).toEqual([]);
  });
});
