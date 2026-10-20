import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { packageReleases, pluginOptions } from './release-packages.js';

/**
 * Each workspace package is released on its own (release.base.js): semantic-release runs in the
 * package's directory, and semantic-release-monorepo keeps to the commits that change it. These
 * check that every package is wired up the same way, and that the release workflow knows of it.
 */

interface Job {
  if?: string;
  permissions?: Record<string, string>;
  outputs?: Record<string, string>;
  steps?: { run?: string; with?: Record<string, string> }[];
}

const workflow = parse(readFileSync('.github/workflows/release.yml', 'utf8')) as { jobs: Record<string, Job> };
const rootManifest = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
const releases = await packageReleases();

/** The workflow output a package's release writes its version to. */
function outputOf(config: Parameters<typeof pluginOptions>[0]): string {
  const successCmd = String(pluginOptions(config, '@semantic-release/exec')?.successCmd);
  const output = /^echo "([\w-]+)=\$\{nextRelease\.version\}" >> "\$GITHUB_OUTPUT"$/.exec(successCmd)?.[1];
  if (output === undefined) throw new Error(`unexpected successCmd: ${successCmd}`);
  return output;
}

describe.each(releases)('the release of $dir', ({ dir, config }) => {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    name: string;
    publishConfig?: { access?: string };
  };

  // semantic-release-monorepo tags `<package name>-v<version>`; a release that counts every commit
  // (see pdt's below) must tag the same way, or the next release would not find its tag.
  it('counts only the commits that change the package, or tags as if it did', () => {
    if (config.extends === undefined) {
      expect(config.tagFormat).toBe(`${manifest.name}-v\${version}`);
    } else {
      expect(config.extends).toBe('semantic-release-monorepo');
      expect(config.tagFormat).toBeUndefined();
    }
  });

  it('is cut from main only', () => {
    expect(config.branches).toEqual(['main']);
  });

  // @semantic-release/git commits only modified files under the directory semantic-release runs in.
  it('commits only files in the package', () => {
    const assets = pluginOptions(config, '@semantic-release/git')?.assets as string[];
    expect(assets.every(asset => !asset.startsWith('..') && !asset.startsWith('/'))).toBe(true);
  });

  it('hands its version to the release workflow', () => {
    const output = outputOf(config);
    expect(workflow.jobs.release?.outputs?.[output]).toBe(`\${{ steps.release.outputs.${output} }}`);
    expect(workflow.jobs['sync-dev']?.if).toContain(`needs.release.outputs.${output} != ''`);
  });

  const publishCmd = pluginOptions(config, '@semantic-release/exec')?.publishCmd as string | undefined;
  if (publishCmd !== undefined) {
    it('publishes publicly with pnpm, through trusted publishing', () => {
      expect(publishCmd).toMatch(/^pnpm publish\b/);
      expect(manifest.publishConfig?.access).toBe('public');
      expect(workflow.jobs.release?.permissions?.['id-token']).toBe('write');
    });
  }
});

/*
 * pdt's commits up to and including its move into packages/pdt changed src/ and the rest at the
 * root, so semantic-release-monorepo would drop every feat and fix since 0.2.1. Its first release
 * from the workspace counts every commit instead. Once that release is tagged, every later commit
 * is made in packages/, and this exception (and this test) should go.
 */
describe("pdt's first release from the workspace", () => {
  const pdt = releases.find(({ dir }) => dir === join('packages', 'pdt'));

  it('counts the commits made before pdt moved into packages/pdt', () => {
    expect(pdt?.config.extends).toBeUndefined();
  });
});

describe('the releases', () => {
  it('write their versions to outputs of their own', () => {
    const outputs = releases.map(({ config }) => outputOf(config));
    expect(new Set(outputs).size).toBe(outputs.length);
  });

  it('run in every package, one at a time, from the release workflow', () => {
    expect(rootManifest.scripts.release).toBe('pnpm --recursive --workspace-concurrency=1 exec semantic-release');
    expect(workflow.jobs.release?.steps?.map(step => step.run)).toContain('pnpm release');
  });

  it("publish the documentation from pdt's release tag", () => {
    const ref = workflow.jobs.pages?.steps?.find(step => step.with?.ref !== undefined)?.with?.ref;
    expect(ref).toContain("format('@mondarth/pdt-v{0}', needs.release.outputs.version)");
  });
});
