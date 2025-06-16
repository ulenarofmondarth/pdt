Setting up a PDT development environment
========================================

This section covers briefly how to get started developing the PDT itself.

.. autofunction:: createServer

PDT is a ``nodejs`` tool.

.. _setup prerequisites:

Prerequisites
-------------

On you host machine install:

1. ``git``

   You can get ``git``, along with installation instuctions and documentation, from https://git-scm.com/ or install using a package manager.

2. ``nodejs``

   Nodejs can be obtained, along with installation instuctions and documentation, from https://nodejs.org/en/download/.

   .. note:: PDT currently used NodeJS v22.8.0


Nodejs will also install :program:`npm` the Node package manager, which we use next to set up the development environment. However, the alternative package manager `pnpm <https://pnpm.io>`_ is more efficient, so this project uses :program:`pnpm`. To install :program:`pnpm` refer to `pnpm installation <https://pnpm.io/installation>`_.

Once :program:`pnpm` is installed the main project can be installed.


.. highlight:: shell

.. code-block::

  git clone https://github.com/ulenarofmondarth/pdt.git
  cd pdt
  pnpm install

Your environment is now ready (See :ref:`Contributing to PDT`).

.. _recommended-developer-installs:

Optional (but recommended)
--------------------------

.. rubric:: Install ``docker``

Docker is used to provide several tools (including the generation of these documents)

Docker can be obtained for most host OS from https://www.docker.com/.

.. rubric:: Install ``act``

Act is a tool for running GitHub workflows locally. Useful for testing, running full continuous integration (CI) tests locally, etc.

Act also requires Docker.

Act can be obtained from https://github.com/nektos/act.
