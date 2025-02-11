.. github::

GitHub Setup
============

This project is hosted at https://github.com/ulenarofmondarth/pdt. It is licensed under the `MIT License <https://opensource.org/license/mit>`_ which allows you to pretty much do as you like with this code.

.. tip:: I recommend you create a fork of this repository if you intend to modify the source code.

.. _GitHub Workflows:

Workflows
---------

There are two main scenarios for automated workflows. Both start with a user commiting to ``main``.

.. rubric:: Initial responses

Two workflows may respond immediately:

.. _bump-version:

1. ``bump-version``

   This will check if the pushed commits require an update to the project's version. If they do, then various 'version' entries in configuration files are updated, the project is then committed back with these updated files and tagged with a new version tag (this triggers the other scenario :ref:`below <build-on-push>`).

2. ``build-and-deploy-docs``

   If only files under ``docs/`` are affected by the commits in this push, the documentation is rebuilt and deployed.

   This scenarion assumes that any documentation only changes remain relevant to the current version of the application.


.. rubric:: Follow-up responses

If a version bump (:ref:`bump-version <bump-version>`) was executed then another ``push`` will occur. This push will be associated with a tag for the new release and this triggers:

.. _build-on-push:

- ``build-on-push``

   If the push it tagged (and affects files outside ``docs/``---it should if it were bumped), this builds the application and publishes it to ``npmjs``. It also builds and deploys the documentation.
