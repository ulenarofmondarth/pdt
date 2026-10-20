# Manifest fixtures

Real package manifests, cut down to the fields the resolver reads. They were downloaded on 20 October 2026.

| File                           | Source                                                                                                 | Licence | Shows                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `dnd5e-6.0.6.system.json`      | [dnd5e release 6.0.6](https://github.com/foundryvtt/dnd5e/releases/download/release-6.0.6/system.json) | MIT     | A current system manifest                                                                                        |
| `dnd5e-0.9.8.system.json`      | [dnd5e release 0.9.8](https://github.com/foundryvtt/dnd5e/releases/download/release-0.9.8/system.json) | MIT     | Pre-v10 fields (`name`, `minimumCoreVersion`, `compatibleCoreVersion`), and a version given as the number `0.98` |
| `times-up-0.8.28.module.json`  | [times-up 0.8.28](https://gitlab.com/tposney/times-up/raw/master/package/module0828.json)              | MIT     | Pre-v10 `dependencies`                                                                                           |
| `midi-qol-14.0.15.module.json` | [midi-qol 14.0.15](https://gitlab.com/tposney/midi-qol/-/releases/v14.0.15/downloads/module.json)      | MIT     | Current `relationships`: `systems` with a version range, and `requires` with and without one                     |

`example-premium-1.0.1.module.json` is made up. Its shape copies a premium module's manifest from Foundry VTT's package index: a `protected` package whose `systems` entry gives `compatibility` as an array, which Foundry's schema does not allow. Its names are invented, so that no commercial package's data is kept here.
