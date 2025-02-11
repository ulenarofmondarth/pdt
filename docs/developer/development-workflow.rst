Development Workflow
====================

Obviously you will have your own way of doing things. This section describes the workflow for which this project is configured.

Core Technology
---------------

This project uses:

- `Typescript <https://www.typescriptlang.org>`_
- `NodeJS <https://nodejs.org>`_ (`ts-node <https://typestrong.org/ts-node/docs/>`_ for smoother development workflow)
- `Jest <https://jestjs.io/>`_ (`ts-jest <https://www.npmjs.com/package/ts-jest>`_ is used to leverage ``ts-node`` during testing)
- `Docker <https://www.docker.com/>`_

The main tool for configuring the project is ``npm`` (installed with NodeJS).

Documentation (this documentation), is written in `ReStructuredText <https://docutils.sourceforge.io/rst.html>`_, processed using `Sphinx <https://www.sphinx-doc.org>`_.

Basic Development Cycle
-----------------------

.. important:: Before working on the code, create a new branch (``git switch my_new_branch``) to work on.

   This will ensure you don't run into problems later.

   .. todo:: Write section on code control.

.. mermaid::

   flowchart LR
      subgraph sg1 [Get Ready]
        direction TB
        c1{Contributing?}
        c1-- Yes -->id1[Fork the repo]
        c1-- No -->id2[clone]
        id1-->id2
        id2-->id3[prepare]
      end
      subgraph sg2 ["Develop (TDD)"]
        direction TB
        id4[add test]
        id4-->id5[write code]
        id8-->id9{test passing?}
        id5-->id8[test]
        id9--yes-->id6[refactor]
        id9--no -->id5
        id6-->id10[commit]
        id10-->id7[push]
        id7-->id4
      end
      sg1-->sg2

      click id1 href "/developer/contributing.html#contributing-to-pdt"
      click id4 href "/developer/tdd-primer.html#tdd-write-failing-test"
      click id6 href "/developer/tdd-primer.html#tdd-write-code"
      click id6 href "/developer/tdd-primer.html#tdd-refactor"

Use of Test Driven Development (TDD) is encouraged. So, first write a test to specify the change you are going to make. For a new feature this will typically be in a ``.spec.ts`` file. For a bug this will typically be in a ``.test.ts`` file alongside the code containing the bug.

.. tip:: Commit to your branch frequently (``git add <your code>`` and ``git commit -m 'My awesome edits'``). This provides a nice way to keep track of changes but more importantly gives you plenty a 'checkpoints' to roll-back to if you discover a problem with your current direction.

Write code for your changes.

Test using ``npm run test``.

.. tip:: If you stage you changes (using ``git add``) you can use ``npm run test:ci`` to limit the tests to those related to file in the staging index.

Repeat the write test/develop/test/refactor cycle until you have completed your change.

Commit the final changes to your repostory.

If you have installed ``act`` (see :ref:`developer recommended installs <recommended-developer-installs>`) you can use it to run the :term:`CI` chain locally. This helps identify any potential issues *before* you offer them into the official buildk

.. code-block::

   act 

If you have followed the :ref:`project-code-control` advice you will have a forked repository ready to prepare a :ref:`project-pull-request`.

If you just want to use this modification yourself you can install directly from this local copy or you can push the change to your own forked repository's ``main`` and a new ``npm`` package will be published.

.. todo:: Section on how ``npm`` packages are published, how to setup the project to use the correct account, etc.

