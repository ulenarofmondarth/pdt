/**
 * Creates new Foundry VTT module projects with the @mondarth/create-fvtt-module generator.
 *
 * The generator describes what it needs to know as data (its `questions`). This module asks
 * those questions through a {@link Prompter}, so that how they are presented stays pdt's choice.
 */
import path from 'node:path';
import {
  generate,
  questions,
  type Answers,
  type GenerateResult,
  type Question,
  type SelectQuestionFor,
  type Validation,
} from '@mondarth/create-fvtt-module';

/** How questions are put to the user. */
export interface Prompter {
  /** Ask for a line of text. */
  input(question: { message: string; default?: string; validate?: (value: string) => Validation }): Promise<string>;

  /** Ask a yes or no question. */
  confirm(question: { message: string; default: boolean }): Promise<boolean>;

  /** Ask the user to pick one of a fixed set of values. */
  select<T extends string>(question: {
    message: string;
    choices: readonly { value: T; name: string }[];
    default: T;
  }): Promise<T>;
}

function askSelect<K extends 'language' | 'uiFramework'>(
  prompter: Prompter,
  question: SelectQuestionFor<K>,
): Promise<Answers[K]> {
  return prompter.select({ message: question.message, choices: question.choices, default: question.default });
}

/**
 * The default to offer for a question, given the answers so far.
 *
 * The generator has no default for the module ID. pdt already knows where the module is going,
 * so it offers the name of that directory when it is a valid ID.
 */
function defaultFor(
  question: Extract<Question, { type: 'input' }>,
  answers: Partial<Answers>,
  destination: string,
): string | undefined {
  const offered = question.default?.(answers);
  if (offered !== undefined || question.name !== 'moduleId') return offered;

  const directoryName = path.basename(destination);
  return question.validate?.(directoryName) === true ? directoryName : undefined;
}

/**
 * Ask everything the generator needs to know, except where to put the module.
 *
 * @param destination - Directory the module will be generated into
 * @param prompter - How to ask
 * @returns A complete set of answers
 */
export async function collectAnswers(destination: string, prompter: Prompter): Promise<Answers> {
  const answers: Partial<Answers> = { destination };

  for (const question of questions) {
    if (question.name === 'destination') continue;

    switch (question.type) {
      case 'input': {
        const offered = defaultFor(question, answers, destination);
        const text = await prompter.input({
          message: question.message,
          ...(offered === undefined ? {} : { default: offered }),
          ...(question.validate === undefined ? {} : { validate: question.validate }),
        });
        // The generator types a text question's name as any string-valued answer, which includes
        // the two answers that are really selections, so a plain indexed assignment does not check.
        Object.assign(answers, { [question.name]: text });
        break;
      }
      case 'confirm':
        answers[question.name] = await prompter.confirm({ message: question.message, default: question.default });
        break;
      case 'select':
        if (question.name === 'language') answers.language = await askSelect(prompter, question);
        else answers.uiFramework = await askSelect(prompter, question);
        break;
    }
  }

  // Every key of Answers is one of the generator's questions, and each has now been answered.
  // generate() validates the whole set again before it writes anything.
  return answers as Answers;
}

/**
 * Create a new Foundry VTT module project.
 *
 * @param destination - Directory to create the module in; it must be empty or not exist yet
 * @param prompter - How to ask the user about the module
 * @param onStep - Called as each generation step finishes, with a short description of it
 * @returns Where the project is and which files were written
 * @throws {Error} When an answer is invalid or the destination already has content
 */
export async function createModule(
  destination: string,
  prompter: Prompter,
  onStep?: (message: string) => void,
): Promise<GenerateResult> {
  const answers = await collectAnswers(path.resolve(destination), prompter);

  return generate(answers, onStep === undefined ? {} : { onStep });
}
