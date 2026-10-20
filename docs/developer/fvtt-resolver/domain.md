# Domain model

This page describes what the resolver reasons about. The names here become the types of the API (see {doc}`api`).

## Overview

```{mermaid}
flowchart LR
  subgraph universe[Universe: everything known]
    core[Core releases<br/>13.346, 14.350, ...]
    pkg[Package releases<br/>dnd5e 5.1.0, my-module 2.0.0, ...]
  end
  decl[Declarations<br/>support matrix, overrides,<br/>pins, core limits]
  policy[Policy<br/>strict, lenient, ...]
  req[Requirements<br/>what the caller asks for]
  universe --> constraints[Constraints<br/>each with its provenance]
  decl --> constraints
  policy --> constraints
  constraints --> solver{{Solver}}
  req --> solver
  solver --> setup[Setup<br/>one release of each package]
  solver --> why[Explanation<br/>why nothing fits]
```

## Packages and releases

Package
: Something Foundry VTT installs: a **module**, a **system** or a **world**. A package is identified by its `type` and its `id` (`module:my-module`, `system:dnd5e`). In manifests a relationship's `type` defaults to `module`.

Release
: One version of a package, with what its manifest declares: its version, its compatibility with Foundry VTT, its relationships, and where to download it. The resolver never sees a package without a release; "dnd5e" on its own is a question, "dnd5e 5.1.0" is a fact.

Core
: Foundry VTT itself. The resolver treats it as one more package, `core`, whose releases are Foundry's builds (`13.346`, `14.350`). Compatibility with Foundry VTT then becomes an ordinary dependency on `core`, and the solver needs no special case for it. Each core release also carries its **channel** (stable, testing, development, prototype) and its **generation** (`14` for `14.350`).

