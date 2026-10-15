import { afterEach, describe, expect, test, vi } from 'vitest';
import { confirm, input, select } from '@inquirer/prompts';
import { canPrompt, terminalPrompter } from '@util/prompt.js';

// No test may wait on a real terminal.
vi.mock('@inquirer/prompts', () => ({ input: vi.fn(), confirm: vi.fn(), select: vi.fn() }));

describe('canPrompt', () => {
  const original = { stdin: process.stdin.isTTY, stdout: process.stdout.isTTY };

  function terminal(stdin: boolean | undefined, stdout: boolean | undefined) {
    Object.defineProperty(process.stdin, 'isTTY', { value: stdin, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: stdout, configurable: true });
  }

  afterEach(() => {
    terminal(original.stdin, original.stdout);
  });

  test('is true when both input and output are a terminal', () => {
    terminal(true, true);

    expect(canPrompt()).toBe(true);
  });

  test.each([
    { case: 'input is piped', stdin: undefined, stdout: true },
    { case: 'output is piped', stdin: true, stdout: undefined },
    { case: 'neither is a terminal', stdin: undefined, stdout: undefined },
  ])('is false when $case', ({ stdin, stdout }) => {
    terminal(stdin, stdout);

    expect(canPrompt()).toBe(false);
  });
});

describe('terminalPrompter', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  test('asks for text with the message, default and validator it is given', async () => {
    const question = { message: 'Module ID:', default: 'my-module', validate: () => true as const };
    vi.mocked(input).mockResolvedValue('typed');

    await expect(terminalPrompter.input(question)).resolves.toBe('typed');
    expect(input).toHaveBeenCalledExactlyOnceWith(question);
  });

  test('asks a yes or no question', async () => {
    const question = { message: 'Initialise git?', default: true };
    vi.mocked(confirm).mockResolvedValue(false);

    await expect(terminalPrompter.confirm(question)).resolves.toBe(false);
    expect(confirm).toHaveBeenCalledExactlyOnceWith(question);
  });

  test('offers the choices of a selection', async () => {
    const choices = [
      { value: 'svelte', name: 'Svelte' },
      { value: 'none', name: 'None' },
    ] as const;
    vi.mocked(select).mockResolvedValue('none');

    await expect(terminalPrompter.select({ message: 'UI framework:', choices, default: 'svelte' })).resolves.toBe(
      'none',
    );
    expect(select).toHaveBeenCalledExactlyOnceWith({
      message: 'UI framework:',
      choices: [...choices],
      default: 'svelte',
    });
  });
});
