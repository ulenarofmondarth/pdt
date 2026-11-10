## [@mondarth/fvtt-resolver-v0.11.3](https://github.com/ulenarofmondarth/pdt/compare/@mondarth/fvtt-resolver-v0.11.2...@mondarth/fvtt-resolver-v0.11.3) (2026-11-10)

### Performance Improvements

* **fvtt-resolver:** work out once what orders a package's versions ([3eac188](https://github.com/ulenarofmondarth/pdt/commit/3eac188b26dac2d61ced30a34b8793edf051fcf1))

## [@mondarth/fvtt-resolver-v0.11.2](https://github.com/ulenarofmondarth/pdt/compare/@mondarth/fvtt-resolver-v0.11.1...@mondarth/fvtt-resolver-v0.11.2) (2026-11-10)

### Performance Improvements

* **fvtt-resolver:** parse each version once to order it ([ae3d6d1](https://github.com/ulenarofmondarth/pdt/commit/ae3d6d17e0c1ade72cf0daf1df5f6e36438d9bb3))

## [@mondarth/fvtt-resolver-v0.11.1](https://github.com/ulenarofmondarth/pdt/compare/@mondarth/fvtt-resolver-v0.11.0...@mondarth/fvtt-resolver-v0.11.1) (2026-11-10)

### Performance Improvements

* **fvtt-resolver:** work out a resolution's warnings only when read ([33ab1b3](https://github.com/ulenarofmondarth/pdt/commit/33ab1b3a7f72c4badcecc9c6b8ce3507b28f205e))

## [@mondarth/fvtt-resolver-v0.11.0](https://github.com/ulenarofmondarth/pdt/compare/@mondarth/fvtt-resolver-v0.10.2...@mondarth/fvtt-resolver-v0.11.0) (2026-11-07)

### Features

* **fvtt-resolver:** drop the catalogue's version 1 API ([473a150](https://github.com/ulenarofmondarth/pdt/commit/473a150c2598cf1cc5da40cf9f9f9922ad3ecc30))

## [@mondarth/fvtt-resolver-v0.10.2](https://github.com/ulenarofmondarth/pdt/compare/@mondarth/fvtt-resolver-v0.10.1...@mondarth/fvtt-resolver-v0.10.2) (2026-11-06)

### Bug Fixes

* **resolver:** take 1.2 as 1.2.0, and IDs in any case, when loading ([9aed80e](https://github.com/ulenarofmondarth/pdt/commit/9aed80e4bdb1e712386196ca95972df08d52e2cd))

## [@mondarth/fvtt-resolver-v0.10.1](https://github.com/ulenarofmondarth/pdt/compare/@mondarth/fvtt-resolver-v0.10.0...@mondarth/fvtt-resolver-v0.10.1) (2026-11-06)

### Bug Fixes

* **resolver:** take no other package's tags from a repository of several ([936c3c6](https://github.com/ulenarofmondarth/pdt/commit/936c3c6ba07678037abec78ce222f79dbca90753))

## [@mondarth/fvtt-resolver-v0.10.0](https://github.com/ulenarofmondarth/pdt/compare/@mondarth/fvtt-resolver-v0.9.1...@mondarth/fvtt-resolver-v0.10.0) (2026-11-05)

### Features

* **resolver:** ask the catalogue's version 2, and the catalogue alone ([eb72f8a](https://github.com/ulenarofmondarth/pdt/commit/eb72f8a6cf78974373ed09b8e9ce7b10552b0cb9))

### Bug Fixes

* **resolver:** give a catalogue universe as of no time if any part is ([187cc51](https://github.com/ulenarofmondarth/pdt/commit/187cc517508f9ef7dcce095f6e6f3485028d108d))

## [@mondarth/fvtt-resolver-v0.9.1](https://github.com/ulenarofmondarth/pdt/compare/@mondarth/fvtt-resolver-v0.9.0...@mondarth/fvtt-resolver-v0.9.1) (2026-11-02)

### Bug Fixes

* **resolver:** read a tag's version after a name with digits in it ([2b674c3](https://github.com/ulenarofmondarth/pdt/commit/2b674c337d234c20b2cb36eeda65d48b18a1fbe4))

## [@mondarth/fvtt-resolver-v0.9.0](https://github.com/ulenarofmondarth/pdt/compare/@mondarth/fvtt-resolver-v0.8.0...@mondarth/fvtt-resolver-v0.9.0) (2026-11-01)

### Features

* **resolver:** require a manifest of its own to choose a release ([93462ab](https://github.com/ulenarofmondarth/pdt/commit/93462abb14d0d9dcd9804ab847f52955241a0731))

### Bug Fixes

* **resolver:** count a manifest named for its version as naming it ([acddbb5](https://github.com/ulenarofmondarth/pdt/commit/acddbb5267850085454d40d4981e7aa2ef6f319a))

## [@mondarth/fvtt-resolver-v0.8.0](https://github.com/ulenarofmondarth/pdt/compare/@mondarth/fvtt-resolver-v0.7.0...@mondarth/fvtt-resolver-v0.8.0) (2026-10-27)

### Features

* **resolver:** give the packages the catalogue says cannot be had ([751ae98](https://github.com/ulenarofmondarth/pdt/commit/751ae98882762760aff836d414264b5270bb60af))

### Bug Fixes

* **resolver:** work out the order warnings only when they are read ([b6b67ec](https://github.com/ulenarofmondarth/pdt/commit/b6b67ec9d16960920619c24e679571b230725176))

## [@mondarth/fvtt-resolver-v0.7.0](https://github.com/ulenarofmondarth/pdt/compare/@mondarth/fvtt-resolver-v0.6.0...@mondarth/fvtt-resolver-v0.7.0) (2026-10-26)

### Features

* **resolver:** ask the package catalogue first for a universe ([f14eecb](https://github.com/ulenarofmondarth/pdt/commit/f14eecbc63995ecdb157919db92782ab77aad26f))

## [@mondarth/fvtt-resolver-v0.6.0](https://github.com/ulenarofmondarth/pdt/compare/@mondarth/fvtt-resolver-v0.5.0...@mondarth/fvtt-resolver-v0.6.0) (2026-10-21)

### Features

* **resolver:** give each release a manifest URL for its version ([f5ac7d2](https://github.com/ulenarofmondarth/pdt/commit/f5ac7d29eecb78a243c56b5bcd5d784d474ea6bc))
* **resolver:** read a release's manifest from its zip as a last resort ([86760f0](https://github.com/ulenarofmondarth/pdt/commit/86760f00126197775da89c5160aaabf32ee73d5e))

### Bug Fixes

* **resolver:** match versions with or without a leading v ([591a747](https://github.com/ulenarofmondarth/pdt/commit/591a7472709e04da8c94a3239421b6a0042b8f36))

## [@mondarth/fvtt-resolver-v0.5.0](https://github.com/ulenarofmondarth/pdt/compare/@mondarth/fvtt-resolver-v0.4.0...@mondarth/fvtt-resolver-v0.5.0) (2026-10-21)

### Features

* **resolver:** take listed releases' missing bounds from manifests ([defab08](https://github.com/ulenarofmondarth/pdt/commit/defab08d7104372c0f2f39b83d44bcbd47b7966f))

### Bug Fixes

* **resolver:** load GitLab manifests from each link's own URL ([ae8b716](https://github.com/ulenarofmondarth/pdt/commit/ae8b7161fb33d03930dad5e97cdaa90bd8ec59ee))

## [@mondarth/fvtt-resolver-v0.4.0](https://github.com/ulenarofmondarth/pdt/compare/@mondarth/fvtt-resolver-v0.3.0...@mondarth/fvtt-resolver-v0.4.0) (2026-10-21)

### Features

* **resolver:** apply overrides and core limits ([f6ac7ea](https://github.com/ulenarofmondarth/pdt/commit/f6ac7eab78c662873d6a2a56fd20f5b476d826bb))
* **resolver:** fetch through a CORS proxy, and document browser use ([b10f523](https://github.com/ulenarofmondarth/pdt/commit/b10f523fb57e63e8404ae8caaa99c1a96ce80a36))
* **resolver:** read core releases from Foundry's release notes ([99fe7d8](https://github.com/ulenarofmondarth/pdt/commit/99fe7d81008265fc6b805c5390b6453a4e397ea0))

### Bug Fixes

* **resolver:** report releases whose manifest could not be loaded ([00f8ae7](https://github.com/ulenarofmondarth/pdt/commit/00f8ae75561f8bc2eff994849e071d3f9b24642f))

## [@mondarth/fvtt-resolver-v0.3.0](https://github.com/ulenarofmondarth/pdt/compare/@mondarth/fvtt-resolver-v0.2.0...@mondarth/fvtt-resolver-v0.3.0) (2026-10-21)

### Features

* **resolver:** build a universe from Foundry's package index ([6882990](https://github.com/ulenarofmondarth/pdt/commit/6882990f10f9f9a8020ec6199ba508a2413aa4ee))
* **resolver:** list releases from GitHub, GitLab, manifests and disk ([64f9c95](https://github.com/ulenarofmondarth/pdt/commit/64f9c9506d83bd6778f9c5e35f95e91b9ef1c5d4))
* **resolver:** resolve in rounds over listed releases ([dac221e](https://github.com/ulenarofmondarth/pdt/commit/dac221e652fda423d75f168d95bd84bd26a46225))

### Bug Fixes

* **resolver:** decide core and the system after the modules ([a33308b](https://github.com/ulenarofmondarth/pdt/commit/a33308b5118f528bcaa33c8994dc6d694ba1f720))

## [@mondarth/fvtt-resolver-v0.2.0](https://github.com/ulenarofmondarth/pdt/compare/@mondarth/fvtt-resolver-v0.1.0...@mondarth/fvtt-resolver-v0.2.0) (2026-10-20)

### Features

* **resolver:** add a PubGrub version solver ([5782517](https://github.com/ulenarofmondarth/pdt/commit/578251728f09239abcb882de37de75f75045c711))
* **resolver:** build constraints from releases under a policy ([5a65c2e](https://github.com/ulenarofmondarth/pdt/commit/5a65c2e945bc8d7e587e76df68eca6463d00f56f))
* **resolver:** check a setup, with Foundry's verdicts ([93ee615](https://github.com/ulenarofmondarth/pdt/commit/93ee6157ae09b40d83ceccd72a63778d1c9a7ba7))
* **resolver:** explain in words why there is no setup ([fc3d60c](https://github.com/ulenarofmondarth/pdt/commit/fc3d60cbfdebd52625f389bd929d4bc19afed48f))
* **resolver:** read package manifests into releases ([6f7626b](https://github.com/ulenarofmondarth/pdt/commit/6f7626bb1dcd5b246ec46f40703f6adf7adf9c18))
* **resolver:** resolve requirements into the best setup ([89c87bb](https://github.com/ulenarofmondarth/pdt/commit/89c87bb3a95e348870a7d728b62d79b67fe511b9))

### Bug Fixes

* **resolver:** report an id or type that is not text without throwing ([37e878b](https://github.com/ulenarofmondarth/pdt/commit/37e878b988c54708b0cea9afb404705390ccca5a))

## [@mondarth/fvtt-resolver-v0.1.0](https://github.com/ulenarofmondarth/pdt/compare/@mondarth/fvtt-resolver-v0.0.0...@mondarth/fvtt-resolver-v0.1.0) (2026-10-20)

### Features

* **resolver:** order versions and build ranges of them ([1662af8](https://github.com/ulenarofmondarth/pdt/commit/1662af8aab2cdf81b38d1188cb47e967201f4690))
