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
  githubAssets: [{ path: 'releases/pdt-docs-v*.zip', label: 'Documentation (HTML)' }],
});
