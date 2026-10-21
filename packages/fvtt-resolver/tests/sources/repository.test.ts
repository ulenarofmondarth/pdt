import { describe, expect, it } from 'vitest';
import { githubRepository, gitlabProject, tagVersion } from '../../src/sources/repository.js';

describe('githubRepository', () => {
  it.each([
    ['https://github.com/example/module/releases/latest/download/module.json', { owner: 'example', repo: 'module' }],
    ['https://github.com/example/module/releases/download/v1.0.0/module.json', { owner: 'example', repo: 'module' }],
    ['https://raw.githubusercontent.com/example/module/main/module.json', { owner: 'example', repo: 'module' }],
    ['https://github.com/example/module.git', { owner: 'example', repo: 'module' }],
  ])('finds the repository of %s', (url, repository) => {
    expect(githubRepository(url)).toEqual(repository);
  });

  it.each(['https://example.org/example/module/module.json', 'https://github.com/example', 'not a url'])(
    'finds none in %s',
    url => {
      expect(githubRepository(url)).toBeUndefined();
    },
  );
});

describe('gitlabProject', () => {
  it.each([
    ['https://gitlab.com/example/module/-/releases/v1.0.0/downloads/module.json', 'example/module'],
    ['https://gitlab.com/example/module/raw/main/package/module.json', 'example/module'],
    ['https://gitlab.com/group/sub/module/-/raw/main/module.json', 'group/sub/module'],
    ['https://gitlab.com/example/module', 'example/module'],
  ])('finds the project of %s', (url, path) => {
    expect(gitlabProject(url)).toEqual({ host: 'gitlab.com', path });
  });

  it('recognises the hosts it is given', () => {
    const url = 'https://git.example.org/team/module/-/raw/main/module.json';
    expect(gitlabProject(url)).toBeUndefined();
    expect(gitlabProject(url, ['git.example.org'])).toEqual({ host: 'git.example.org', path: 'team/module' });
  });

  // Regression: an API URL, such as a release link's into the package registry, was read as a
  // project named `api/v4/projects/...`.
  it.each([
    'https://gitlab.com/example/-/raw/main/module.json',
    'https://gitlab.com/api/v4/projects/20418308/packages/generic/midi-qol/v14.6.3/module.json',
    'not a url',
  ])('finds none in %s', url => {
    expect(gitlabProject(url)).toBeUndefined();
  });
});

describe('tagVersion', () => {
  it.each([
    ['v1.1.4', '1.1.4'],
    ['release-6.0.6', '6.0.6'],
    ['14.0.15', '14.0.15'],
    ['latest', undefined],
  ])('reads %s as %s', (tag, version) => {
    expect(tagVersion(tag)).toBe(version);
  });
});
