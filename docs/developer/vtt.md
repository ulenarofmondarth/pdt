# VTT servers and hosts

{{pdt}} runs a Foundry VTT server for a project. Two kinds of object share the work:

- a **server** (`VTTServer`, in `src/lib/VTT`) is the VTT application: its name and settings, such as the Foundry VTT version to run;
- a **host** (`VTTHost`) is where servers run, and does the starting and stopping. The only host so far is `DockerHost`, which runs each server in a Docker container.

Both are built from the validated configuration. Each entry under `VTT` names a server and its host:

```typescript
const vtt = config.VTT['prj'];
const host = createHost(vtt.host);
const server = createServer('prj', vtt.server, host);

await server.start();
```

The settings types (`FoundryServerSettings`, `DockerHostSettings`, ...) come from the zod schema in `src/schema/config.ts`, so a setting is declared once, and the configuration and the code cannot disagree about it.

## Lifecycle

`start()`, `stop()` and `restart()` on a server ask its host, passing the server, and return a promise that settles when the host has finished. A host that cannot do what it is asked rejects; nothing is reported as done that was not done. `DockerHost` cannot stop or restart a server yet, and says so.

## The Docker host

For a server named `prj` with version `13.351`, `DockerHost.start`:

1. works out the image, `[repository/]image:13.351` (the image is `felddy/foundryvtt` unless the settings name another), and refuses a server without a version, as an untagged pull would fetch every tag;
2. pulls the image unless the engine already has it;
3. starts the container named `prj`, creating it first if there is none, and leaves it alone if it is already running.

A failure at any step rejects with a message naming the image or the server, and the engine's error as its `cause`.

## Testing

`DockerHost` takes its Docker client as an argument, so tests give it a stand-in from `tests/unit/mocks/dockerode.ts` and no test reaches a real engine:

```typescript
const docker = createDockerMock();
const host = new DockerHost(settings, asDocker(docker));
```

Servers take their host the same way; `createHostMock()` in `tests/unit/mocks/vttHost.ts` records what a server asks of it.
