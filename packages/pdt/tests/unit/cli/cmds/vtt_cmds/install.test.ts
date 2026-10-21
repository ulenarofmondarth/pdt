import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yargs from 'yargs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createVttInstallCommand, gapReason, installVtt } from '@/cli/cmds/vtt_cmds/install.js';
import { instanceName, vttDataDir } from '@/cli/cmds/vtt_cmds/lifecycle.js';
import { MAX_ROUNDS } from '@lib/install/resolveInstall.js';
import { packageDir } from '@lib/install/plan.js';
import { vttSettings } from '@lib/projectVtt.js';
import { m } from '@i18n/messages.js';
import { createCommandContext, type CommandContextMock } from '@tests/unit/mocks/context.js';
import { manifestUrl, worldAnswers, worldFetch, type WorldRelease } from '@tests/unit/mocks/packageWorld.js';

const project = {
  id: 'my-module',
  title: 'My module',
  version: '0.1.0',
  compatibility: { minimum: '13', verified: '14' },
  relationships: {
    requires: [{ id: 'example-lib', type: 'module' }],
    systems: [{ id: 'example-system', type: 'system' }],
  },
};

describe('vtt install command', () => {
  let ctx: CommandContextMock;
  let sandbox: string;

  beforeEach(() => {
    ctx = createCommandContext();
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-install-'));
    ctx.paths.pdtConfigDir = path.join(sandbox, '.pdt');
    ctx.paths.userDataDir = path.join(sandbox, 'data');
    ctx.config.id = 'my-module';
    ctx.config.VTT['my-module'] = vttSettings('14.363');
    ctx.fetch.mockImplementation(worldFetch());
    fs.writeFileSync(path.join(sandbox, 'module.json'), JSON.stringify(project));
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  const output = () => ctx.out.mock.calls.map(([text]) => text).join('\n');
  const dataDir = () => vttDataDir(ctx.paths.userDataDir, instanceName('my-module', 'my-module'));

  /** Parse a command line against the command's own builder, without running its handler. */
  function parse(commandLine: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      yargs()
        .strict()
        .command({ ...createVttInstallCommand(ctx), handler: argv => resolve(argv) })
        .fail((message: string) => reject(new Error(message)))
        .parse(commandLine);
    });
  }

  test('takes the VTT, and installs unless --dry-run is given', async () => {
    await expect(parse('install')).resolves.toMatchObject({ 'dry-run': false });
    await expect(parse('install staging --dry-run')).resolves.toMatchObject({ vtt: 'staging', 'dry-run': true });
  });

  test('runs, through its handler', async () => {
    await createVttInstallCommand(ctx).handler({ _: [], $0: 'pdt', vtt: undefined, 'dry-run': true, dryRun: true });
    expect(output()).toContain(m['info.install.dryRun']());
  });

  test('does not install yet, without fetching anything', async () => {
    await expect(installVtt(ctx, undefined, false)).rejects.toThrow(m['error.install.dryRunOnly']());
    expect(ctx.fetch).not.toHaveBeenCalled();
  });

  test('shows the plan for the setup it finds, and installs nothing', async () => {
    const installed = packageDir(dataDir(), { type: 'system', id: 'example-system' });
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(path.join(installed, 'system.json'), JSON.stringify({ id: 'example-system', version: '5.0.0' }));

    await installVtt(ctx, undefined, true);

    expect(output()).toBe(
      [
        m['info.install.resolving']({ vtt: 'my-module' }),
        m['info.install.setup']({ vtt: 'my-module', core: '14.363', rounds: '2' }),
        m['info.install.keep']({ package: 'example-system', version: '5.0.0' }),
        m['info.install.install']({ package: 'example-lib', version: '2.0.0' }),
        m['info.install.project']({ package: 'my-module', version: '0.1.0' }),
        m['info.install.dryRun'](),
      ].join('\n'),
    );
    expect(fs.existsSync(packageDir(dataDir(), { type: 'module', id: 'example-lib' }))).toBe(false);
    expect(ctx.log.warn).not.toHaveBeenCalled();
  });

  test('says which packages it would replace, and which the user must install through Foundry VTT', async () => {
    ctx.config.VTT['my-module'] = {
      ...vttSettings('14.363'),
      packages: { modules: ['example-premium'], overrides: [] },
    };
    const installed = packageDir(dataDir(), { type: 'module', id: 'example-lib' });
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(path.join(installed, 'module.json'), JSON.stringify({ id: 'example-lib', version: '1.0.0' }));

    await installVtt(ctx, undefined, true);

    expect(output()).toContain(
      m['info.install.replace']({ package: 'example-lib', version: '2.0.0', installed: '1.0.0' }),
    );
    expect(output()).toContain(m['info.install.premium']({ package: 'example-premium', version: '1.0.0' }));
  });

  test('explains why there is no setup, in the user’s words', async () => {
    ctx.config.VTT['my-module'] = vttSettings('14.362');
    await expect(installVtt(ctx, undefined, true)).rejects.toThrow(
      `${m['error.install.noSetup']({ vtt: 'my-module' })}\nBecause Foundry VTT 14.362 cannot be used: ${m['error.install.noImage']({ image: 'felddy/foundryvtt' })}`,
    );
  });

  test('warns of what could not be read, once for each URL, and of what was checked only from its listing', async () => {
    const answers = worldAnswers();
    answers.delete(manifestUrl({ id: 'example-lib', version: '2.0.0' }));
    ctx.fetch.mockImplementation(worldFetch(answers));

    await installVtt(ctx, undefined, true);

    const url = manifestUrl({ id: 'example-lib', version: '2.0.0' });
    expect(ctx.log.warn.mock.calls.map(([text]) => text)).toEqual([
      [
        m['warn.install.gaps'](),
        m['warn.install.gap']({ url, reason: m['warn.install.reason.http']({ status: '404' }) }),
      ].join('\n'),
      m['warn.install.unloaded']({ packages: 'module:example-lib@2.0.0' }),
    ]);
  });

  test('stops when no build of a generation can be chosen', async () => {
    ctx.config.VTT['my-module'] = vttSettings('12');
    await expect(installVtt(ctx, undefined, true)).rejects.toThrow(
      m['error.install.noCore']({ vtt: 'my-module', generation: '12' }),
    );
  });

  // Resolving fifty rounds takes a few seconds.
  test('stops with what it still needs when the rounds run out', { timeout: 30_000 }, async () => {
    // Listings give no maximum, so each release's manifest rules it out only once it is loaded, and
    // each round goes back to the next.
    const releases: WorldRelease[] = [
      { type: 'system', id: 'example-system', version: '5.0.0' },
      ...Array.from({ length: MAX_ROUNDS + 1 }, (_, i) => ({
        type: 'module' as const,
        id: 'example-lib',
        version: `1.${i}.0`,
        compatibility: { minimum: '13', maximum: '13' },
      })),
    ];
    ctx.fetch.mockImplementation(worldFetch(worldAnswers(releases)));

    await expect(installVtt(ctx, undefined, true)).rejects.toThrow(
      m['error.install.incomplete']({
        vtt: 'my-module',
        rounds: String(MAX_ROUNDS),
        packages: 'module:example-lib@1.1.0',
      }),
    );
  });

  test.each([
    ['missing', undefined],
    ['not JSON', '{'],
  ])('stops when the project’s module.json is %s', async (_, text) => {
    const file = path.join(sandbox, 'module.json');
    if (text === undefined) fs.rmSync(file);
    else fs.writeFileSync(file, text);
    await expect(installVtt(ctx, undefined, true)).rejects.toThrow(
      m['error.install.projectUnreadable']({ file, problems: '' }).replace(/\s*$/, ''),
    );
  });

  test('says what is wrong with a module.json it can read but not use', async () => {
    const file = path.join(sandbox, 'module.json');
    fs.writeFileSync(file, JSON.stringify({ title: 'no id' }));
    await expect(installVtt(ctx, undefined, true)).rejects.toThrow(
      m['error.install.projectUnreadable']({ file, problems: 'missing-id' }),
    );
  });
});

describe('gapReason', () => {
  test.each([
    [{ source: 's', url: 'u', reason: 'http', status: 503 } as const, m['warn.install.reason.http']({ status: '503' })],
    [{ source: 's', url: 'u', reason: 'network' } as const, m['warn.install.reason.network']()],
    [{ source: 's', url: 'u', reason: 'budget' } as const, m['warn.install.reason.budget']()],
    [{ source: 's', url: 'u', reason: 'invalid' } as const, m['warn.install.reason.invalid']()],
  ])('words why %o could not be read', (gap, words) => {
    expect(gapReason(gap)).toBe(words);
  });
});
