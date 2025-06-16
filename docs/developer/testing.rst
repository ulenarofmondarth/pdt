Testing
=======

``PDT`` uses `vitest <https://vitest.dev>`_ as its testing framework.

To run all defined tests and then watch for file changes use ``pnpm vitest``.


Layout of Tests
---------------

Generally, low-level tests are in ``.spec.ts`` files that sit alongside the code that they specify/test.

Higher  level tests are under ``src/tests``. These are organised by feature. These tests rely on adaptors (under ``tests/adapters``). These adapters bind the tests to implementation.

The ``adaptors`` should be grouped by implementation, then by feature.

