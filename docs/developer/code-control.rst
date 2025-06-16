.. _project-code-control:

Project Code Management
=======================


Commiting
---------

`Husky`_ is used to integrate `Commitizen`_ with ``git`` to ensure consitent ``commit`` messages are used. This in turn allows us to use Commitizen to produce accurate release notices as part of the :ref:`GitHub Workflows`.

Husky
~~~~~

Husky manages git hook scripts. These are put into place when ``pnpm run prepare`` is executed as part of the ``pnpm install`` (see :ref:`Setup Prerequisites <setup prerequisites>`).

Commitizen
~~~~~~~~~~

As part of the :ref:`build-process` the (`commitizen-tools/commitizen-action <https://github.com/commitizen-tools/commitizen-action>`_) is run. This will 'bump' the version of the project, updating entries in files identified in ``.czrc`` under ``version_files``.


.. _project-pull-request:

Project Pull Request
--------------------

.. todo:: Add advice on pull requests
