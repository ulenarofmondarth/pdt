.. _build-process:

Build Process
=============

Running the build is as simple as ``pnpm build``. This invokes :program:`vite` and it does all the heavy lifting.


Typescript configuration
------------------------

``tsconfig.json`` runs the compiler in ``strict`` mode with ``noUncheckedIndexedAccess``, ``exactOptionalPropertyTypes`` and ``noImplicitOverride`` enabled. It targets ``esnext`` with ``lib: ["esnext"]``; the ``dom`` library is deliberately left out because :program:`pdt` runs on Node, so accidental use of browser globals fails the type check.

The compiler never emits files (``noEmit``); :program:`vite` produces the build output.

``allowJs`` is still enabled for ``src/util/fudge_node_config.js`` and will be turned off once that file is replaced.


.. _typescript-compilers:

Compiler versions
~~~~~~~~~~~~~~~~~

Two TypeScript compilers are installed:

- **TypeScript 7** (the native compiler) is installed as ``typescript7`` and provides the :command:`tsc` binary.
- **TypeScript 6** is installed under the name ``typescript`` (an alias for ``@typescript/typescript6``) and provides the :command:`tsc6` binary. It is a fallback for tools that import the compiler's JavaScript API, which TypeScript 7 does not ship.

.. list-table::
   :header-rows: 1

   * - Stage
     - Compiler
   * - :command:`pnpm typecheck`, the pre-commit hook, the CI type check
     - TypeScript 7 (:command:`tsc`)
   * - :command:`pnpm typecheck:fallback` (CI only, keeps the fallback honest)
     - TypeScript 6 (:command:`tsc6`)
   * - ESLint (``typescript-eslint``), ``typedoc``, the paraglide plugin
     - TypeScript 6 (via ``import 'typescript'``)
   * - :command:`pnpm build` and :command:`pnpm test`
     - Neither; :program:`vite` and :program:`vitest` strip types with esbuild

.. todo:: Remove the TypeScript 6 fallback once ``typescript-eslint``, ``typedoc`` and paraglide support TypeScript 7 natively.


.. _shortform_paths:

Short-form Paths
~~~~~~~~~~~~~~~~

In ``tsconfig.json`` the entry ``"paths"`` (see `Paths <https://www.typescriptlang.org/tsconfig/#paths>`_) provides mappings from a shortened form to a longer form. Besides providing brevity these also account for arbitrary relative paths. So refering to ``@/constants`` will resolve to ``src/constants`` regardless of where the enclosing source file is in the ``src`` structure. This saves a lot of ''import constants from '../../../constants'`` along with having to maintain these relative paths if refactoring moves the file.

Paths defined in ``tsconfig.json`` are used by the typescript transpiler (and consequently any language server).

These ``paths`` are also used during testing (see :ref:`testing paths`)

Ths paths are repeated in ``vite.config.ts`` for use during the build.
