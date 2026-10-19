# VTT servers and hosts

{{pdt}} runs a Foundry VTT server for a project. Two kinds of object share the work:

- a **server** (`VTTServer`, in `src/lib/VTT`) is the VTT application: its name and settings, such as the Foundry VTT version to run;
- a **host** (`VTTHost`) is where servers run, and does the starting and stopping. The only host so far is `DockerHost`, which runs each server in a Docker container.

Both are built from the validated configuration. Each entry under `VTT` names a server and its host, and `createVtt` (`src/lib/VTT/createVtt.ts`) builds both:

```typescript
const server = createVtt('arcane-ledger', config.VTT['arcane-ledger'], config.FOUNDRY);

const handle = await server.start({
  name: 'pdt-arcane-ledger',
  port: 30002,
  environment: server.environment(),
  mounts: [{ source: '/home/me/.local/share/pdt/vtt/pdt-arcane-ledger', target: server.dataPath }],
});
await server.host.isRunning(handle);
await server.host.stop(handle);
```

No VTT is built in: `pdt init` writes one into the project's configuration, named by the project id (the module's id; see `src/cli/cmds/init.ts`) and running the Foundry VTT version from `.foundryvtt/.env` (`src/lib/projectVtt.ts`; `vttSettings(version)` holds the settings it uses).

Commands get `createVtt` from their context (see {doc}`commands`), so their tests give them VTTs on a stand-in host. They get `isPortFree`, `isUrlReachable` and `owner` (the uid and gid pdt runs as, from `src/index.ts`) the same way, so no test binds a real port, makes a request, or depends on who runs it.

A server says what its application needs from a host, so a host need not know the application: `internalPort`, `dataPath` and `modulePath(id)` (where it serves, keeps its data and finds a module, inside the host), `urlAt(port)`, and `environment()`, the variables to start it with. `FoundryVTTServer` follows the felddy/foundryvtt image: data in `/data`, modules in `/data/Data/modules`, and `FOUNDRY_USERNAME`, `FOUNDRY_PASSWORD`, `FOUNDRY_LICENSE_KEY` and `FOUNDRY_ADMIN_KEY`, from the `FOUNDRY` account and the server's `admin_key`. The environment holds secrets: it goes to the host and nowhere else, never into the run state, the output or the log.

The settings types (`FoundryServerSettings`, `DockerHostSettings`, ...) come from the zod schema in `src/schema/config.ts`, so a setting is declared once, and the configuration and the code cannot disagree about it.

## Lifecycle

A host runs a server under a name and on a port it is given, and returns a `RunHandle`, `{ id }`, its own id for what runs it (a container's id). `isRunning(handle)` and `stop(handle)` find it by that handle. `stop` stops it and removes it, and what has stopped or is gone already is not an error. There is no restart on a host: restarting is stopping and starting, so that changed settings take effect. A host that cannot do what it is asked rejects; nothing is reported as done that was not done.

`pdt vtt start`, `stop` and `restart` share `src/cli/cmds/vtt_cmds/lifecycle.ts`:

- `chooseVtt` picks the VTT: the one given, else the first the project's files set (by `sourceOf`), else the first configured.
- `startVtt` checks the host can be reached, then looks up the VTT in the project's run state (`runningVtt` in `@util/run-state.ts`). A recorded VTT that is running is left alone; one that is not is stopped (cleared up) and forgotten. It then works out the port (`findFreePort` in `@util/ports.ts` for `auto`, or checks the set port is free), names the instance (`instanceName`), makes its data directory (`vttDataDir`, in the user data directory) and the module's mount point inside it (so that Docker does not make it owned by root), starts the server with its environment and mounts, and records `{ id, name, port, url, started }` (`recordRunningVtt`). It then waits (`waitUntilReachable` in `@util/reachable.ts`) until the URL answers, the host says the instance has stopped, or the server's `ready.timeout` seconds pass; the record is written before the wait, so a VTT that does not answer can still be stopped.
- `stopVtt` stops and forgets the recorded VTT, and asks nothing of the host when there is no record.
- `restartVtt` stops, then starts.
- `runningProjectVtts` and `stopAllVtts` work on every VTT the run state records, for `move` and `force-reset`. A recorded VTT that is no longer configured cannot be asked or stopped: it counts as running, and `stopAllVtts` forgets it with a warning naming its container.

The record is written only once the host has started the VTT, and removed only once the host has stopped it, so a failure leaves the run state as it was.

## The Docker host

For a server with version `14.368.0`, run as `pdt-arcane-ledger` on port 30002, `DockerHost.start`:

1. works out the image, `[repository/]image:14.368.0` (the image is `felddy/foundryvtt` unless the settings name another), and refuses a server without a version, as an untagged pull would fetch every tag;
2. pulls the image unless the engine already has it;
3. refuses if a container named `pdt-arcane-ledger` is running, and removes one that has stopped;
4. creates the container, publishing the server's `internalPort` (30000 for Foundry VTT) on port 30002, with the environment as `Env`, the mounts as bind mounts and, given a user, as that user (`User`), starts it, and returns its id.

`DockerHost.stop` stops the container and removes it; a container that has stopped (304) or is gone (404) is not an error.

A failure at any step rejects with a message naming the image, the server or the container and giving the engine's reason, with the engine's error as its `cause`.

## Testing

`DockerHost` takes its Docker client as an argument, so tests give it a stand-in from `tests/unit/mocks/dockerode.ts` and no test reaches a real engine:

```typescript
const docker = createDockerMock();
const host = new DockerHost(settings, asDocker(docker));
```

Servers take their host the same way; `createHostMock()` in `tests/unit/mocks/vttHost.ts` records what a server asks of it.
