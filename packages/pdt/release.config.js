import { packageRelease } from '../../release.base.js';

/**
 * Releases pdt. It is not published to a registry: the release attaches the documentation, which
 * carries pdt's version (docs/conf.py reads it from this package's package.json).
 */
export default packageRelease({
  prepare: [
    'pnpm build',
    'pnpm --workspace-root build:docs',
    'mkdir -p releases',
    'out="$(pwd)/releases" && (cd ../../docs/_build/html && zip -qr "$out/pdt-docs-v${nextRelease.version}.zip" .)',
  ],
  output: 'version',
  // pdt's commits since 0.2.1 were made before it moved into packages/pdt, so
  // semantic-release-monorepo would drop them all. Count every commit for this one release; remove
  // this once a release of pdt has been tagged @mondarth/pdt-v<version> after 0.2.1.
  allCommitsTagFormat: '@mondarth/pdt-v${version}',
  githubAssets: [{ path: 'releases/pdt-docs-v*.zip', label: 'Documentation (HTML)' }],
});
