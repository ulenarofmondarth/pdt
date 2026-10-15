/**
 * Sets the release version in package.json. This replaces @semantic-release/npm, which runs
 * `npm version`: package.json requires pnpm through devEngines, so npm refuses to run here.
 * Bring that plugin back (with pnpm) only when the package is published to a registry.
 */
export const bumpVersionCmd = 'pnpm pkg set version=${nextRelease.version}';

/**
 * semantic-release configuration.
 *
 * Releases are cut from `main` only; day-to-day work lands on `dev`. Version numbers follow
 * strict SemVer derived from Conventional Commits: `fix` -> patch, `feat` -> minor,
 * `BREAKING CHANGE:` / `!` -> major.
 *
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches: ['main'],
  plugins: [
    ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
    ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
    ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
    [
      '@semantic-release/exec',
      {
        // Bumps package.json first, so the bundle and docs carry the new version.
        prepareCmd: [
          bumpVersionCmd,
          `sed -i "s/^release = .*/release = '\${nextRelease.version}'/" docs/conf.py`,
          'pnpm build',
          'pnpm build:docs',
          'mkdir -p releases',
          '(cd docs/_build/html && zip -qr "../../../releases/pdt-docs-v${nextRelease.version}.zip" .)',
        ].join(' && '),
        // Hands the version to the later jobs of the release workflow.
        successCmd: 'echo "version=${nextRelease.version}" >> "$GITHUB_OUTPUT"',
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
