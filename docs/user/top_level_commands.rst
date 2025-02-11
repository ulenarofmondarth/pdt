.. _pdt_tlc:

Top Level Commands
==================


.. toctree::
   :maxdepth: 2
   :caption: Content:

The main interface of the PDT is the command line.


.. _pdt_tlc_config:

config
------

:command:`config [options] [show|get|set]`



Manipulates the PDT configuraion. An initial 'user' configuration is created when a module is initialised in PDT.

Options
+++++++

-e, --environment
  Sub-commands operate on the configuration file for the specifiend envirnment.

  .. admonition:: Examples

     ``pdt config -e DEV get logger.filename`` will return the configuration value appropriate for the ``DEV`` environment. This could be from user's defaults ``pdt.config.json`` or the environment specific ``pdt.dev.config.json``.

     ``pdt config -e DEV set logger.filename my-pdt.log`` will set the ``logger.filename`` to ``my-pdt.log`` in the ``pdt.dev.config.json`` file.

  .. note:: The environment value is normalised to lowercase (see examples above).



config show
~~~~~~~~~~~

:command:`config show [options]`

Shows the current status including:

- Defaults supplied 'out of the box' by PTD

- User supplied defaults from user config file

- User supplied values from environment variables

   - From shell
   - From ``.env``


Options
+++++++

-s, --source
  Show where each configuration value was assigned.



config get
~~~~~~~~~~

:command:`config get [options] PARAM`

**PARAM**
  The configuration parameter to be returned.

  Returns an error if the ``PARAM`` does not exist.

Options
+++++++

-s, --source
  Show where each configuration value was assigned.


config set
~~~~~~~~~~

:command:`config set PARAM VALUE`

**PARAM**
  The configuration parameter to be set. This is a simple dot-separated path within this configuration.

**VALUE**
  The value to be assigned to the ``PARAM``.

  Strings containing spaces should be enclosed in quotation marks (single of double).


.. _pdt_tlc_pack:

pack
----

:command:`pack [list|import|export|reconcile]`



Manipulates Foundry compendium databases (commonly referred to as 'packs').





pack list
~~~~~~~~~

:command:`pack list [options]`

Lists packs currently in the :term:`PUD`.

Unless the :option:`pack list --configured` option it used


Options
+++++++

-c, --configured        Limit the packs to those configured in the ``module.json``.
   




pack import
~~~~~~~~~~~

   
:command:`pack import [options] [SRC] [DST]`

One or both of ``SRC`` or ``DST`` must be provided. In only one is provided the other will be inferred from the :term:`PUD`.


Parameters
++++++++++

**SRC**

   The source for the pack. This can be an absolute or relative path. By default relative paths are relative to the currently configured :ref:`pdt_conf_pack_src_root`
   
**DST**

   Destintation to which the ``SRC`` will be exported.




Options
+++++++




pack export
~~~~~~~~~~~

:command:`pack export [options] [SRC] [DST]`

One or both of ``SRC`` or ``DST`` must be provided. In only one is provided the other will be inferred from the :term:`PUD`.

By default the ``DST`` is deleted before the export, see :option:`pack export --keep`.

**SRC**

**DST**

Options
+++++++

--keep         Leaves the ``DST`` intact at the start of the export. Existing files *are* overwritten but none are deleted.


pack reconcile
~~~~~~~~~~~~~~

:command:`pack reconcile [options] [SRC] [DST]`

One or both of ``SRC`` or ``DST`` must be provided. In only one is provided the other will be inferred from the :term:`PUD`.


**SRC**

**DST**



Options
+++++++




.. _pdt_tlc_server:

server
------

:command:`server [init|launch]`

Controls a Foundry VTT instance.


server init
~~~~~~~~~~~

:command:`server init`


server launch
~~~~~~~~~~~~~~

:command:`server launch`


server status
~~~~~~~~~~~~~

:command:`server status`


