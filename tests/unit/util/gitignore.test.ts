import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ignoreProjectFiles } from '@util/gitignore.js';

describe('ignoreProjectFiles', () => {
  let root: string;
  let gitignore: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pdt-gitignore-'));
    gitignore = path.join(root, '.gitignore');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const read = () => fs.readFileSync(gitignore, 'utf8');

  test('creates the .gitignore, naming each file in .pdt', () => {
    expect(ignoreProjectFiles(root, ['secrets.conf', 'pdt.log'])).toEqual(['.pdt/secrets.conf', '.pdt/pdt.log']);

    expect(read()).toBe('.pdt/secrets.conf\n.pdt/pdt.log\n');
  });

  test('adds to the end of a .gitignore, after its last line even without a newline', () => {
    fs.writeFileSync(gitignore, 'node_modules\ndist');

    ignoreProjectFiles(root, ['secrets.conf']);

    expect(read()).toBe('node_modules\ndist\n.pdt/secrets.conf\n');
  });

  test.each(['.pdt/secrets.conf', '/.pdt/secrets.conf', '  .pdt/secrets.conf  '])(
    'leaves out a file the .gitignore already names as %j',
    line => {
      fs.writeFileSync(gitignore, `${line}\n`);

      expect(ignoreProjectFiles(root, ['secrets.conf', 'pdt.log'])).toEqual(['.pdt/pdt.log']);

      expect(read()).toBe(`${line}\n.pdt/pdt.log\n`);
    },
  );

  test.each(['.pdt', '.pdt/', '/.pdt/'])('adds nothing when the .gitignore names the .pdt directory as %j', line => {
    fs.writeFileSync(gitignore, `${line}\n`);

    expect(ignoreProjectFiles(root, ['secrets.conf'])).toEqual([]);

    expect(read()).toBe(`${line}\n`);
  });

  test('changes nothing when every file is named already', () => {
    fs.writeFileSync(gitignore, '.pdt/secrets.conf\n');
    const before = fs.statSync(gitignore).mtimeMs;

    expect(ignoreProjectFiles(root, ['secrets.conf', 'secrets.conf'])).toEqual([]);

    expect(fs.statSync(gitignore).mtimeMs).toBe(before);
  });

  test('names a file given twice once', () => {
    expect(ignoreProjectFiles(root, ['pdt.log', 'pdt.log'])).toEqual(['.pdt/pdt.log']);
  });
});
