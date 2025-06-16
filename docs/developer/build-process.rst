.. _build-process:

Build Process
=============

Running the build is as simple as ``pnpm build``. This invokes :program:`vite` and it does all the heavy lifting.


Typescript configuration
------------------------



.. _shortform_paths:

Short-form Paths
~~~~~~~~~~~~~~~~

In ``tsconfig.json`` the entry ``"paths"`` (see `Paths <https://www.typescriptlang.org/tsconfig/#paths>`_) provides mappings from a shortened form to a longer form. Besides providing brevity these also account for arbitrary relative paths. So refering to ``@/constants`` will resolve to ``src/constants`` regardless of where the enclosing source file is in the ``src`` structure. This saves a lot of ''import constants from '../../../constants'`` along with having to maintain these relative paths if refactoring moves the file.

Paths defined in ``tsconfig.json`` are used by the typescript transpiler (and consequently any language server).

These ``paths`` are also used during testing (see :ref:`testing paths`)

Ths paths are repeated in ``vite.config.ts`` for use during the build.
