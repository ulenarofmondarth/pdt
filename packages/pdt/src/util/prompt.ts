import { confirm, input, select } from '@inquirer/prompts';

import type { Prompter } from '@lib/ModuleGenerator.js';

/**
 * Whether the user can be asked questions: both input and output must be a terminal.
 */
export function canPrompt(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

/** Asks questions as interactive prompts in the terminal. */
export const terminalPrompter: Prompter = {
  input: question => input(question),
  confirm: question => confirm(question),
  select: question => select({ ...question, choices: [...question.choices] }),
};
