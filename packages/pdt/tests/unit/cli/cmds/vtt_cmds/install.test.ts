import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yargs from 'yargs';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createVttInstallCommand, gapReason, installFailure, installVtt } from '@/cli/cmds/vtt_cmds/install.js';
import { InstallError } from '@lib/install/apply.js';
import { DownloadError } from '@lib/install/download.js';
import { lockfilePath, readLockfile, writeLockedVtt } from '@lib/install/lockfile.js';
import { ZipError } from '@lib/install/zip.js';
import FoundryVTTServer from '@lib/VTT/Server/FoundryVTTServer.js';
import { recordRunningVtt, runStateFile } from '@util/run-state.js';
import { createHostMock, type VTTHostMock } from '@tests/unit/mocks/vttHost.js';
import { instanceName, vttDataDir } from '@/cli/cmds/vtt_cmds/lifecycle.js';
import { MAX_ROUNDS } from '@lib/install/resolveInstall.js';
import { installedVersion, packageDir } from '@lib/install/plan.js';
import { vttSettings } from '@lib/projectVtt.js';
import { packagesSchema } from '@schema/config.js';
import { m } from '@i18n/messages.js';
import { createCommandContext, type CommandContextMock } from '@tests/unit/mocks/context.js';
import {
  downloadUrl,
  manifestUrl,
  worldAnswers,
  worldFetch,
  type WorldRelease,
} from '@tests/unit/mocks/packageWorld.js';

