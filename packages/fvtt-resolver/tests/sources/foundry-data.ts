/**
 * Made-up data in the shape of Foundry VTT's public package index and details files, and of the
 * manifests they point to. The names are invented: no data of Foundry's or of any package's is
 * kept here.
 */
export const INDEX = 'https://packages.example.org/index-latest.json';
export const details = (id: string) => `https://packages.example.org/detail/${id}.json`;
export const manifest = (id: string, version: string) => `https://example.org/${id}/${version}/manifest.json`;

export const index = (lastUpdated: Record<string, string> = {}) => ({
  format: 1,
  details: 'https://packages.example.org/detail/{id}.json',
  packages: [
    { id: 'example-module', type: 'module', last_updated: lastUpdated['example-module'] ?? '2026-10-01' },
    { id: 'example-lib', type: 'module', last_updated: '2026-09-01' },
    { id: 'example-system', type: 'system', last_updated: '2026-08-01' },
    { id: 'example-premium', type: 'module', premium: true },
  ],
});

export const detailsOf: Record<string, unknown> = {
  'example-module': {
    format: 1,
    id: 'example-module',
    versions: [
      { version: '2.0.0', minimum: '14', verified: '14.368', manifest: manifest('example-module', '2.0.0') },
      { version: '1.0.0', minimum: 13, verified: '13', manifest: manifest('example-module', '1.0.0') },
      { version: '0.1.0', notes: 'no manifest, so left out' },
    ],
  },
  'example-lib': {
    versions: [
      { version: '3.0.0', minimum: '15', manifest: manifest('example-lib', '3.0.0') },
      { version: '2.1.0', minimum: '13', manifest: manifest('example-lib', '2.1.0') },
    ],
  },
  'example-system': {
    versions: [{ version: '5.0.0', minimum: '13', verified: '14', manifest: manifest('example-system', '5.0.0') }],
  },
  'example-premium': { versions: [{ version: '1.0.0', manifest: manifest('example-premium', '1.0.0') }] },
};

export const manifests: Record<string, unknown> = {
  [manifest('example-module', '2.0.0')]: {
    id: 'example-module',
    version: '2.0.0',
    compatibility: { minimum: '13', verified: '14' },
    relationships: {
      requires: [{ id: 'example-lib', compatibility: { minimum: '2' } }],
      systems: [{ id: 'example-system' }],
    },
  },
  [manifest('example-lib', '2.1.0')]: { id: 'example-lib', version: '2.1.0', compatibility: { minimum: '13' } },
  [manifest('example-system', '5.0.0')]: { id: 'example-system', version: '5.0.0', compatibility: { minimum: '13' } },
};
