import { vi } from 'vitest';

import type { Prompter } from '@lib/ModuleGenerator.js';

type InputQuestion = Parameters<Prompter['input']>[0];
type ConfirmQuestion = Parameters<Prompter['confirm']>[0];
type SelectQuestion = { message: string; choices: readonly { value: string; name: string }[]; default: string };

/**
 * A Prompter that answers every question with the default it is offered, or with an empty
 * string when a text question offers none. Each method is a spy.
 *
 * It is declared as a Prompter, so the type check fails if the interface changes.
 */
export function createPrompterMock() {
  const input = vi.fn(async (question: InputQuestion) => question.default ?? '');
  const confirm = vi.fn(async (question: ConfirmQuestion) => question.default);
  const select = vi.fn(async (question: SelectQuestion) => question.default);

  const prompter: Prompter = { input, confirm, select: select as Prompter['select'] };

  return { prompter, input, confirm, select };
}