const DRY_RUN = { dryRun: true };

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
    await expect(parse('install')).resolves.toMatchObject({ 'dry-run': false, upgrade: false });
    await expect(parse('install --upgrade')).resolves.toMatchObject({ upgrade: true });
    await expect(parse('install staging --dry-run')).resolves.toMatchObject({ vtt: 'staging', 'dry-run': true });
  });

  test('runs, through its handler', async () => {
    await createVttInstallCommand(ctx).handler({
      _: [],
      $0: 'pdt',
      vtt: undefined,
      'dry-run': true,
      dryRun: true,
      upgrade: false,
    });
    expect(output()).toContain(m['info.install.dryRun']());
  });

  test('shows the plan for the setup it finds, and installs nothing', async () => {
    const installed = packageDir(dataDir(), { type: 'system', id: 'example-system' });
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(path.join(installed, 'system.json'), JSON.stringify({ id: 'example-system', version: '5.0.0' }));

    await installVtt(ctx, undefined, DRY_RUN);

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
      packages: packagesSchema.parse({ modules: ['example-premium'] }),
    };
    const installed = packageDir(dataDir(), { type: 'module', id: 'example-lib' });
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(path.join(installed, 'module.json'), JSON.stringify({ id: 'example-lib', version: '1.0.0' }));

    await installVtt(ctx, undefined, DRY_RUN);

    expect(output()).toContain(
      m['info.install.replace']({ package: 'example-lib', version: '2.0.0', installed: '1.0.0' }),
    );
    expect(output()).toContain(m['info.install.premium']({ package: 'example-premium', version: '1.0.0' }));
  });

  test('explains why there is no setup, in the user’s words', async () => {
    ctx.config.VTT['my-module'] = vttSettings('14.362');
    await expect(installVtt(ctx, undefined, DRY_RUN)).rejects.toThrow(
      `${m['error.install.noSetup']({ vtt: 'my-module' })}\nBecause Foundry VTT 14.362 cannot be used: ${m['error.install.noImage']({ image: 'felddy/foundryvtt' })}`,
    );
  });

  test('warns of what could not be read, once for each URL, and of what was checked only from its listing', async () => {
    const answers = worldAnswers();
    answers.delete(manifestUrl({ id: 'example-lib', version: '2.0.0' }));
    ctx.fetch.mockImplementation(worldFetch(answers));

    await installVtt(ctx, undefined, DRY_RUN);

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
    await expect(installVtt(ctx, undefined, DRY_RUN)).rejects.toThrow(
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

    await expect(installVtt(ctx, undefined, DRY_RUN)).rejects.toThrow(
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
    await expect(installVtt(ctx, undefined, DRY_RUN)).rejects.toThrow(
      m['error.install.projectUnreadable']({ file, problems: '' }).replace(/\s*$/, ''),
    );
  });

  test('says what is wrong with a module.json it can read but not use', async () => {
    const file = path.join(sandbox, 'module.json');
    fs.writeFileSync(file, JSON.stringify({ title: 'no id' }));
    await expect(installVtt(ctx, undefined, DRY_RUN)).rejects.toThrow(
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

describe('vtt install, installing', () => {
  let ctx: CommandContextMock;
  let sandbox: string;
  let host: VTTHostMock;

  beforeEach(() => {
    ctx = createCommandContext();
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-install-'));
    ctx.paths.pdtConfigDir = path.join(sandbox, '.pdt');
    ctx.paths.userDataDir = path.join(sandbox, 'data');
    ctx.config.id = 'my-module';
    ctx.config.VTT['my-module'] = vttSettings('14.363');
    ctx.fetch.mockImplementation(worldFetch());
    host = createHostMock();
    ctx.createVtt.mockImplementation((vtt, settings) => new FoundryVTTServer(vtt, settings.server, host));
    fs.writeFileSync(path.join(sandbox, 'module.json'), JSON.stringify(project));
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  const dataDir = () => vttDataDir(ctx.paths.userDataDir, instanceName('my-module', 'my-module'));
  const version = (type: 'module' | 'system', id: string) => installedVersion(dataDir(), { type, id });
  const lockfile = () => readLockfile(lockfilePath(ctx.paths.pdtConfigDir as string));
  const output = () => ctx.out.mock.calls.map(([text]) => text).join('\n');
  const withPackages = (packages: unknown) => {
    ctx.config.VTT['my-module'] = { ...vttSettings('14.363'), packages: packagesSchema.parse(packages) };
  };
  const runState = () => runStateFile(ctx.paths.pdtConfigDir as string);
  /** Records the VTT as running, as `pdt vtt start` would. */
  function running() {
    recordRunningVtt(runState(), 'my-module', {
      id: 'container-id',
      name: 'pdt-my-module',
      port: 30000,
      url: 'http://localhost:30000',
      started: '2026-10-21T00:00:00.000Z',
    });
    host.isRunning.mockResolvedValue(true);
  }

  test('installs the setup into the VTT’s data, and records it in the lockfile', async () => {
    await installVtt(ctx, undefined);

    expect([version('system', 'example-system'), version('module', 'example-lib')]).toEqual(['5.0.0', '2.0.0']);
    expect(
      fs.existsSync(path.join(packageDir(dataDir(), { type: 'module', id: 'example-lib' }), 'scripts', 'main.js')),
    ).toBe(true);
    expect(lockfile().VTT['my-module']).toEqual({
      core: '14.363',
      packages: [
        {
          package: 'module:example-lib',
          version: '2.0.0',
          source: 'pdt',
          download: downloadUrl({ id: 'example-lib', version: '2.0.0' }),
        },
        { package: 'module:my-module', version: '0.1.0', source: 'project' },
        {
          package: 'system:example-system',
          version: '5.0.0',
          source: 'pdt',
          download: downloadUrl({ id: 'example-system', version: '5.0.0' }),
        },
      ],
    });
    expect(output()).toContain(m['info.install.installing']({ package: 'example-lib', version: '2.0.0' }));
    expect(output()).toContain(m['info.install.done']({ vtt: 'my-module', installed: '2', removed: '0' }));
    expect(host.stop).not.toHaveBeenCalled();
  });

  test('keeps what is installed already, still recording what pdt installed as its own', async () => {
    await installVtt(ctx, undefined);
    ctx.out.mockClear();
    const present = packageDir(dataDir(), { type: 'module', id: 'example-premium' });
    fs.mkdirSync(present, { recursive: true });
    fs.writeFileSync(path.join(present, 'module.json'), JSON.stringify({ id: 'example-premium', version: '1.0.0' }));
    withPackages({ modules: ['example-premium'] });

    await installVtt(ctx, undefined);

    expect(output()).toContain(m['info.install.done']({ vtt: 'my-module', installed: '0', removed: '0' }));
    expect(lockfile().VTT['my-module']?.packages.map(p => [p.package, p.source])).toEqual([
      ['module:example-lib', 'pdt'],
      ['module:example-premium', 'present'],
      ['module:my-module', 'project'],
      ['system:example-system', 'pdt'],
    ]);
  });

  test('leaves a premium package for the user to install, and records it', async () => {
    withPackages({ modules: ['example-premium'] });
    await installVtt(ctx, undefined);
    expect(version('module', 'example-premium')).toBeUndefined();
    expect(lockfile().VTT['my-module']?.packages).toContainEqual({
      package: 'module:example-premium',
      version: '1.0.0',
      source: 'premium',
    });
  });

  test('keeps the versions the lockfile records where they still fit, unless told to upgrade', async () => {
    writeLockedVtt(lockfilePath(ctx.paths.pdtConfigDir as string), 'my-module', {
      core: '14.363',
      packages: [
        { package: 'module:example-lib', version: '1.0.0', source: 'pdt' },
        { package: 'module:my-module', version: '0.0.1', source: 'project' },
      ],
    });

    await installVtt(ctx, undefined, DRY_RUN);
    expect(output()).toContain(m['info.install.install']({ package: 'example-lib', version: '1.0.0' }));

    ctx.out.mockClear();
    await installVtt(ctx, undefined, { dryRun: true, upgrade: true });
    expect(output()).toContain(m['info.install.install']({ package: 'example-lib', version: '2.0.0' }));
  });

  test('removes what pdt installed that the setup no longer needs, as the removal setting says', async () => {
    const old = packageDir(dataDir(), { type: 'module', id: 'old-lib' });
    fs.mkdirSync(old, { recursive: true });
    fs.writeFileSync(path.join(old, 'module.json'), JSON.stringify({ id: 'old-lib', version: '3.0.0' }));
    writeLockedVtt(lockfilePath(ctx.paths.pdtConfigDir as string), 'my-module', {
      core: '14.363',
      packages: [{ package: 'module:old-lib', version: '3.0.0', source: 'pdt' }],
    });

    withPackages({ removal: 'never' });
    await installVtt(ctx, undefined);
    expect(output()).toContain(m['info.install.unneeded']({ package: 'old-lib 3.0.0' }));
    expect(fs.existsSync(old)).toBe(true);

    ctx.out.mockClear();
    writeLockedVtt(lockfilePath(ctx.paths.pdtConfigDir as string), 'my-module', {
      core: '14.363',
      packages: [{ package: 'module:old-lib', version: '3.0.0', source: 'pdt' }],
    });
    withPackages({});
    await installVtt(ctx, undefined);
    expect(output()).toContain(m['info.install.remove']({ package: 'old-lib 3.0.0' }));
    expect(output()).toContain(m['info.install.removing']({ package: 'old-lib' }));
    expect(fs.existsSync(old)).toBe(false);
  });

  test('names a package to remove by its id alone when its version cannot be read', async () => {
    fs.mkdirSync(packageDir(dataDir(), { type: 'module', id: 'broken-lib' }), { recursive: true });
    writeLockedVtt(lockfilePath(ctx.paths.pdtConfigDir as string), 'my-module', {
      core: '14.363',
      packages: [{ package: 'module:broken-lib', version: '1.0.0', source: 'pdt' }],
    });
    await installVtt(ctx, undefined, DRY_RUN);
    expect(output()).toContain(m['info.install.remove']({ package: 'broken-lib' }));
  });

  test('installs what it can, records what is there, and fails naming each package it could not install', async () => {
    const answers = worldAnswers();
    answers.delete(downloadUrl({ id: 'example-lib', version: '2.0.0' }));
    ctx.fetch.mockImplementation(worldFetch(answers));
    const installed = packageDir(dataDir(), { type: 'module', id: 'example-lib' });
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(path.join(installed, 'module.json'), JSON.stringify({ id: 'example-lib', version: '1.0.0' }));

    await expect(installVtt(ctx, undefined)).rejects.toThrow(m['error.install.failed']({ count: '1' }));

    expect(ctx.log.error).toHaveBeenCalledWith(
      m['error.install.packageFailed']({
        package: 'example-lib',
        version: '2.0.0',
        reason: m['error.install.reason.http']({ status: '404' }),
      }),
    );
    expect(version('system', 'example-system')).toBe('5.0.0');
    expect(lockfile().VTT['my-module']?.packages).toContainEqual({
      package: 'module:example-lib',
      version: '1.0.0',
      source: 'present',
    });
  });

  test('keeps a package pdt installed before as its own when replacing it fails', async () => {
    const answers = worldAnswers();
    answers.delete(downloadUrl({ id: 'example-lib', version: '2.0.0' }));
    ctx.fetch.mockImplementation(worldFetch(answers));
    const installed = packageDir(dataDir(), { type: 'module', id: 'example-lib' });
    fs.mkdirSync(installed, { recursive: true });
    fs.writeFileSync(path.join(installed, 'module.json'), JSON.stringify({ id: 'example-lib', version: '1.0.0' }));
    writeLockedVtt(lockfilePath(ctx.paths.pdtConfigDir as string), 'my-module', {
      core: '14.363',
      packages: [{ package: 'module:example-lib', version: '1.0.0', source: 'pdt' }],
    });

    await expect(installVtt(ctx, undefined, { upgrade: true })).rejects.toThrow();

    expect(lockfile().VTT['my-module']?.packages).toContainEqual({
      package: 'module:example-lib',
      version: '1.0.0',
      source: 'pdt',
    });
  });

  test('records nothing for a package it could not install where there was none', async () => {
    const answers = worldAnswers();
    answers.delete(downloadUrl({ id: 'example-lib', version: '2.0.0' }));
    ctx.fetch.mockImplementation(worldFetch(answers));
    await expect(installVtt(ctx, undefined)).rejects.toThrow();
    expect(lockfile().VTT['my-module']?.packages.map(p => p.package)).toEqual([
      'module:my-module',
      'system:example-system',
    ]);
  });

  describe('when the VTT is running', () => {
    test('stops it, installs, and starts it again, by default', async () => {
      running();
      await installVtt(ctx, undefined);
      expect(output()).toContain(m['info.install.stopping']({ vtt: 'my-module' }));
      expect(host.stop).toHaveBeenCalledOnce();
      expect(host.start).toHaveBeenCalledOnce();
      expect(version('module', 'example-lib')).toBe('2.0.0');
    });

    test('starts it again even when a package could not be installed', async () => {
      running();
      const answers = worldAnswers();
      answers.delete(downloadUrl({ id: 'example-lib', version: '2.0.0' }));
      ctx.fetch.mockImplementation(worldFetch(answers));
      await expect(installVtt(ctx, undefined)).rejects.toThrow();
      expect(host.start).toHaveBeenCalledOnce();
    });

    test('refuses to install when its setting blocks it', async () => {
      running();
      withPackages({ running: 'block' });
      await expect(installVtt(ctx, undefined)).rejects.toThrow(m['error.install.running']({ vtt: 'my-module' }));
      expect(version('module', 'example-lib')).toBeUndefined();
      expect(host.stop).not.toHaveBeenCalled();
    });

    test('installs, and says to restart it, when its setting warns', async () => {
      running();
      withPackages({ running: 'warn' });
      await installVtt(ctx, undefined);
      expect(version('module', 'example-lib')).toBe('2.0.0');
      expect(host.stop).not.toHaveBeenCalled();
      expect(ctx.log.warn).toHaveBeenCalledWith(m['warn.install.restart']({ vtt: 'my-module' }));
    });

    test('is not stopped for a dry run', async () => {
      running();
      await installVtt(ctx, undefined, DRY_RUN);
      expect(host.isRunning).not.toHaveBeenCalled();
    });
  });
});

describe('installFailure', () => {
  test.each([
    [new InstallError('no-download'), m['error.install.reason.noDownload']()],
    [new InstallError('wrong-package', 'other'), m['error.install.reason.wrongPackage']({ found: 'other' })],
    [new InstallError('wrong-version', '1.0'), m['error.install.reason.wrongVersion']({ found: '1.0' })],
    [new DownloadError('u', 'http', 500), m['error.install.reason.http']({ status: '500' })],
    [new DownloadError('u', 'too-large'), m['error.install.reason.tooLarge']()],
    [new DownloadError('u', 'network'), m['error.install.reason.network']()],
    [new ZipError('no-manifest', 'module.json'), m['error.install.reason.noManifest']({ file: 'module.json' })],
    [new ZipError('unsafe-entry', '../x'), m['error.install.reason.unsafeEntry']({ entry: '../x' })],
    [new ZipError('encrypted', 'x'), m['error.install.reason.encrypted']()],
    [new ZipError('too-large'), m['error.install.reason.tooLarge']()],
    [new Error('disk full'), m['error.install.reason.other']({ message: 'disk full' })],
    ['odd', m['error.install.reason.other']({ message: 'odd' })],
  ])('words %o', (error, words) => {
    expect(installFailure(error)).toBe(words);
  });
});
