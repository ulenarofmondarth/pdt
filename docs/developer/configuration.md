# Configuration

The `@util/config.ts` modules uses [node-config](https://www.npmjs.com/package/config) to provide the configuration for {{pdt}}.

This configuration applies to {{pdt}} globally. Each project also maintains its own {ref}`Runtime Configuration <runtime-configuration>`.

The {ref}`pdt_tlc_config` command displays and modifies this configuration.

```{mermaid}
:align: center
:caption: How configuration cascades

block-beta
  columns 2
  block
    columns 2
    c["user"]
    c1["<i>usrdata</i>/pdt"]
    b["internal"]:2
  end
  ar<["more</br>global</br>&nbsp;</br>"]>(down)
```

(runtime-configuration)=

## Runtime Configuration

In addition to user supplied configuration {{pdt}} also uses a runtime configuration. This is, by default, held in the `.pdt` directory in the root of each project that is using {{pdt}}. A 'global' runtime configuration is maintained in the application data directory. This global data coordinates things like port assignments across all projects.

This runtime configuration is maintained by {{pdt}} and should not generally be edited by the user. Instead the various commands in {{pdt}} will manipulate the runtime configuration.

The {ref}`pdt_tlc_info` command displays this runtime configuration.

```{mermaid}
:align: center
:caption: Runtime configuration

block-beta
  columns 2
  c["project"]
  c1["<i>path/to/project</i>/.pdt"]
  d["global"]
  d1["<i>usrdata</i>/pdt/rt"]
```
