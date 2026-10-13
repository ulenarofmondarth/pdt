# Installing PDT

## Using `npm`

:::{admonition} Prerequisite
You will need `npm` installed, this will be installed alongside `nodejs` (also required).
:::

The PDT can be installed with `npm`:

```shell
npm install -g pdt
```

## Recommended installs

While installing the main package provides access to most functions the following installations are recommended as they support some PDT functions.

(install-docker)=

## Docker

`docker` is used to support clean segregation of the Foundry VTT server, ensuring that it does not interfere with any existing Foundry installations.

To install `docker` visit <https://www.docker.com/>

:::{note}
Without `docker` installed the following commands will not work:

- {ref}`pdt_tlc_vtt`
:::
