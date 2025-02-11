Configuring PDT
===============


.. toctree::
   :maxdepth: 2
   :caption: Content:

Custom configuration file
-------------------------

The simplest way to managed the PDT configuration it using the :ref:`pdt_tlc_config` command.

``pdt`` assumes configuration files are found in the project root (typically the directory containing ``package.json`` or the ``.git`` directory) unless ``PDT_CONFIG_DIR`` is set, in which case ``pdt`` will look in that directory for all configuration files.

Configuration files can be provided in a number of formats.

- ``pdt.config``  Simple key value.
- ``pdt.config.[yml|yaml]``]  YAML
- ``pdt.config.json``  JSON

If the environment variable ``PDT_ENVIRONMENT`` is assigned the corresponding configuration file is loaded and merged into any existing configuration.

.. admonition:: Example

   If ``PDT_ENVIRONMENT=DEV`` then ``pdt.dev.config.json`` will be loaded if present.

   If ``pdt.config.yml`` also exists the the configuration will be loaded in the following order (values in later files overriding earlier):

   1. Defaults defined in PDT.
   2. ``pdt.config.yml``
   3. ``pdt.dev.config.json``

If you provide several configuration files with the same base name, but different format extensions, they are loaded in the order shown above (later overriding earlier).

.. caution:: Although this is supported it is generally a bad idea as it can be confusing.


Environment Variables
---------------------

Any configuration value can be assigned using an environtment variable. To form the name of the correspondeng environment variable:

1. Replace ``.`` with ``_``
2. All characters to UPPERCASE
3. Prefix with ``PDT_``

The configuration value ``logger.filename`` becomes environment variable ``PDT_LOGGER_FILENAME``.


Using ``.var`` files
~~~~~~~~~~~~~~~~~~~~

A ``.var`` file can be provided. This will be loaded *AFTER* the configuration files and *BEFORE* any environment variable from the shell.

If ``PDT_ENVIRONMENT`` is set in the shell, the corresponding ``.env`` is loaded *in preference to* ``.env``.

``PDT_ENVIRONMENT=DEV`` then ``.env.dev`` is loaded and ``.env`` is ignored.

.. note:: The ``PDT_ENVIRONMENT`` is normalised to lowercase and suffixed to ``.env.``
