import { describe, expect, test } from 'vitest';
import { configOverrides, projectOption, redactArgv } from '@/cli/overrides.js';
import { ConfigError } from '@util/load-config.js';
import { ProjectError } from '@util/runtime-config.js';
import { m } from '@i18n/messages.js';

describe('configOverrides', () => {
  test('is nothing without --config', () => {
    expect(configOverrides(['vtt', 'start'])).toEqual([]);
  });

  test('picks out each --config, in order, wherever it is', () => {
    expect(
      configOverrides(['--config', 'Logging.level=debug', 'vtt', 'start', '--config=Logging.filename=x.log']),
    ).toEqual([
      { key: 'Logging.level', value: 'debug' },
      { key: 'Logging.filename', value: 'x.log' },
    ]);
  });

  test('splits at the first =, so a value can hold one', () => {
    expect(configOverrides(['--config', 'Logging.filename=a=b.log'])).toEqual([
      { key: 'Logging.filename', value: 'a=b.log' },
    ]);
  });

  test('takes an empty value', () => {
    expect(configOverrides(['--config', 'Logging.filename='])).toEqual([{ key: 'Logging.filename', value: '' }]);
  });

  test('ignores anything after --', () => {
    expect(configOverrides(['info', '--', '--config', 'Logging.level=debug'])).toEqual([]);
  });

  test('leaves a --config without a value for the parser to report', () => {
    expect(configOverrides(['info', '--config'])).toEqual([]);
  });

  test.each(['Logging.level', '=debug'])('refuses %j, which is not <key>=<value>', text => {
    const error = (() => {
      try {
        configOverrides(['--config', text]);
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(ConfigError);
    expect(error).toHaveProperty('message', m['error.config.badOverride']({ value: text }));
  });
});

describe('projectOption', () => {
  test('is nothing without --project', () => {
    expect(projectOption(['vtt', 'start'])).toBeUndefined();
  });

  test.each([[['--project', 'my-module', 'vtt', 'start']], [['vtt', 'start', '--project=my-module']]])(
    'is the value of --project, wherever it is: %j',
    args => {
      expect(projectOption(args)).toBe('my-module');
    },
  );

  test.each([[['--project', 'first', 'run', '--project', 'second']], [['--project=same', '--project', 'same']]])(
    'fails when it is given more than once: %j',
    args => {
      expect(() => projectOption(args)).toThrow(new ProjectError(m['error.project.repeated']({ count: 2 })));
    },
  );

  test('is not taken from after --', () => {
    expect(projectOption(['run', '--', '--project', 'my-module'])).toBeUndefined();
  });

  test('is nothing when --project ends the command line without a value', () => {
    expect(projectOption(['run', '--project'])).toBeUndefined();
  });
});

describe('redactArgv', () => {
  test("masks the value of a secret setting given as a command's key and value", () => {
    expect(redactArgv({ _: ['config', 'set'], $0: 'pdt', key: 'FOUNDRY.password', value: 'hunter2' })).toEqual({
      _: ['config', 'set'],
      $0: 'pdt',
      key: 'FOUNDRY.password',
      value: '*****',
    });
  });

  test('masks the secrets in a group of settings given as JSON, keeping the rest', () => {
    const value = JSON.stringify({ server: { version: '14', admin_key: 'k3y' } });

    expect(redactArgv({ key: 'VTT.mod', value }).value).toBe(
      JSON.stringify({ server: { version: '14', admin_key: '*****' } }),
    );
  });

  test.each([
    ['a setting that is not secret', 'Logging.level', 'debug'],
    ['a key that is not a setting', 'No.such', 'x'],
    ['a key that cannot be read', 'a..b', 'x'],
    ['a value that is not a group', 'VTT.mod', '[1]'],
  ])('keeps the value of %s', (_case, key, value) => {
    expect(redactArgv({ key, value }).value).toBe(value);
  });

  test('masks the secrets given with --config, keeping the rest', () => {
    expect(redactArgv({ config: ['FOUNDRY.password=hunter2', 'Logging.level=debug', 'odd'] }).config).toEqual([
      'FOUNDRY.password=*****',
      'Logging.level=debug',
      'odd',
    ]);
  });

  test('masks a single --config', () => {
    expect(redactArgv({ config: 'FOUNDRY.license_key=abc' }).config).toEqual(['FOUNDRY.license_key=*****']);
  });

  test('leaves arguments without secrets alone', () => {
    const argv = { _: ['vtt', 'start'], $0: 'pdt', vtt: 'mod' };

    expect(redactArgv(argv)).toEqual(argv);
  });
});
