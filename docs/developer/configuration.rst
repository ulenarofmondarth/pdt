Configuration
=============

The ``@util/config.ts`` modules uses `node-config <https://www.npmjs.com/package/config>`_ to provide the configuration for |pdt|.

Runtime Configuration
~~~~~~~~~~~~~~~~~~~~~

In addition to user supplied configuration |pdt| also uses a runtime configuraton. This is, by default, held in the ``.pdt`` directory in the root of each project using |pdt|. A 'global' runtime configuration is maintained in the application data directory. This global data coorinates things like port assignments across all projects.
