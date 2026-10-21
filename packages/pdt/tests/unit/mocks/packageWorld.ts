/**
 * A made-up world of packages, served as Foundry VTT's package index, Docker Hub and the release
 * notes serve theirs, for testing `pdt vtt install` without the network. The data is shaped like
 * the real services' but invented.
 */
import { vi } from 'vitest';
import { FOUNDRY_PACKAGE_INDEX, FOUNDRY_RELEASE_NOTES } from '@mondarth/fvtt-resolver/sources';
import { tagsUrl } from '@lib/VTT/coreImages.js';
import { makeZip } from './zip.js';

/** A release in the made-up world: its manifest, as its author published it. */
export interface WorldRelease {
  readonly type: 'module' | 'system';
  readonly id: string;
  readonly version: string;
  readonly compatibility?: { minimum?: string; verified?: string; maximum?: string };
  readonly requires?: readonly string[];
  readonly systems?: readonly string[];
  readonly premium?: boolean;
}

export const DETAILS = 'https://packages.example.org/detail/{id}.json';
export const manifestUrl = ({ id, version }: Pick<WorldRelease, 'id' | 'version'>) =>
  `https://example.org/${id}/${version}/manifest.json`;
export const downloadUrl = ({ id, version }: Pick<WorldRelease, 'id' | 'version'>) =>
  `https://example.org/${id}/${version}/${id}.zip`;

/** The manifest of a release. */
export function manifestOf(release: WorldRelease) {
  return {
    id: release.id,
    title: release.id,
    version: release.version,
    compatibility: release.compatibility ?? { minimum: '13', verified: '14' },
    relationships: {
      requires: (release.requires ?? []).map(id => ({ id, type: 'module' })),
      systems: (release.systems ?? []).map(id => ({ id, type: 'system' })),
    },
    manifest: `https://example.org/${release.id}/latest/manifest.json`,
    download: downloadUrl(release),
    // Premium packages' manifests say so, as their listing does.
    ...(release.premium === true && { protected: true }),
  };
}

/** The usual world: a system, and a library module with two releases, the newer for core 14 only. */
export const RELEASES: WorldRelease[] = [
  { type: 'system', id: 'example-system', version: '5.0.0' },
  { type: 'module', id: 'example-lib', version: '2.0.0', compatibility: { minimum: '14', verified: '14' } },
  { type: 'module', id: 'example-lib', version: '1.0.0', compatibility: { minimum: '13', verified: '13' } },
  { type: 'module', id: 'example-premium', version: '1.0.0', premium: true },
];

/** The builds of the release notes, and which have an image. */
export const BUILDS = [
  { version: '14.363', channel: 'stable', image: true },
  { version: '14.362', channel: 'stable', image: false },
  { version: '14.361', channel: 'stable', image: true },
  { version: '13.351', channel: 'stable', image: true },
  { version: '13.346', channel: 'stable', image: true },
  { version: '13.340', channel: 'testing', image: true },
] as const;

function releaseNotes(): string {
  const items = BUILDS.map(
    ({ version, channel }) => `
        <li class="article release flexrow">
            <h3 class="article-title"><a href="/releases/${version}" title="Release ${version} Update Notes">Release ${version}</a></h3>
            <div class="release-tags"><span class="release-tag">Update</span><span class="release-tag ${channel}">${channel}</span></div>
        </li>`,
  );
  return `<html><body><ol class="index-list releases-list">${items.join('')}</ol></body></html>`;
}

/** A release's zip, its files in a folder of its id, as authors often zip them. */
export function zipOf(release: WorldRelease): Buffer {
  return makeZip([
    { name: `${release.id}/${release.type}.json`, data: JSON.stringify(manifestOf(release)) },
    { name: `${release.id}/scripts/main.js`, data: `// ${release.id} ${release.version}` },
  ]);
}

/** What the made-up services answer, by URL. */
export function worldAnswers(releases: readonly WorldRelease[] = RELEASES, image = 'felddy/foundryvtt') {
  const answers = new Map<string, unknown>();
  const packages = [...new Map(releases.map(r => [`${r.type}:${r.id}`, r])).values()];
  answers.set(FOUNDRY_PACKAGE_INDEX, {
    details: DETAILS,
    packages: packages.map(p => ({ id: p.id, type: p.type, premium: p.premium === true, last_updated: '2026-10-01' })),
  });
  for (const p of packages) {
    answers.set(DETAILS.replace('{id}', p.id), {
      versions: releases
        .filter(r => r.type === p.type && r.id === p.id)
        .map(r => ({
          version: r.version,
          manifest: manifestUrl(r),
          minimum: r.compatibility?.minimum ?? '13',
          verified: r.compatibility?.verified ?? '14',
        })),
    });
  }
  for (const r of releases) {
    answers.set(manifestUrl(r), manifestOf(r));
    // Premium packages cannot be downloaded without a licence.
    if (r.premium !== true) answers.set(downloadUrl(r), zipOf(r));
  }
  for (const generation of new Set(BUILDS.map(b => b.version.split('.')[0]))) {
    const names = BUILDS.filter(b => b.image && b.version.startsWith(`${generation}.`)).map(b => b.version);
    answers.set(tagsUrl(image, `${generation}.`), {
      next: null,
      results: [generation, ...names].map(name => ({ name })),
    });
  }
  answers.set(FOUNDRY_RELEASE_NOTES, releaseNotes());
  return answers;
}

/** A `fetch` over answers: bytes for buffers, text for strings, JSON for anything else, 404 when there is none. */
export function worldFetch(answers: ReadonlyMap<string, unknown> = worldAnswers()) {
  return vi.fn<typeof globalThis.fetch>((input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    const body = answers.get(url);
    if (body === undefined) return Promise.resolve(new Response(null, { status: 404 }));
    if (Buffer.isBuffer(body)) return Promise.resolve(new Response(new Uint8Array(body), { status: 200 }));
    return Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 }));
  });
}
