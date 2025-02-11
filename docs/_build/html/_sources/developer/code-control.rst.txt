.. _project-code-control:

Project Code Management
=======================



Commiting
---------

`Husky`_ is used to integrate `Commitizen`_ with ``git`` to ensure consitent ``commit`` messages are used. This in turn allows us to use Commitizen to produce accurate release notices as part of the :ref:`GitHub Workflows`.

Husky
~~~~~

Husky manages git hook scripts. These are put into place when ``npm run prepare`` is executed (see :ref:`Setup Prerequisites <setup prerequisites>`).

Commitizen
~~~~~~~~~~

As part of the :ref:`build-process` the ([commitizen-tools/commitizen-action](https://github.com/commitizen-tools/commitizen-action)) is run. This will 'bump' the version of the project (acccording to rules prescribed in ), updating entries in files identiried in ``.czrc`` under ``version_files``.


.. _project-pull-request:

Project Pull Request
--------------------

.. todo:: Add advice on pull requests
