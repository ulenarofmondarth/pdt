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
