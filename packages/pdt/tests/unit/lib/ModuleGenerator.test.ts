import path from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { collectAnswers, createModule, generatorOptions, pickGivenAnswers } from '@lib/ModuleGenerator.js';
import { m } from '@i18n/messages.js';
import { createPrompterMock } from '@tests/unit/mocks/prompter.js';

import type { Question } from '@mondarth/create-fvtt-module';

const mocks = vi.hoisted(() => {
  const validateModuleId = (value: string) =>
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) || 'Use lowercase words and hyphens';

  return {
    generate: vi.fn(),
    validateModuleId,
    // A cut-down questionnaire with one question of each shape the real one has.
    questions: [
      { type: 'input', name: 'moduleId', message: 'Module ID:', validate: validateModuleId },
      {
        type: 'input',
        name: 'moduleTitle',
        message: 'Module title:',
        default: (answers: { moduleId?: string }) => (answers.moduleId ? `Title of ${answers.moduleId}` : undefined),
      },
      { type: 'input', name: 'authorEmail', message: 'Author email:' },
      { type: 'confirm', name: 'restrictToSystem', message: 'Require the system?', default: false },
      {
        type: 'select',
        name: 'language',
        message: 'Language:',
        choices: [
          { value: 'typescript', name: 'TypeScript' },
          { value: 'javascript', name: 'JavaScript' },
        ],
        default: 'typescript',
      },
      {
        type: 'select',
        name: 'uiFramework',
        message: 'UI framework:',
        choices: [
          { value: 'svelte', name: 'Svelte' },
          { value: 'none', name: 'None' },
        ],
        default: 'svelte',
      },
      { type: 'input', name: 'destination', message: 'Destination:' },
      { type: 'confirm', name: 'gitInit', message: 'Initialise git?', default: true },
    ],
  };
});

vi.mock('@mondarth/create-fvtt-module', () => ({ generate: mocks.generate, questions: mocks.questions }));

const DESTINATION = path.resolve('/work/arcane-ledger');

type QuestionSpy = { mock: { calls: [{ message: string }][]; invocationCallOrder: number[] } };

/** The questions a prompter method was asked, each with its position among all mock calls. */
function askedBy(spy: QuestionSpy) {
  return spy.mock.calls.map(([question], index) => ({
    message: question.message,
    order: spy.mock.invocationCallOrder[index]!,
  }));
}

describe('collectAnswers', () => {
  test('asks every question in the order the generator lists them, except the destination', async () => {
    const { prompter, input, confirm, select } = createPrompterMock();

    await collectAnswers(DESTINATION, {}, prompter);

    const asked = [...askedBy(input), ...askedBy(confirm), ...askedBy(select)]
      .sort((a, b) => a.order - b.order)
      .map(call => call.message);
    expect(asked).toEqual([
      'Module ID:',
      'Module title:',
      'Author email:',
      'Require the system?',
      'Language:',
      'UI framework:',
      'Initialise git?',
    ]);
  });

  test('returns the answers given, with the destination it was told', async () => {
    const { prompter, input, confirm, select } = createPrompterMock();
    input.mockResolvedValueOnce('my-module').mockResolvedValueOnce('My Module').mockResolvedValueOnce('me@example.org');
    confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    select.mockResolvedValueOnce('javascript').mockResolvedValueOnce('none');

    await expect(collectAnswers(DESTINATION, {}, prompter)).resolves.toEqual({
      destination: DESTINATION,
      moduleId: 'my-module',
      moduleTitle: 'My Module',
      authorEmail: 'me@example.org',
      restrictToSystem: true,
      language: 'javascript',
      uiFramework: 'none',
      gitInit: false,
    });
  });

  describe('module ID', () => {
    test('offers the name of the destination directory when it is a valid ID', async () => {
      const { prompter, input } = createPrompterMock();

      await collectAnswers(DESTINATION, {}, prompter);

      expect(input).toHaveBeenNthCalledWith(1, expect.objectContaining({ default: 'arcane-ledger' }));
    });

    test('offers nothing when the directory name is not a valid ID', async () => {
      const { prompter, input } = createPrompterMock();
      input.mockResolvedValueOnce('typed-by-hand');

      await collectAnswers(path.resolve('/work/My Module'), {}, prompter);

      expect(input.mock.calls[0]![0]).not.toHaveProperty('default');
    });

    test("is checked with the generator's own validation", async () => {
      const { prompter, input } = createPrompterMock();

      await collectAnswers(DESTINATION, {}, prompter);

      expect(input).toHaveBeenNthCalledWith(1, expect.objectContaining({ validate: mocks.validateModuleId }));
    });
  });

  test('offers defaults that the generator derives from earlier answers', async () => {
    const { prompter, input } = createPrompterMock();
    input.mockResolvedValueOnce('chosen-id');

    await collectAnswers(DESTINATION, {}, prompter);

    expect(input).toHaveBeenNthCalledWith(2, expect.objectContaining({ default: 'Title of chosen-id' }));
  });

  test('passes neither a default nor a validator when the generator has none', async () => {
    const { prompter, input } = createPrompterMock();

    await collectAnswers(DESTINATION, {}, prompter);

    expect(input).toHaveBeenNthCalledWith(3, { message: 'Author email:' });
  });

  test('offers the choices and default of a selection', async () => {
    const { prompter, select } = createPrompterMock();

    await collectAnswers(DESTINATION, {}, prompter);

    expect(select).toHaveBeenNthCalledWith(1, {
      message: 'Language:',
      choices: [
        { value: 'typescript', name: 'TypeScript' },
        { value: 'javascript', name: 'JavaScript' },
      ],
      default: 'typescript',
    });
  });
});

