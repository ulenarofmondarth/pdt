# @mondarth/fvtt-resolver

Works out which versions of [Foundry VTT](https://foundryvtt.com), game systems and modules can be installed together, from what their manifests declare.

> **Not ready for use.** The API is being built, following its [design](https://github.com/ulenarofmondarth/pdt/tree/main/docs/developer/fvtt-resolver). So far it orders versions, builds ranges of them, reads package manifests, turns releases into constraints under a policy, and resolves them into the best setup of core, system and modules, or explains why there is none. Releases before 1.0.0 may change anything.

It is developed alongside [pdt](https://github.com/ulenarofmondarth/pdt), the Foundry VTT package developer toolkit, which uses it to install the systems and modules a package needs.

## Licence

MIT

## AI Disclosure

This package is developed with AI assistance (Claude Code). All changes are reviewed by a human before they are merged.
