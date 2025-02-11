.. _build-process:

Build Process
=============

Running the build is as simple as ``npm run build``. This will transpile the ``src`` into ``dist``, copy any assets (e.g. the internal default configuration), and fix up the `Short-form Paths`_.


Typescript configuration
------------------------




.. _shortform_paths:

Short-form Paths
~~~~~~~~~~~~~~~~

In ``tsconfig.json`` the entry ``"paths"`` (see `Paths <https://www.typescriptlang.org/tsconfig/#paths>`_) provides mappings from a shortened form to a longer form. Besides providing brevity these also account for arbitrary relative paths. So refering to ``@/constants`` will resolve to ``src/constants`` regardless of where the enclosing source file is in the ``src`` structure. This saves a lot of ''import constants from '../../../constants'`` along with having to maintain these relative paths if refactoring moves the file.

These ``paths`` are also used during testing (see :ref:)

Generally these are handled by ``tsc`` but when we want to run the transpiled ``.js`` files directly with ``node`` these paths cause a problem as they remain in their brief form. To avoid this, the :ref:`build-process` runs ``tsc-alias`` (see `tsc-alias <https://www.npmjs.com/package/tsc-alias>`_) to post-process the transpiled files in ``dist``, expanding the short forms into their corresponding long forms.

``ts-node`` is used to provide developers with a simple way to run Typescript without needing to explicitly rebuild all the time. ``ts-node`` does not handle these short-form import references natively. We use ``tsconfig-paths/register`` (see `tsconfig-paths <https://www.npmjs.com/package/tsconfig-paths>`_) to handle processing these paths before they are executed. Use ``npm run dev`` to run ``pdt`` from ``src`` during development.

