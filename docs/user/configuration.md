# Configuring PDT

## Custom configuration file

The simplest way to manage the PDT configuration is using the {ref}`pdt_tlc_config` command.

`pdt` assumes configuration files are found in the user's home directory and the project root (typically the directory containing `package.json` or the `.git` directory) unless `PDT_CONFIG_DIR` is set, in which case `pdt` will look in that directory for all configuration files.

Configuration files can be provided in a number of formats.

- `.pdt.[yml|yaml]` YAML
- `.pdt.json` JSON

If the environment variable `PDT_ENVIRONMENT` is assigned the corresponding configuration file is loaded and merged into any existing configuration.

:::{admonition} Example
If `PDT_ENVIRONMENT=DEV` then `.pdt.dev.json` will be loaded if present.

If `.pdt.yml` also exists then the configuration will be loaded in the following order (values in later files overriding earlier):

1. Defaults defined in PDT.
2. `~/.pdt.json` user's default
3. `.pdt.yml` project default
4. `~/.pdt.dev.json` user's dev config
5. `.pdt.dev.json` project's dev config
:::

It is an error to provide several configuration files with the same base name, but different format extensions. For example, providing a `.pdt.yml` and a `.pdt.json` is invalid. PDT will error and refuse to run.

## Environment Variables

Any configuration value can be assigned using an environment variable. To form the name of the corresponding environment variable:

1. Replace `.` with `_`
2. All characters to UPPERCASE
3. Prefix with `PDT_`

The configuration value `logger.filename` becomes environment variable `PDT_LOGGER_FILENAME`.

### Using `.env` files

A `.env` file can be provided. This will be loaded *AFTER* the configuration files and *BEFORE* any environment variable from the shell.

If `PDT_ENVIRONMENT` is set in the shell, the corresponding `.env` is loaded *in preference to* `.env`.

`PDT_ENVIRONMENT=DEV` then `.env.dev` is loaded and `.env` is ignored.

:::{note}
The `PDT_ENVIRONMENT` is normalised to lowercase and suffixed to `.env.`
:::

## PDT runtime configuration

PDT uses the `~/.pdt` directory to store runtime data. For example, tracking all project controlled docker instances.
