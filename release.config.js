/**
 * semantic-release configuration.
 *
 * Releases are cut from `main` only. Version numbers follow strict SemVer derived from
 * Conventional Commits: `fix` -> patch, `feat` -> minor, `BREAKING CHANGE:` / `!` -> major.
 *
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches: ['main'],
  plugins: [
    ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
    ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
    ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
    // Bumps the version in package.json. Flip npmPublish when the package is ready for the registry.
    ['@semantic-release/npm', { npmPublish: false }],
    [
      '@semantic-release/exec',
      {
        // Runs after package.json has been bumped, so the bundle and docs carry the new version.
        prepareCmd: [
          `sed -i "s/^release = .*/release = '\${nextRelease.version}'/" docs/conf.py`,
          'pnpm build',
          'pnpm build:docs',
          'mkdir -p releases',
          '(cd docs/_build/html && zip -qr "../../../releases/pdt-docs-v${nextRelease.version}.zip" .)',
        ].join(' && '),
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json', 'docs/conf.py'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    [
      '@semantic-release/github',
      {
        assets: [{ path: 'releases/pdt-docs-v*.zip', label: 'Documentation (HTML)' }],
      },
    ],
  ],
};
