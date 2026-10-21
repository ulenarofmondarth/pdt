# Resolution

This page covers the questions the resolver answers, and how one solver answers them all.

## The questions

Check
: Is this setup valid? Given a core release, a system release and module releases, it gives each release a verdict and lists every constraint that fails. No search is needed, so this is the cheapest question, and the one pdt asks of a VTT that is already installed.

Resolve
: What should be installed? Given requirements, it finds the **best** valid setup that meets them. Requirements are things like "my-module from this directory, core 14, the newest dnd5e that works", plus pins and overrides. "Best" is set by preferences (below).

Explain
: Why can't it be done? When there is no valid setup, it gives the reason as a chain a person can follow:

  > *(An illustration; the versions are made up.)*
  >
  > my-module 2.0.0 needs core 13 to 14, and dnd5e 4 or later.
  > Every dnd5e from 5.0.0 needs core 14.350 or later, and dnd5e 4.x does not support core 14.
  > other-module 3.x, which my-module needs, supports core 13 only.
  > So my-module 2.0.0 cannot be used with dnd5e on core 14.

  Resolve gives this explanation whenever it fails. It is not a separate question, but it shapes the choice of solver more than anything else.

Matrix
: Where does it work? For a root package, it resolves each cell of a grid: core generations across, and system versions (or a support matrix's cells) down. Each cell holds a setup or an explanation. This is the "analyse the graph" view: a module's real compatibility, taking its dependencies' declarations into account as well as its own.

Upgrade
: What can move? Given a locked setup, it reports which releases have newer valid versions, and which of those would force other changes. This is Resolve, preferring the locked versions, compared with the lock.

## One solver: version solving

All five questions reduce to one problem. Choose at most one release of each package, so that every constraint holds and the requirements are met. That is **version solving**. In general it is NP-complete, but in practice it is easy at the resolver's scale: tens of packages and hundreds of releases.

I propose the **PubGrub** algorithm (Natalie Weizenbaum, 2018, written for Dart's pub; uv, Poetry and others have adopted it). Why it fits:

- **Explanations are built in.** PubGrub works with *incompatibilities*, sets of terms that cannot all be true, and derives new ones as it learns. When it fails, the derivation of the final incompatibility *is* the explanation shown above, in terms of the original constraints and their provenance. Backtracking solvers can say only "no solution".
- **It learns from conflicts.** It does not retry the same dead end, which matters once the matrix asks for many resolutions over the same universe.
- **It is well documented and small.** The algorithm is short, and there are several open implementations to test against. Writing our own (a few hundred lines) avoids a dependency, and lets incompatibilities carry our provenance.

### The engine

The solver (`src/solver/`) knows nothing of Foundry VTT. A provider supplies three things:
- each package's version order;
- its candidate versions, most preferred first;
- the incompatibilities each version brings.

It follows pub's description of the algorithm, with these choices:

- **Which package next.** It decides the package with the fewest candidate versions left first, so that a dead end is found early. Among versions, it takes the provider's first.
- **Dependencies are stated per version.** pub widens a dependency to every version of the package that shares it ("every version of foo depends on bar ^2.0.0"). This solver states it for the one version, so an explanation also says that no other version fits. Grouping versions that share a dependency can come later, to shorten explanations.
- **Incompatibilities that cannot hold are ignored.** An example is a version that depends on a range of its own package that includes it.
- **Explanations are kept whole.** A failure returns the incompatibility that proves it, and each derived incompatibility keeps the two it came from. Its leaves are the root, "no versions", or the provider's own incompatibilities with their data. So nothing is lost before the explanation is put into words.

It is tested on the examples in pub's documentation, and against brute force: on thousands of random small registries with dependencies and conflicts, it finds a valid choice exactly when one exists.

### Encoding the domain

The constraints of {doc}`domain` map directly onto PubGrub's incompatibilities:

| Constraint | Incompatibility |
| --- | --- |
| Dependency: *R* needs *P* in *X* | {*R*, *P* not in *X*} |
| Exclusion: *R* excludes *P* in *X* | {*R*, *P* in *X*} |
| Unusable: *R* | {*R*} |
| Requirement: use *P* in *X* | {requirements, *P* not in *X*} |
| Pin: use *P* at *v* | {requirements, *P* not at *v*} |

The caller's requirements are a virtual package, `requirements`: the solver's root. A setup always has a core release and a system, so the root also needs `core` and `world-system`, at any version. Preferences and advisories bring no incompatibility.

The one shape PubGrub has no term for is the **choice** made by `relationships.systems`: the world's system must be dnd5e 4 to 5, *or* pf2e 7. A second virtual package, `world-system`, handles it.
- **Its versions:** each is one system release, written `dnd5e@5.1.0`. They are ordered by system id, then in that system's own order.
- **A system and its version are tied together:** a system release depends on exactly its own `world-system` version, and that version depends on the release. So a world has exactly one system.
- **A module's systems list:** it becomes an ordinary dependency on the matching `world-system` versions. Each option's range becomes the stretch of that system's versions; a range open at an end runs to the first or last version of the system.

Choosing the system is choosing a version of `world-system`. Core is already a package. So the solver deals with packages, versions and sets of versions only.

Candidates are the releases in the universe:
- **Core:** limited to the policy's `coreChannels`.
- **Pre-releases:** left out unless `prereleases: include`, or they are pinned or preferred. Foundry VTT has no notion of a pre-release, so a version counts as one when it contains a word such as `alpha`, `beta`, `rc`, `pre` or `dev`.
- **Duplicates:** when the universe gives the same version twice, the first is used.

### Preferences

When more than one setup is valid, preferences pick between them. For each package, the candidate versions are ordered:

1. **Pinned and preferred versions** first, so that an existing setup changes only when it must.
2. **Versions more of the releases already decided prefer.** These are the preference constraints:
   - `verified`, under `verified: prefer`;
   - the ranges in `relationships.systems`, under `systemCompatibility: prefer`.

   For example, midi-qol 14.0.15 prefers dnd5e 5.3.0 to 5.9.99, so once midi-qol is decided, dnd5e 5.3.3 comes before 6.0.6.
3. **Newer over older.** "Newer" follows the `versionOrder` policy: Foundry's order by default.

The solver tells the provider which versions are decided so far, so that a preference can depend on them. Packages are decided in the solver's order: one with no versions left first, to fail early; then the one with the fewest candidate versions left. Core and the world's system are decided **last**: they are chosen to suit the modules, so the modules' preferences must be known first. Deciding by fewest versions alone could choose the system before the module that prefers one of its versions. The real midi-qol showed this, choosing dnd5e 6.0.6 over the 5.3.3 it prefers. Only what is needed is chosen, so recommendations and unneeded dependencies are left out.

Preferences only order the candidates, so they do not change the algorithm. The same requirements, universe and policy always give the same setup.

## Resolving in rounds

The solver needs a release's manifest to know its relationships, but loading every manifest of every package up front would cost far more requests than a question needs (see [Request budget](sources.md#request-budget)). So the universe holds *listed* releases, whose manifests are not yet loaded, and resolution proceeds in rounds:

1. Solve over the universe as it is. A listed release has no relationships yet, and only the core bounds its listing gives, so the solver carries on without them.
2. Find what the answer depends on that is only listed:
   - for a setup, the listed releases in it;
   - for a failure, the listed releases whose constraints the explanation leans on;
   - for a failure that rests on there being no versions of something, also the most preferred listed release of every package with nothing loaded yet. A manifest can name packages the universe does not have yet. Before any manifest is loaded, for example, the universe may hold no system at all.

   Any other failure is final: its derivation uses no constraint that loading could change.
3. If there are none, the answer is final. Otherwise `resolve` returns `{ ok: false, needs }`: the caller loads the needed manifests into the universe, and solves again from the start.

`resolveInRounds(universe, requirements, load)` runs the rounds.
- **Loading:** `load` is a function the caller passes in, so the core still does no I/O.
- **The listing's bounds** stay with each loaded release, for the `listingCompatibility` policy.
- **A release `load` cannot load** is kept as listed and reported in `unloaded`, so that it is not asked for again.
- **Round limit:** after `maxRounds` (10 by default), the last, incomplete answer is returned.

Each round loads at least one new manifest, so the rounds end. The first round typically needs the newest acceptable release of every package; later rounds need only the few releases that conflicts lead the solver back to. In practice it settles in two or three rounds.

Each round is a pure function of its universe, so the core stays pure and synchronous: fetching happens between rounds, outside it. A solver that pauses to ask for a manifest and then resumes would avoid repeating work. But it would be harder to build and to test, and solving is cheap next to fetching. Start with rounds, and change only if rounds prove slow.

An answer from a round that still needed manifests is provisional, and is never shown as final. With a universe loaded in full (a saved universe, a mirror snapshot or a full cache), the first round is the last.

## Results

Every question returns plain data:

- **Setup**: the chosen releases, the verdict for each, and for each the constraints that put it there.
- **Explanation**: the derivation, as a tree of incompatibilities, each with its provenance. `explain` turns the tree into numbered sentences. The tree and the wording are kept apart, so pdt can translate the wording (paraglide) and other tools can render it as they please.

  For example, midi-qol 14.0.15 with only dnd5e 6.0.6 available, under `systemCompatibility: require`:

  > Because no version of midi-qol other than 14.0.15 is available and midi-qol 14.0.15 runs only in dnd5e 5.3.0 to 5.9.99, midi-qol needs a world with dnd5e 5.3.0 to 5.9.99.
  > So, because no system in dnd5e 5.3.0 to 5.9.99 is available and the requirements need midi-qol, the requirements cannot be met. (1)

  It follows pub's method for its error reports:
  - each step of the derivation is a sentence ("Because …, …", "And because …", "Thus, …");
  - a step that later steps refer back to is numbered, and referred to by its number;
  - a step used only once is folded into the sentence that uses it, where that reads better.

  The wording is an `ExplanationMessages` object, with English (`englishMessages`) by default. Every phrase is a function of the phrases inside it, so that a translation can order words as its language needs. Sets of versions are written as "5.3.0 to 5.9.99", "14.0.18 or later" or "1.0.0 up to but not including 2.0.0". A set open at both ends is written as what it leaves out: "other than 14.0.15".
- **Install plan**: from a setup, what to fetch, in dependency order, with download URLs, and what is already present at the right version.
- **Matrix**: cells of setups and explanations, with the axes they were resolved for.

## Locking

pdt will want a lockfile: what was installed, so that the next install gives the same result, and so a team shares one setup. The resolver supports locking without owning the file:
- the caller passes the locked versions back as pins, or as preferences when upgrading;
- a resolution can carry the universe it used, so it can be replayed offline.

Where the file lives and what it looks like is pdt's business (see {doc}`api`).
