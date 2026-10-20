/**
 * Creates new Foundry VTT module projects with the @mondarth/create-fvtt-module generator.
 *
 * The generator describes what it needs to know as data (its `questions`). This module turns
 * that data into command line options and, for whatever is not given as an option, asks through
 * a {@link Prompter}, so that how the questions are presented stays pdt's choice.
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
import { m } from '@i18n/messages.js';

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

/** Answers supplied up front. pdt decides the destination itself. */
export type GivenAnswers = Partial<Omit<Answers, 'destination'>>;

/** A generator answer, described as a command line option. */
export interface GeneratorOption {
  /** Option name without the leading dashes, e.g. `module-id`. */
  name: string;
  /** The generator answer the option supplies. */
  answer: keyof GivenAnswers;
  type: 'string' | 'boolean';
  /** What the option is for, in the generator's own words. */
  describe: string;
  /** The values accepted, when the answer is one of a fixed set. */
  choices?: readonly string[];
}

/** How a module is created. */
export interface CreateModuleOptions {
  /** Answers already known. They are validated but not asked for. */
  given?: GivenAnswers;
  /** How to ask for the rest. Without one, each remaining answer takes its default. */
  prompter?: Prompter;
  /** Called as each generation step finishes, with a short description of it. */
  onStep?: (message: string) => void;
}

type InputQuestion = Extract<Question, { type: 'input' }>;
type SelectName = 'language' | 'uiFramework';

/**
 * The command line option for a generator answer, e.g. `moduleId` gives `--module-id`.
 */
function optionFlag(answer: string): string {
  return `--${optionName(answer)}`;
}

function optionName(answer: string): string {
  return answer.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

/**
 * Every generator answer that can be given as a command line option, in the order the
 * generator asks for them.
 */
export function generatorOptions(): GeneratorOption[] {
  return questions.flatMap((question): GeneratorOption[] => {
    if (question.name === 'destination') return [];

    return [
      {
        name: optionName(question.name),
        answer: question.name,
        type: question.type === 'confirm' ? 'boolean' : 'string',
        describe: question.message.replace(/[:?]$/, ''),
        ...(question.type === 'select' ? { choices: question.choices.map(choice => choice.value) } : {}),
      },
    ];
  });
}

/**
 * Pick the generator answers out of parsed command line values.
 *
 * @param values - Parsed values, keyed by answer name (e.g. `moduleId`); other keys are ignored
 * @returns The answers that were given, each of the type its option declares
 */
export function pickGivenAnswers(values: Record<string, unknown>): GivenAnswers {
  const given: Record<string, unknown> = {};

  for (const option of generatorOptions()) {
    const value = values[option.answer];
    if (typeof value === option.type) given[option.answer] = value;
  }

  // Each value was just checked against the type of the option it came from.
  return given as GivenAnswers;
}

/**
 * The default to offer for a question, given the answers so far.
 *
 * The generator has no default for the module ID. pdt already knows where the module is going,
 * so it offers the name of that directory when it is a valid ID.
 */
function defaultFor(question: InputQuestion, answers: Partial<Answers>, destination: string): string | undefined {
  const offered = question.default?.(answers);
  if (offered !== undefined || question.name !== 'moduleId') return offered;

  const directoryName = path.basename(destination);
  return question.validate?.(directoryName) === true ? directoryName : undefined;
}

async function settleInput(
  question: InputQuestion,
  given: string | undefined,
  answers: Partial<Answers>,
  destination: string,
  prompter: Prompter | undefined,
): Promise<string> {
  const validate = question.validate;

  if (given !== undefined) {
    const result = validate?.(given) ?? true;
    if (result !== true) {
      throw new Error(m['error.optionInvalid']({ option: optionFlag(question.name), value: given, reason: result }));
    }
    return given;
  }

  const offered = defaultFor(question, answers, destination);

  if (prompter !== undefined) {
    return prompter.input({
      message: question.message,
      ...(offered === undefined ? {} : { default: offered }),
      ...(validate === undefined ? {} : { validate }),
    });
  }

  // Nobody to ask: take the default, or nothing at all where nothing is acceptable.
  const value = offered ?? '';
  if (validate !== undefined && validate(value) !== true) {
    throw new Error(m['error.optionRequired']({ option: optionFlag(question.name) }));
  }
  return value;
}

async function settleSelect<K extends SelectName>(
  question: SelectQuestionFor<K>,
  given: Answers[K] | undefined,
  prompter: Prompter | undefined,
): Promise<Answers[K]> {
  if (given !== undefined) {
    if (!question.choices.some(choice => choice.value === given)) {
      const values = question.choices.map(choice => choice.value).join(', ');
      throw new Error(
        m['error.optionInvalid']({
          option: optionFlag(question.name),
          value: given,
          reason: `Choose one of: ${values}`,
        }),
      );
    }
    return given;
  }

  if (prompter === undefined) return question.default;

  return prompter.select({ message: question.message, choices: question.choices, default: question.default });
}

/**
 * Settle everything the generator needs to know, except where to put the module.
 *
 * An answer that is given is validated and used. Any other is asked for through the prompter,
 * or takes its default when there is no prompter.
 *
 * @param destination - Directory the module will be generated into
 * @param given - Answers already known
 * @param prompter - How to ask for the rest, if the user can be asked
 * @returns A complete set of answers
 * @throws {Error} When a given answer is invalid, or there is no prompter and a required answer has no default
 */
export async function collectAnswers(
  destination: string,
  given: GivenAnswers = {},
  prompter?: Prompter,
): Promise<Answers> {
  const answers: Partial<Answers> = { destination };

  for (const question of questions) {
    if (question.name === 'destination') continue;

    switch (question.type) {
      case 'input': {
        const text = await settleInput(question, given[question.name], answers, destination, prompter);
        // The generator types a text question's name as any string-valued answer, which includes
        // the two answers that are really selections, so a plain indexed assignment does not check.
        Object.assign(answers, { [question.name]: text });
        break;
      }
      case 'confirm':
        answers[question.name] =
          given[question.name] ??
          (prompter === undefined
            ? question.default
            : await prompter.confirm({ message: question.message, default: question.default }));
        break;
      case 'select':
        if (question.name === 'language') {
          answers.language = await settleSelect(question, given.language, prompter);
        } else {
          answers.uiFramework = await settleSelect(question, given.uiFramework, prompter);
        }
        break;
    }
  }

  // Every key of Answers is one of the generator's questions, and each has now been settled.
  // generate() validates the whole set again before it writes anything.
  return answers as Answers;
}

/**
 * Create a new Foundry VTT module project.
 *
 * @param destination - Directory to create the module in; it must be empty or not exist yet
 * @param options - Answers already known, how to ask for the rest, and where to report progress
 * @returns Where the project is and which files were written
 * @throws {Error} When an answer is invalid or missing, or the destination already has content
 */
export async function createModule(destination: string, options: CreateModuleOptions = {}): Promise<GenerateResult> {
  const answers = await collectAnswers(path.resolve(destination), options.given, options.prompter);

  return generate(answers, options.onStep === undefined ? {} : { onStep: options.onStep });
}
