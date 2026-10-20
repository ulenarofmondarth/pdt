# fvtt-resolver

`@mondarth/fvtt-resolver` (`packages/fvtt-resolver`) works out which versions of Foundry VTT, game systems and modules can be used together. It reads what each package's manifest declares, and what a project declares on top of that. It then answers questions such as:

- Can this module run on Foundry VTT 14 with dnd5e 5.1?
- Which versions should be installed to try my module on the newest Foundry VTT, and why those?
- Why can't these packages be installed together?
- Across Foundry VTT generations and system versions, where does my module work?

`pdt vtt install` will be built on it. It is a package of its own, published to npm, so that other tools can use it too.

:::{note}
**Status: design, ready for the core to be built.** These pages were written before any of it was built. The decisions of two reviews are recorded in {doc}`questions`; what is still open concerns the sources and pdt's integration, not the core. Foundry VTT's behaviour is checked against the source of 14.368, and marked *verified against 14.368*; what could not be checked is listed as still to verify.
:::

## Reading order

1. {doc}`domain`: the things the resolver reasons about (packages, releases, versions, constraints, setups) and where each constraint comes from.
2. {doc}`resolution`: the questions it answers and how: one version-solving core, with explanations when there is no answer.
3. {doc}`sources`: where the data comes from. This lives outside the pure core, behind adapters.
4. {doc}`api`: a sketch of the TypeScript API, and how pdt would use it.
5. {doc}`questions`: the decisions made, Foundry VTT's behaviour as verified, and what is still open.
6. {doc}`package`: how the npm package is built, tested and released.

## Principles

- **Pure core.** The resolver takes plain data and returns plain data: no network, no files, no clock, no Foundry runtime. Given the same inputs it gives the same answer, it tests without mocks, and it runs anywhere, in Node, in a browser, or in CI.
- **Foundry's rules, not ours.** When Foundry VTT decides that a package is incompatible, the resolver must agree, and give the reason in Foundry's terms. Stricter or looser rules are policies the caller chooses, and they are named as such.
- **Every answer is explained.** Each constraint carries where it came from: which manifest, which project declaration, which policy. A result can always say why: why this version was chosen, or why nothing fits.
- **Declarations are layered, not merged away.** An author's manifest, a project's own declarations and the caller's policy stay distinct. Each can be shown, overridden or switched off on its own.

```{toctree}
:hidden:

domain
resolution
sources
api
questions
package
```
