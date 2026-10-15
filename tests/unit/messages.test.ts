import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const MESSAGES_DIR = path.resolve('messages');
const BASE_LOCALE = 'en';

type MessageTree = { [key: string]: string | MessageTree };

/** Flatten nested messages to `a.b.c` keys. */
function flatten(tree: MessageTree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((flat, [key, value]) => {
    if (typeof value === 'string') flat[prefix + key] = value;
    else Object.assign(flat, flatten(value, `${prefix}${key}.`));
    return flat;
  }, {});
}

function messages(locale: string): Record<string, string> {
  const file = path.join(MESSAGES_DIR, `${locale}.json`);
  const tree = JSON.parse(fs.readFileSync(file, 'utf8')) as MessageTree;
  // $schema is the file's format marker, not a message.
  return Object.fromEntries(Object.entries(flatten(tree)).filter(([key]) => key !== '$schema'));
}

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{[^}]+\}/g)].map(match => match[0]).sort();
}

const settings = JSON.parse(fs.readFileSync(path.resolve('project.inlang/settings.json'), 'utf8')) as {
  baseLocale: string;
  locales: string[];
};
const translations = settings.locales.filter(locale => locale !== BASE_LOCALE);

describe('message files', () => {
  const base = messages(BASE_LOCALE);

  test('English is the base locale', () => {
    expect(settings.baseLocale).toBe(BASE_LOCALE);
  });

  test('every message file belongs to a configured locale, and every locale has a file', () => {
    const files = fs
      .readdirSync(MESSAGES_DIR)
      .filter(file => file.endsWith('.json'))
      .map(file => path.basename(file, '.json'));

    expect(files.sort()).toEqual([...settings.locales].sort());
  });

  describe.each(translations)('%s', locale => {
    const translated = messages(locale);

    test('translates every English message and nothing else', () => {
      expect(Object.keys(translated).sort()).toEqual(Object.keys(base).sort());
    });

    test('leaves no message empty', () => {
      expect(Object.entries(translated).filter(([, text]) => text.trim() === '')).toEqual([]);
    });

    test('keeps the placeholders of every message', () => {
      const mismatched = Object.keys(base).filter(
        key => placeholders(translated[key] ?? '').join() !== placeholders(base[key]!).join(),
      );

      expect(mismatched).toEqual([]);
    });
  });
});
