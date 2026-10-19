import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  FOUNDRY_ENV,
  MODULE_MANIFEST,
  parseEnv,
  projectVtt,
  readFoundryVersion,
  readModuleId,
  vttSettings,
} from '@lib/projectVtt.js';
import { vttSchema } from '@schema/config.js';
import { m } from '@i18n/messages.js';

describe('project VTT', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-project-vtt-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function write(file: string, content: string) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }

  const manifest = () => path.join(dir, MODULE_MANIFEST);
  const env = () => path.join(dir, FOUNDRY_ENV);

  describe('readModuleId', () => {
    test("is the manifest's id", () => {
      write(MODULE_MANIFEST, JSON.stringify({ id: 'arcane-ledger', title: 'Arcane Ledger' }));

      expect(readModuleId(dir)).toEqual({ value: 'arcane-ledger' });
    });

    test('is a problem naming the manifest when there is none', () => {
      const found = readModuleId(dir);

      expect(found).toHaveProperty('problem', expect.stringContaining(manifest()));
      expect(found).toHaveProperty('problem', expect.stringContaining('ENOENT'));
    });

    test('is a problem when the manifest is not JSON', () => {
      write(MODULE_MANIFEST, '{ not json');

      expect(readModuleId(dir)).toHaveProperty('problem', expect.stringContaining(manifest()));
    });

    test.each([
      ['no id', {}],
      ['an empty id', { id: '' }],
      ['an id that is not text', { id: 7 }],
      ['not an object', ['arcane-ledger']],
    ])('is a problem when the manifest has %s', (_case, content) => {
      write(MODULE_MANIFEST, JSON.stringify(content));

      expect(readModuleId(dir)).toEqual({
        problem: m['warn.projectVtt.noModuleId']({ file: manifest(), reason: m['warn.projectVtt.reason.noId']() }),
      });
    });

    test('is a problem when the id has a dot, which a configuration key cannot', () => {
      write(MODULE_MANIFEST, JSON.stringify({ id: 'arcane.ledger' }));

      expect(readModuleId(dir)).toEqual({
        problem: m['warn.projectVtt.noModuleId']({
          file: manifest(),
          reason: m['warn.projectVtt.reason.idWithDot']({ id: 'arcane.ledger' }),
        }),
      });
    });
  });

  describe('parseEnv', () => {
    test('reads NAME=value lines, skipping blank lines and comments', () => {
      expect(parseEnv('# Foundry\n\nVERSION=13.351\nOTHER = x \n')).toEqual({ VERSION: '13.351', OTHER: 'x' });
    });

    test('takes the value up to the end of the line, = included', () => {
      expect(parseEnv('URL=https://example.com/?a=b')).toEqual({ URL: 'https://example.com/?a=b' });
    });

    test.each([
      ['double quotes', 'VERSION="13.351"'],
      ['single quotes', "VERSION='13.351'"],
      ['an export prefix', 'export VERSION=13.351'],
      ['Windows line ends', 'VERSION=13.351\r\n'],
    ])('reads a value with %s', (_case, text) => {
      expect(parseEnv(text)).toEqual({ VERSION: '13.351' });
    });

    test('skips a line without a name', () => {
      expect(parseEnv('=13\nnot a variable')).toEqual({});
    });
  });

  describe('readFoundryVersion', () => {
    test('is VERSION from the environment file', () => {
      write(FOUNDRY_ENV, 'VERSION=13.351\n');

      expect(readFoundryVersion(dir)).toEqual({ value: '13.351' });
    });

    test('is a problem naming the file when there is none', () => {
      expect(readFoundryVersion(dir)).toHaveProperty('problem', expect.stringContaining(env()));
    });

    test.each([
      ['does not set VERSION', 'OTHER=1\n'],
      ['sets an empty VERSION', 'VERSION=\n'],
    ])('is a problem when the file %s', (_case, text) => {
      write(FOUNDRY_ENV, text);

      expect(readFoundryVersion(dir)).toEqual({
        problem: m['warn.projectVtt.noFoundryVersion']({
          file: env(),
          reason: m['warn.projectVtt.reason.noVersion']({ variable: 'VERSION' }),
        }),
      });
    });
  });

  describe('vttSettings', () => {
    test('are valid settings for Foundry VTT of the version, in Docker', () => {
      expect(vttSchema.parse(vttSettings('13.351'))).toEqual({
        server: { type: 'foundry', hostname: 'localhost', version: '13.351', port: 'auto', ready: { timeout: 600 } },
        host: { type: 'docker', image: 'felddy/foundryvtt' },
      });
    });
  });

  describe('projectVtt', () => {
    test("runs the project's Foundry VTT version", () => {
      write(FOUNDRY_ENV, 'VERSION=13.351\n');

      expect(projectVtt(dir, 'arcane-ledger')).toEqual({ settings: vttSettings('13.351') });
    });

    test('is the problem, and a command naming the VTT by the project id, with a placeholder for the version', () => {
      expect(projectVtt(dir, 'arcane-ledger')).toEqual({
        problem: expect.stringContaining(env()),
        command: `pdt config set VTT.arcane-ledger '${JSON.stringify(vttSettings('<version>'))}'`,
      });
    });
  });
});
