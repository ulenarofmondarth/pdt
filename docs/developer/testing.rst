Testing
=======

``PDT`` uses `JestJS <https://jestjs.io>`_ as its testing framework.

To run all defined tests use ``npm run test``.


Layout of Tests
---------------

Generally, low-level tests are in ``.spec.ts`` files that sit alongside the code that they specify/test.

Higher  level tests are under ``src/tests``. These are organised by feature. These tests rely on adaptors (under ``tests/adapters``). These adapters bind the tests to implementation.

The ``adaptors`` should be grouped by implementation, then by feature.


Paths
-----

To allow Jest to access the path mappings from ``tsconfig.json`` the `paths mapping <https://kulshekhar.github.io/ts-jest/docs/getting-started/paths-mapping/>`_ setup is used.

Globals
-------

To get the ``jest.config.ts`` ``globals`` option to work (and correct typing in |LSP|) I needed to explicitly declare the global. Hence:

.. code-block:: typescript
   :caption: globals.d.ts

    declare global {
      let __TEST_DATA__: string;
    }