World
: A world is where a system and modules come together: one system, any number of active modules. Worlds are packages too, and can be depended on (`type: world`), but pdt does not install them. The first version leaves worlds as dependencies out of scope (see {doc}`questions`). The idea of a world is still central, because it is the unit that has to be valid (see [Setups](#setups)).

## Versions

There are two kinds of version, and they compare differently.

### Core versions

A core version is `<generation>.<build>`: `14.350` is build 350 of generation 14. A compatibility bound may name a whole generation (`"14"`) or one build (`"14.350"`). Old manifests may give a number (`10`) instead of a string.

The resolver turns every bound into a precise range of core versions:

| Bound | Generation form (`"13"`) | Build form (`"13.346"`) |
| --- | --- | --- |
| `minimum` | from the first build of 13 | from 13.346 |
| `maximum` | up to the last build of 13 | up to 13.346 |
| `verified` | up to the last build of 13 | up to 13.346 |

So `maximum: "13"` admits every build of generation 13. A naive version comparison would get this wrong: it would treat `"13"` as older than `"13.346"`.

:::{admonition} Verified against 14.368
:class: note
- **`maximum` and `verified`:** when the bound is a whole number, Foundry compares only the generation.
- **`minimum`:** Foundry compares the full version. `"13"` is never newer than a 13.x build, so it admits them all.
- **Build-form bounds:** compared exactly.
- **Core version format:** `<generation>.<build>`.
- **Check order:**
  1. `minimum`: if the core is too old, the package requires a core upgrade.
  2. `maximum`: if the core is too new, it requires a downgrade.
  3. `verified`: decides between verified and unverified.

  A package with none of the three is "unknown", and still usable.
:::

These bounds apply only to core. Bounds on other packages compare differently (see [Ranges](#ranges)).

### Package versions

A package's `version` is free-form: the manifest schema allows a string or a number. Its examples include `"1.0.0"`, `"0.5.0-beta"`, `"9.361"`, `"2023-04-08"` and `"20220312"`. Most packages use something like SemVer, but not all, and not strictly.

By default, the resolver orders package versions **the way Foundry VTT does** (`foundry.utils.isNewerVersion`). Foundry decides what counts as an update, so "newest" has to mean the same in both. In 14.368 the rules are:

1. Two numbers (not strings) compare as numbers.
2. Otherwise both are split on `.`, and the parts compared left to right. Where both parts are numeric and differ, the larger number is newer. Otherwise, parts that differ compare as text.
3. When all shared parts are equal, the one with more parts is newer: `1.0.0` is newer than `1.0`.

These rules have consequences that SemVer does not share:

| Comparison | Foundry | SemVer |
| --- | --- | --- |
| `1.0.0-beta` against `1.0.0` | `1.0.0-beta` is newer (`"0-beta"` sorts after `"0"`) | `1.0.0` is newer |
| `1.0.0-rc1` against `1.0.0-beta1` | `rc1` is newer (text) | `rc1` is newer |
| `1.0.0` against `1.0` | `1.0.0` is newer | not valid SemVer |
| `v2` against `v10` | `v2` is newer (text) | not valid SemVer |
| `1.10.0` against `1.9.0` | `1.10.0` is newer | `1.10.0` is newer |

The first row is why the `prereleases` policy excludes pre-releases by default: under Foundry's order, a beta would otherwise win over its own release.

### A consistent order

Foundry's comparison is not a consistent order. Numeric parts compare as numbers, but a part that mixes digits and text compares as text. So `10a` is newer than `10` (text), `10` than `9` (numbers), and `9` than `10a` (text): a cycle. Checking a version against a bound is still well defined, since it is one comparison. But "newest" needs an order that sorts the same way every time.

So the resolver orders versions by a **`VersionOrder`**: a total order, with a way to read a version or a bound. There are two:

`foundry`
: The default. It compares part by part as Foundry does, but reads a part that starts with digits as that number followed by the rest (`10a` is 10, then `a`). It agrees with Foundry wherever the first parts that differ are both numbers, or are not both numbers and do not both start with a digit, which covers the versions packages use. Where it differs, as for `10a` against `9`, the pairs are reported as warnings (`foundryDisagreements`), so that a user knows where "newest" may not be what Foundry would pick.

`semver`
: SemVer 2.0.0 precedence, selected by the `versionOrder` policy. It reads SemVer versions, and a short bound such as `"4"` or `"4.1"` as `4.0.0` or `4.1.0`. Ordering some of a package's versions one way and the rest another would make cycles again. So `semver` applies to a package only when it can read every version and bound given on it. Otherwise the package falls back to `foundry`, and the versions it could not read are reported.

Core versions use the `foundry` order too. Their parts are all numbers, where it is exactly Foundry's. What is special about core is how bounds are read (the generation rule, [above](#core-versions)), and that belongs to building ranges, not to the order.

The solver works only with ranges, so it does not care which order a package uses.

## Ranges

A **range** is a set of versions of one package. The manifest's `minimum` and `maximum` give a closed interval. The solver also needs unions and complements: "anything but 2.x" from a conflict, or "1.x or 3.x" after learning. So a range is a **union of intervals**, each with inclusive or exclusive bounds. Over a known, finite list of releases, a range can also be read as the set of releases it admits, which is what the solver finally works with.

`verified` is not a bound. It is a **soft upper limit**: beyond it a release is *unverified*, which Foundry VTT reports but allows. Policy decides what the resolver does with it (see [Policy](#policy)).

The bounds in a **relationship** (a `requires` or `systems` entry's `compatibility`) are read differently from core bounds. Foundry compares them exactly, with no generation form:
- `maximum: "4"` on dnd5e admits `4` but not `4.0.1` or `4.1.0`;
- a relationship's `verified` is not read at all.

The resolver follows Foundry by default. The `relationshipBounds` policy can read a short bound as a prefix instead (see {doc}`questions`, decision 10).

## Constraints

Everything the resolver must respect is a **hard constraint** of one of four shapes:

| Shape | Meaning | Example |
| --- | --- | --- |
| **Dependency** | If release *R* is used, package *P* must be used, at a version in range *X* | my-module 2.0.0 needs `core` 13 to 14 |
| **Exclusion** | Release *R* and package *P* at a version in range *X* must not both be used | my-module 2.0.0 conflicts with other-module below 3.0 |
| **Choice** | If release *R* is used, the world's system must be one of these (each with its range) | my-module 2.0.0 runs only in dnd5e 4 to 5, or pf2e 7 |
| **Unusable** | Release *R* cannot be used at all | my-module 2.0.0 declares no core compatibility, under `missingCompatibility: reject` |

Policy can soften what a manifest declares, so there are also **soft constraints**, which decide which valid setup is best and what is reported, but never whether a setup is valid:

| Shape | Meaning | Example |
| --- | --- | --- |
| **Preference** | If *R* and *P* are both used, a version of *P* in range *X* is better | my-module 2.0.0 is verified on core 13 (`verified: prefer`) |
| **Advisory** | Reported, not enforced | my-module 2.0.0 recommends helper-module; or conflicts with other-module, under `conflicts: warn` |

Each constraint carries its **provenance**: the manifest it came from, the field that declared it (such as `relationships.requires[0]`), and the policy setting that shaped it, if any. Project declarations will add their own provenance. Explanations are built from provenance.

`releaseConstraints` builds a release's constraints under a policy, given the order of each package's versions (`chooseOrders`). Since a package is ordered one way throughout, its order is chosen from all its versions in the universe and every bound placed on it.

### From a manifest

| Manifest field | Constraint |
| --- | --- |
| `compatibility.minimum` / `maximum` | Dependency on `core`, with the range from both bounds |
| `compatibility.verified` | No constraint. Marks later core releases as unverified for this release; policy may turn it into a bound |
| `relationships.requires[]` of type `module` | Dependency on the module, with the range from the entry's `compatibility` (any version if it has none) |
| `relationships.requires[]` of another type | No constraint, as in Foundry, which skips them. Reported as a warning |
| `relationships.systems[]` | One choice over all the entries: the world's system must be one of them. The id is hard. Each entry's range is soft, like `verified` (the `systemCompatibility` policy). No entries means any system |
| `relationships.conflicts[]` | Exclusion of the entry's `type:id`, in the range from its `compatibility` (every version if it has none) |
| `relationships.recommends[]` | No constraint. Reported, and installed only when the caller asks for recommendations |

A world's `requires`, and its system's, apply to the world as a whole: when a world is checked, Foundry checks both lists.

:::{admonition} Verified against 14.368
:class: note
- **`conflicts` and `recommends`:** declared in the manifest schema, and read by nothing else. Foundry does not enforce conflicts. The resolver honours them by default, because an author declared them for a reason; policy can turn them into warnings.
- **`requires`:** Foundry tests only entries of type `module`.
- **`systems`:** Foundry offers a module only in worlds of a listed system. A system outside an entry's range gives `UNVERIFIED_SYSTEM`, which is still usable.
:::

### Normalising manifests

Real manifests are untidy:
- Numbers appear where strings are expected.
- A `compatibility` block is missing, or has only `verified`.
- Fields don't match the schema. For example, a premium module in the index gives a systems entry's `compatibility` as an array.
- Old releases use pre-v10 fields. v14 still maps these to their replacements:
  - `name` → `id`;
  - `author` → `authors`;
  - `minimumCoreVersion` / `compatibleCoreVersion` / `maximumCoreVersion` → `compatibility.minimum` / `verified` / `maximum`;
  - `systems` (a list of ids) → `relationships.systems`.

  It ignores `dependencies`. The resolver maps that to `requires` with a warning, because releases that use it were written for cores that read it.

A separate **normalisation** step turns any manifest into a `Release`. It records a warning for anything it had to interpret, and refuses only what cannot be understood. The solver then sees one clean shape. Old releases matter: "which version of this module works on core 12?" is often answered by a release from years ago.

## Declarations beyond the manifest

Some declarations come from outside the package manifests, from the project or the tool using the resolver. There are four kinds, all optional.

Support matrix
: What the project claims to support, such as "my module supports dnd5e 4 and 5 on core 13 and 14". It is not a constraint on resolution. It is a **list of setups to check**: each cell is resolved, and a cell that has no solution, or contradicts the module's own manifest, is reported. This is how a project finds out that its claims have drifted from its manifest, or from its dependencies' manifests.

Overrides
: Corrections to what authors declared, each with a reason: "other-module 3.2.0 is broken on core 14 whatever its manifest says" (an extra exclusion), or "ignore the `maximum` of old-module 1.4.0; it works on 14" (a relaxed bound). They become constraints with project provenance, so every explanation that leans on one says so.

Pins
: Fixed versions: "use dnd5e 5.1.0". A pin is a requirement on a single version, and is also how a lockfile is replayed (see {doc}`resolution`).

Core limits
: The core builds the caller can actually run, each excluded build with a reason. pdt runs Foundry in a felddy/foundryvtt container, and not every build has an image: 14.362 has release notes but no image. So pdt limits core to the builds with an image, and an explanation can say "core 14.362 is excluded: there is no felddy/foundryvtt image for it". The resolver knows nothing of Docker; the limit is a list and a reason.

(policy)=

## Policy

Policy is the caller's choice of rules where reasonable tools could differ. Each policy is a named setting with a default:

| Setting | Default | Alternatives |
| --- | --- | --- |
| `verified` | **prefer**: choose verified releases when there is a choice, and report unverified ones | `require` (treat `verified` as a hard maximum), `ignore` |
| `conflicts` | **enforce** | `warn` |
| `coreChannels` | **stable** only | add `testing`, `development`, `prototype` |
| `prereleases` | **exclude** package versions that look like pre-releases, unless pinned | `include` |
| `recommends` | **report** | `install` |
| `missingCompatibility` | **any**: a release with no core bounds works with every core, as in Foundry | `reject` |
| `systemCompatibility` | **prefer**: as `verified`, for the version ranges in `relationships.systems` | `require`, `ignore` |
| `relationshipBounds` | **foundry**: relationship bounds compare exactly | `prefix`: `"4"` means every `4.x` |
| `versionOrder` | **foundry**: package versions ordered as `isNewerVersion` | `semver` |
| `listingCompatibility` | **prefer**: a version's `minimum` and `verified` from Foundry's listing win over its manifest's | `ignore` |

The last four were added after the first review. Their defaults were decided in the second (decisions 9, 10, 11 and 13 in {doc}`questions`).

## Setups

A **setup** is what the resolver produces and checks: one core release, one system release and a set of module releases, as one world would use them. A setup is **valid** when every constraint of every release in it holds. The resolver gives each release in a setup a **verdict**, in Foundry VTT's own terms, so that a user sees the same reason in pdt as in Foundry's setup screen.

Verdicts are Foundry's `CONST.PACKAGE_AVAILABILITY_CODES` (as in 14.368). Foundry treats a code above 4 as unusable:

| Code | Name | Usable | Resolver's reading |
| --- | --- | --- | --- |
| 0 | `UNKNOWN` | yes | No core bounds declared |
| 1 | `VERIFIED` | yes | Within `verified` |
| 2 | `UNVERIFIED_BUILD` | yes | Beyond `verified`, same generation |
| 3 | `UNVERIFIED_SYSTEM` | yes | The system is outside a `systems` entry's range |
| 4 | `UNVERIFIED_GENERATION` | yes | Beyond `verified`, a later generation |
| 5 | `MISSING_SYSTEM` | no | A world's system is not in the setup |
| 6 | `MISSING_DEPENDENCY` | no | A required module is absent, or outside the required range |
| 7 | `REQUIRES_CORE_DOWNGRADE` | no | Above `maximum` |
| 8 | `REQUIRES_CORE_UPGRADE_STABLE` | no | Below `minimum`; a stable core meets it |
| 9 | `REQUIRES_CORE_UPGRADE_UNSTABLE` | no | Below `minimum`; only an unstable core meets it |
| 10 | `REQUIRES_CORE_UPGRADE_UNKNOWN` | no | Below `minimum`; no known core meets it |
| 11 | `REQUIRES_DEPENDENCY_UPDATE` | no | A required module does not suit this core |

Where the resolver is stricter than Foundry, a verdict carries a second, resolver-only finding. Examples: a conflict, or a dependency's dependency that does not fit. See {doc}`questions`, decision 12.

`check` gives each release in a setup both parts:
- **Foundry's code,** found by Foundry's rules in Foundry's order:
  1. the core bounds;
  2. then `MISSING_DEPENDENCY`, when a required module is absent, outside the required range, or unusable on this core;
  3. then, for a module, `UNVERIFIED_SYSTEM`, when the setup's system is not one it lists, or is outside the listed range.

  Foundry checks the system last, so that code replaces a missing dependency, as it does in Foundry.
- **The resolver's findings:**
  - the hard constraints the setup breaks;
  - the preferences it misses;
  - the advisories that apply.

  A setup is valid when it breaks no hard constraint.

Two details differ from Foundry:
- **A dependency's own verdict.** Foundry judges a dependency by its verdict after that dependency's own dependencies are tested, which depends on the order it loads packages in. `check` judges it by its verdict from its core bounds, so the answer does not depend on order.
- **World codes.** `MISSING_SYSTEM` and `REQUIRES_DEPENDENCY_UPDATE` describe a world, and need a world manifest, so `check` does not give them.

## The universe

The **universe** is every release the resolver may choose from: for each package involved, its known releases, and the known core releases. It is plain data, assembled beforehand from the sources (see {doc}`sources`), and the solver never looks beyond it. That makes a resolution reproducible: the same universe, requirements, declarations and policy always give the same answer. A universe can be saved with its result, which makes a lockfile or a bug report replayable offline.