describe('collectAnswers with answers given up front', () => {
  test('uses a given answer without asking for it', async () => {
    const { prompter, input, confirm, select } = createPrompterMock();

    const answers = await collectAnswers(
      DESTINATION,
      { moduleId: 'given-id', restrictToSystem: true, language: 'javascript' },
      prompter,
    );

    expect(answers).toMatchObject({ moduleId: 'given-id', restrictToSystem: true, language: 'javascript' });
    expect(input.mock.calls.map(([question]) => question.message)).toEqual(['Module title:', 'Author email:']);
    expect(confirm.mock.calls.map(([question]) => question.message)).toEqual(['Initialise git?']);
    expect(select.mock.calls.map(([question]) => question.message)).toEqual(['UI framework:']);
  });

  test('derives later defaults from a given answer', async () => {
    const { prompter, input } = createPrompterMock();

    await collectAnswers(DESTINATION, { moduleId: 'given-id' }, prompter);

    expect(input).toHaveBeenNthCalledWith(1, expect.objectContaining({ default: 'Title of given-id' }));
  });

  test('accepts false and an empty string as given answers', async () => {
    const { prompter, input, confirm } = createPrompterMock();

    const answers = await collectAnswers(DESTINATION, { authorEmail: '', gitInit: false }, prompter);

    expect(answers).toMatchObject({ authorEmail: '', gitInit: false });
    expect(input.mock.calls.map(([question]) => question.message)).not.toContain('Author email:');
    expect(confirm.mock.calls.map(([question]) => question.message)).not.toContain('Initialise git?');
  });

  test('rejects a given answer that fails validation, naming the option and the reason', async () => {
    const { prompter, input } = createPrompterMock();

    await expect(collectAnswers(DESTINATION, { moduleId: 'Bad ID' }, prompter)).rejects.toThrow(
      m['error.optionInvalid']({ option: '--module-id', value: 'Bad ID', reason: 'Use lowercase words and hyphens' }),
    );
    expect(input).not.toHaveBeenCalled();
  });

  test('rejects a given selection that is not one of the choices, listing them', async () => {
    const { prompter } = createPrompterMock();

    await expect(collectAnswers(DESTINATION, { uiFramework: 'lit' }, prompter)).rejects.toThrow(
      m['error.optionInvalid']({ option: '--ui-framework', value: 'lit', reason: 'Choose one of: svelte, none' }),
    );
  });
});

describe('collectAnswers without anyone to ask', () => {
  test('takes the default for everything that is not given', async () => {
    await expect(collectAnswers(DESTINATION)).resolves.toEqual({
      destination: DESTINATION,
      moduleId: 'arcane-ledger',
      moduleTitle: 'Title of arcane-ledger',
      authorEmail: '',
      restrictToSystem: false,
      language: 'typescript',
      uiFramework: 'svelte',
      gitInit: true,
    });
  });

  test('prefers what is given to the defaults', async () => {
    await expect(
      collectAnswers(DESTINATION, { moduleId: 'given-id', uiFramework: 'none', gitInit: false }),
    ).resolves.toMatchObject({
      moduleId: 'given-id',
      moduleTitle: 'Title of given-id',
      uiFramework: 'none',
      gitInit: false,
    });
  });

  test('fails, naming the option, when a required answer has no default and is not given', async () => {
    await expect(collectAnswers(path.resolve('/work/My Module'))).rejects.toThrow(
      m['error.optionRequired']({ option: '--module-id' }),
    );
  });
});

describe('generatorOptions', () => {
  test('describes every answer except the destination as an option, in question order', () => {
    expect(generatorOptions().map(option => option.name)).toEqual([
      'module-id',
      'module-title',
      'author-email',
      'restrict-to-system',
      'language',
      'ui-framework',
      'git-init',
    ]);
  });

  test('makes a text answer a string option described by its question, without the punctuation', () => {
    expect(generatorOptions()).toContainEqual({
      name: 'module-id',
      answer: 'moduleId',
      type: 'string',
      describe: 'Module ID',
    });
  });

  test('makes a yes or no answer a boolean option', () => {
    expect(generatorOptions()).toContainEqual({
      name: 'restrict-to-system',
      answer: 'restrictToSystem',
      type: 'boolean',
      describe: 'Require the system',
    });
  });

  test('lists the accepted values of a selection', () => {
    expect(generatorOptions()).toContainEqual({
      name: 'ui-framework',
      answer: 'uiFramework',
      type: 'string',
      describe: 'UI framework',
      choices: ['svelte', 'none'],
    });
  });
});

