Testing
=======

``PDT`` uses `vitest <https://vitest.dev>`_ as its testing framework.

To run all defined tests and then watch for file changes use ``pnpm vitest``. To run them once use ``pnpm test``.

Type checking is separate from the test run; use ``pnpm typecheck`` (see :ref:`typescript-compilers`).


Coverage
--------

``pnpm test:coverage`` runs the tests once and measures coverage with the ``v8`` provider. It prints a summary and writes an HTML report to ``coverage/index.html`` (plus ``lcov`` output for tooling).

Coverage is measured over ``src/**/*.ts``, excluding the generated ``src/paraglide`` modules, ``src/tests``, spec files and type declarations.

The run fails if coverage drops below the thresholds in ``vite.config.ts`` (``test.coverage.thresholds``). The thresholds sit just below the level measured when coverage was introduced. Raise them as tests are added; never lower them to get a change through.


Layout of Tests
---------------

Generally, low-level tests are in ``.spec.ts`` files that sit alongside the code that they specify/test.

Higher  level tests are under ``src/tests``. These are organised by feature. These tests rely on adaptors (under ``tests/adapters``). These adapters bind the tests to implementation.

The ``adaptors`` should be grouped by implementation, then by feature.