describe('pickGivenAnswers', () => {
  test('picks the generator answers out of parsed command line values', () => {
    const parsed = {
      _: ['init'],
      $0: 'pdt',
      dir: '.',
      f: true,
      moduleId: 'my-module',
      'module-id': 'my-module',
      gitInit: false,
    };

    expect(pickGivenAnswers(parsed)).toEqual({ moduleId: 'my-module', gitInit: false });
  });

  test('leaves out options that were not given', () => {
    expect(pickGivenAnswers({ moduleId: undefined, gitInit: undefined })).toEqual({});
  });

  test('never takes the destination from the command line values', () => {
    expect(pickGivenAnswers({ destination: '/somewhere/else' })).toEqual({});
  });

  test('ignores a value of the wrong type for its option', () => {
    expect(pickGivenAnswers({ moduleId: true, gitInit: 'yes' })).toEqual({});
  });
});

describe('createModule', () => {
  const RESULT = { destination: DESTINATION, files: ['module.json'] };

  beforeEach(() => {
    mocks.generate.mockReset();
    mocks.generate.mockResolvedValue(RESULT);
  });

  test('generates with the collected answers and reports what was written', async () => {
    const { prompter } = createPrompterMock();

    await expect(createModule(DESTINATION, { prompter })).resolves.toBe(RESULT);

    expect(mocks.generate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ destination: DESTINATION, moduleId: 'arcane-ledger', language: 'typescript' }),
      {},
    );
  });

  test('generates into the absolute path of a relative destination', async () => {
    const { prompter } = createPrompterMock();

    await createModule('some/relative-dir', { prompter });

    expect(mocks.generate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ destination: path.resolve('some/relative-dir') }),
      {},
    );
  });

  test('passes progress on to the caller', async () => {
    const { prompter } = createPrompterMock();
    const onStep = vi.fn();

    await createModule(DESTINATION, { prompter, onStep });

    expect(mocks.generate).toHaveBeenCalledExactlyOnceWith(expect.anything(), { onStep });
  });

  test('never asks the generator to overwrite existing content', async () => {
    const { prompter } = createPrompterMock();

    await createModule(DESTINATION, { prompter, onStep: vi.fn() });

    expect(mocks.generate.mock.calls[0]![1]).not.toHaveProperty('force');
  });

  test("fails with the generator's error", async () => {
    const { prompter } = createPrompterMock();
    mocks.generate.mockRejectedValue(new Error('Invalid moduleId'));

    await expect(createModule(DESTINATION, { prompter })).rejects.toThrow('Invalid moduleId');
  });

  test('generates from given answers and defaults when there is nobody to ask', async () => {
    await createModule(DESTINATION, { given: { moduleId: 'given-id', gitInit: false } });

    expect(mocks.generate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ moduleId: 'given-id', gitInit: false, language: 'typescript' }),
      {},
    );
  });

  test('generates nothing when a given answer is invalid', async () => {
    await expect(createModule(DESTINATION, { given: { moduleId: 'Bad ID' } })).rejects.toThrow('--module-id');
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  test('generates nothing when the user abandons the questions', async () => {
    const { prompter, confirm } = createPrompterMock();
    confirm.mockRejectedValue(new Error('User force closed the prompt'));

    await expect(createModule(DESTINATION, { prompter })).rejects.toThrow('User force closed the prompt');
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});

// These run against the real package, so an upgrade that changes its questionnaire in a way the
// adapter does not handle fails here and not in front of a user.
describe('the real generator questionnaire', () => {
  async function realQuestions(): Promise<readonly Question[]> {
    const real = await vi.importActual<typeof import('@mondarth/create-fvtt-module')>('@mondarth/create-fvtt-module');
    return real.questions;
  }

  test('only uses the kinds of question the adapter can ask', async () => {
    const kinds = new Set((await realQuestions()).map(question => question.type));

    expect([...kinds].sort()).toEqual(['confirm', 'input', 'select']);
  });

  test('only uses selections for the language and the UI framework', async () => {
    const selections = (await realQuestions()).filter(question => question.type === 'select');

    expect(selections.map(question => question.name).sort()).toEqual(['language', 'uiFramework']);
  });

  test('still asks for the destination, which pdt answers itself', async () => {
    expect((await realQuestions()).map(question => question.name)).toContain('destination');
  });

  test('accepts a simple directory name as a module ID', async () => {
    const moduleId = (await realQuestions()).find(question => question.name === 'moduleId');

    expect(moduleId?.type === 'input' && moduleId.validate?.('arcane-ledger')).toBe(true);
  });
});
